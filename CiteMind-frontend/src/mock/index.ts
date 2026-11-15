// ═══════════════════════════════════════════════════════════════════════════
// Mock 总入口：axios Mock 适配器 + 全量路由表
// ───────────────────────────────────────────────────────────────────────────
// 【为什么存在这个文件】
// 本仓库是「界面骨架 + 演示模式」仓库：后端业务实现已剥离，为了让所有前端页面
// 无需后端即可运行、联调、截图，这里内置了一个与真实后端契约一致的 Mock 服务。
//
// 【工作原理】
// axios 支持自定义 adapter。USE_MOCK 为 true 时，http.ts 会把全局 axios 实例的
// adapter 替换为本文件导出的 createMockAdapter()，此后所有经过 http 实例的请求
// 都不再发出真实网络请求，而是按下面的路由表匹配并返回演示数据。
//
// 【如何切换到真实后端】
// 1. 把 CiteMind-frontend/.env 中的 VITE_USE_MOCK 改为 false；
// 2. 确保 VITE_API_BASE_URL 指向后端（默认 /api，走 Vite 代理到 10001 端口）；
// 3. 重启 dev server。除两个 SSE 流式接口外，其余请求都由真实后端处理。
//
// 【契约对齐】
// 每个路由的返回值严格对齐 src/api/*.ts 中对应函数的解包逻辑：
// - 有的接口走 ApiResponse { success, data, message } 包裹；
// - 有的接口后端直接返回数据本体（如 GET /assistant/sessions 返回数组）。
// 对齐错误会导致页面解析失败 —— 修改路由时请对照 api 层函数注释。
// ═══════════════════════════════════════════════════════════════════════════

import type { AxiosAdapter, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { AxiosError } from 'axios'
import * as fixtures from './fixtures'

// ─────────────────────────────────────────────────────────────────────────────
// 开关与工具
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mock 总开关。
 * 优先级：环境变量 VITE_USE_MOCK 显式为 'false' 时关闭 Mock，其余一律开启。
 * （默认开启：保证 clone 即可运行看到所有界面。）
 */
export const USE_MOCK: boolean = import.meta.env.VITE_USE_MOCK !== 'false'

/** 统一的成功响应包裹（对应后端 ApiResponse.success(data)） */
function ok<T>(data: T) {
  return { success: true, data, message: null }
}

/** 统一的失败响应包裹（对应后端 GlobalExceptionHandler 的错误响应） */
function fail(message: string) {
  return { success: false, data: null, message }
}

/** 模拟网络延迟：演示模式下让 loading 态可见，范围 120~420ms */
function latency(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 120 + Math.random() * 300))
}

/** 构造带 HTTP 状态码的错误响应（axios 会对其抛 AxiosError） */
function statusError(config: InternalAxiosRequestConfig, status: number, message: string): AxiosResponse {
  return {
    data: fail(message),
    status,
    statusText: message,
    headers: {},
    config,
  }
}

/** 生成一个假的 JWT 形态 token（仅演示，无签名语义） */
function fakeJwt(userId: number): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = btoa(
    JSON.stringify({ sub: String(userId), iss: 'citemind-rag', exp: Date.now() + 1800_000 }),
  )
  return `mock.${header}.${payload}`
}

// ─────────────────────────────────────────────────────────────────────────────
// 路由处理器的输入上下文
// ─────────────────────────────────────────────────────────────────────────────

interface RouteContext {
  /** URL 路径（不含查询串），如 /documents/101/preview */
  path: string
  /** 解析后的查询参数 */
  query: URLSearchParams
  /** 请求体（JSON 对象 / FormData / null） */
  body: unknown
  /** 完整 axios 配置（含 params 等） */
  config: InternalAxiosRequestConfig
  /** 路径正则的匹配结果（捕获组，用于提取 ID 等路径参数） */
  match: string[]
}

type RouteHandler = (ctx: RouteContext) => unknown

interface RouteEntry {
  method: string
  /** 正则匹配路径（捕获组可在 handler 中通过 match 结果引用） */
  pattern: RegExp
  handler: RouteHandler
}

/** 从 axios 配置中提取请求体：FormData 原样返回，JSON 字符串尝试反序列化 */
function extractBody(config: AxiosRequestConfig): unknown {
  const raw = config.data
  if (raw == null) {
    return null
  }
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }
  return raw
}

// ─────────────────────────────────────────────────────────────────────────────
// 路由表
// ─────────────────────────────────────────────────────────────────────────────
// 顺序即优先级；路径正则使用 /documents\/(\d+)\/preview 形式做段匹配。

const routes: RouteEntry[] = [
  // ═══════════════ 认证与账户 ═══════════════
  {
    method: 'POST',
    pattern: /^\/auth\/login$/,
    handler: ({ body }) => {
      const payload = body as { loginId?: string; password?: string }
      const loginId = (payload?.loginId ?? '').trim()
      const password = payload?.password ?? ''
      if (!loginId || !password) {
        return fail('账号与密码不能为空')
      }
      // 演示规则：admin 账号需要 admin123；其余任意账号/密码均可登录（自动注册为 USER）
      let user = fixtures.findUserByLoginId(loginId)
      if (user === null) {
        user = fixtures.registerUser({
          username: loginId,
          email: `${loginId}@citemind.local`,
          displayName: loginId,
        })
      }
      if (user.username === 'admin' && password !== 'admin123') {
        return fail('用户名或密码错误')
      }
      if (user.status === 'DISABLED') {
        return fail('账号已被禁用，请联系管理员')
      }
      fixtures.setCurrentUser(user)
      fixtures.touchUserLastLogin(user.userId)
      return ok({
        accessToken: fakeJwt(user.userId),
        currentUser: fixtures.toProfile(user),
      })
    },
  },
  {
    method: 'POST',
    pattern: /^\/auth\/register$/,
    handler: ({ body }) => {
      const payload = body as { username?: string; email?: string; displayName?: string }
      try {
        fixtures.registerUser({
          username: payload?.username ?? '',
          email: payload?.email ?? '',
          displayName: payload?.displayName ?? '',
        })
        return ok(null)
      } catch (error) {
        return fail((error as Error).message)
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/auth\/refresh$/,
    handler: ({ config }) => {
      // 与真实后端一致：会话不存在时返回 401，前端路由守卫会引导到登录页
      const user = fixtures.getCurrentUser()
      if (user === null) {
        throw statusError(config, 401, '登录状态已过期')
      }
      return ok({
        accessToken: fakeJwt(user.userId),
        currentUser: fixtures.toProfile(user),
      })
    },
  },
  {
    method: 'POST',
    pattern: /^\/auth\/logout$/,
    handler: () => {
      fixtures.setCurrentUser(null)
      return ok(null)
    },
  },
  {
    method: 'GET',
    pattern: /^\/auth\/me$/,
    handler: ({ config }) => {
      const user = fixtures.getCurrentUser()
      if (user === null) {
        throw statusError(config, 401, '未登录')
      }
      return ok(fixtures.toProfile(user))
    },
  },
  {
    method: 'POST',
    pattern: /^\/account\/change-password$/,
    handler: ({ body }) => {
      const payload = body as { currentPassword?: string; newPassword?: string }
      if (!payload?.currentPassword || !payload?.newPassword) {
        return fail('原密码与新密码不能为空')
      }
      if (payload.newPassword.length < 8) {
        return fail('新密码长度不能少于 8 位')
      }
      return ok(null)
    },
  },

  // ═══════════════ 文档管理 ═══════════════
  {
    method: 'GET',
    pattern: /^\/documents$/,
    handler: ({ query }) => {
      const num = (key: string) => {
        const raw = query.get(key)
        return raw !== null && raw !== '' ? Number(raw) : undefined
      }
      const str = (key: string) => {
        const raw = query.get(key)
        return raw !== null && raw !== '' ? raw : undefined
      }
      return ok(
        fixtures.queryDocuments({
          groupId: num('groupId'),
          groupRelation: str('groupRelation'),
          fileName: str('fileName'),
          status: str('status'),
          uploaderUserId: num('uploaderUserId'),
        }),
      )
    },
  },
  {
    method: 'GET',
    pattern: /^\/documents\/(\d+)\/preview$/,
    handler: ({ match, query }) => {
      const groupId = Number(query.get('groupId') ?? 0)
      try {
        return ok(fixtures.getDocumentPreview(Number(match[1]!), groupId))
      } catch (error) {
        return fail((error as Error).message)
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/documents\/(\d+)\/download$/,
    handler: () => {
      // 演示：返回一个文本 Blob，浏览器会以下载方式保存
      const content = 'CiteMind 演示模式 —— 这是文档原始文件的模拟下载内容。'
      return new Blob([content], { type: 'application/octet-stream' })
    },
  },
  // 说明：DELETE /documents/{id} 与 POST /documents/{id}/retry-ingestion 依赖
  // scheduleReady 等工具，统一在 registerSimpleUploadRoutes() 中注册（见下）。

  // ═══════════════ 协作小组 ═══════════════
  {
    method: 'GET',
    pattern: /^\/groups\/my$/,
    handler: () => {
      const user = fixtures.getCurrentUser()
      if (user === null) {
        return fail('未登录')
      }
      return ok(fixtures.queryGroupsFor(user.userId))
    },
  },
  {
    method: 'POST',
    pattern: /^\/groups$/,
    handler: ({ body }) => {
      const user = fixtures.getCurrentUser()
      if (user === null) {
        return fail('未登录')
      }
      const payload = body as { name?: string; description?: string }
      if (!payload?.name?.trim()) {
        return fail('群组名称不能为空')
      }
      return ok(fixtures.createGroup(user.userId, payload.name.trim(), payload.description))
    },
  },
  {
    method: 'GET',
    pattern: /^\/groups\/(\d+)\/members$/,
    handler: ({ match }) => ok(fixtures.listGroupMembers(Number(match[1]!))),
  },
  {
    method: 'DELETE',
    pattern: /^\/groups\/(\d+)\/members\/(\d+)$/,
    handler: ({ match }) => {
      const user = fixtures.getCurrentUser()
      if (user === null) {
        return fail('未登录')
      }
      try {
        fixtures.removeMember(Number(match[1]!), Number(match[2]!), user.userId)
        return ok(null)
      } catch (error) {
        return fail((error as Error).message)
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/groups\/(\d+)\/leave$/,
    handler: ({ match }) => {
      const user = fixtures.getCurrentUser()
      if (user === null) {
        return fail('未登录')
      }
      try {
        fixtures.leaveGroup(Number(match[1]!), user.userId)
        return ok(null)
      } catch (error) {
        return fail((error as Error).message)
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/groups\/(\d+)\/invitations$/,
    handler: ({ match, body }) => {
      const user = fixtures.getCurrentUser()
      if (user === null) {
        return fail('未登录')
      }
      const payload = body as { inviteeUserId?: number }
      try {
        return ok(fixtures.createInvitation(Number(match[1]!), Number(payload?.inviteeUserId), user.userId))
      } catch (error) {
        return fail((error as Error).message)
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/invitations\/(\d+)\/(accept|reject|cancel)$/,
    handler: ({ match }) => {
      const user = fixtures.getCurrentUser()
      if (user === null) {
        return fail('未登录')
      }
      const id = Number(match[1]!)
      const action = match[2] as 'accept' | 'reject' | 'cancel'
      try {
        if (action === 'accept') {
          fixtures.acceptInvitation(id, user.userId)
        } else {
          fixtures.decideInvitation(id, action === 'reject' ? 'REJECTED' : 'CANCELED', user.userId)
        }
        return ok(null)
      } catch (error) {
        return fail((error as Error).message)
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/groups\/invitations\/my-sent$/,
    handler: () => {
      const user = fixtures.getCurrentUser()
      if (user === null) {
        return fail('未登录')
      }
      return ok(fixtures.listMySentInvitations(user.userId))
    },
  },
  {
    method: 'POST',
    pattern: /^\/groups\/join-requests$/,
    handler: ({ body }) => {
      const user = fixtures.getCurrentUser()
      if (user === null) {
        return fail('未登录')
      }
      const payload = body as { groupCode?: string }
      try {
        return ok(fixtures.submitJoinRequest(payload?.groupCode ?? '', user.userId))
      } catch (error) {
        return fail((error as Error).message)
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/groups\/join-requests\/my$/,
    handler: () => {
      const user = fixtures.getCurrentUser()
      if (user === null) {
        return fail('未登录')
      }
      return ok(fixtures.listMyJoinRequests(user.userId))
    },
  },
  {
    method: 'GET',
    pattern: /^\/groups\/(\d+)\/join-requests$/,
    handler: ({ match }) => ok(fixtures.listOwnerJoinRequests(Number(match[1]!))),
  },
  {
    method: 'POST',
    pattern: /^\/groups\/(\d+)\/join-requests\/(\d+)\/(approve|reject)$/,
    handler: ({ match }) => {
      const user = fixtures.getCurrentUser()
      if (user === null) {
        return fail('未登录')
      }
      try {
        fixtures.decideJoinRequest(
          Number(match[1]!),
          Number(match[2]!),
          match[3]! === 'approve' ? 'APPROVED' : 'REJECTED',
          user.userId,
        )
        return ok(null)
      } catch (error) {
        return fail((error as Error).message)
      }
    },
  },

  // ═══════════════ 问答历史（流式 /ask 由 streams.ts 分支处理） ═══════════════
  {
    method: 'GET',
    pattern: /^\/qa\/records$/,
    handler: ({ query }) => {
      const num = (key: string) => {
        const raw = query.get(key)
        return raw !== null && raw !== '' ? Number(raw) : undefined
      }
      const answeredRaw = query.get('answered')
      return ok(
        fixtures.pageQaRecords({
          groupId: num('groupId'),
          answered: answeredRaw === null || answeredRaw === '' ? undefined : answeredRaw === 'true',
          page: num('page'),
          pageSize: num('pageSize'),
        }),
      )
    },
  },
  {
    method: 'GET',
    pattern: /^\/qa\/records\/(\d+)$/,
    handler: ({ match }) => {
      const record = fixtures.qaRecords.find((r) => r.id === Number(match[1]!))
      return record ? ok(record) : fail('问答记录不存在')
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/qa\/records\/(\d+)$/,
    handler: ({ match }) => {
      fixtures.deleteQaRecord(Number(match[1]!))
      return ok(null)
    },
  },

  // ═══════════════ AI 助手会话（流式 chat 由 streams.ts 分支处理） ═══════════════
  {
    method: 'POST',
    pattern: /^\/assistant\/sessions$/,
    handler: () => {
      const user = fixtures.getCurrentUser()
      if (user === null) {
        return fail('未登录')
      }
      return ok(fixtures.createSession(user.userId))
    },
  },
  {
    method: 'GET',
    pattern: /^\/assistant\/sessions$/,
    handler: () => {
      const user = fixtures.getCurrentUser()
      if (user === null) {
        return fail('未登录')
      }
      // 注意：此接口后端直接返回数组（无 ApiResponse 包裹）
      return fixtures.listSessions(user.userId)
    },
  },
  {
    method: 'GET',
    pattern: /^\/assistant\/sessions\/(\d+)\/context$/,
    handler: ({ match }) => {
      const user = fixtures.getCurrentUser()
      if (user === null) {
        return fail('未登录')
      }
      return fixtures.getSessionContext(Number(match[1]!), user.userId)
    },
  },
  {
    method: 'GET',
    pattern: /^\/assistant\/sessions\/(\d+)$/,
    handler: ({ match, config }) => {
      const user = fixtures.getCurrentUser()
      const detail = user !== null ? fixtures.getSessionDetail(Number(match[1]!), user.userId) : null
      if (detail === null) {
        // 列表接口为裸数组返回，同样该接口为裸对象返回 —— 404 直接抛出
        throw statusError(config, 404, '会话不存在')
      }
      return detail
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/assistant\/sessions\/(\d+)$/,
    handler: ({ match, body }) => {
      const user = fixtures.getCurrentUser()
      if (user === null) {
        return fail('未登录')
      }
      const payload = body as { title?: string }
      try {
        return ok(fixtures.renameSession(Number(match[1]!), payload?.title ?? '', user.userId))
      } catch (error) {
        return fail((error as Error).message)
      }
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/assistant\/sessions\/(\d+)$/,
    handler: ({ match }) => {
      const user = fixtures.getCurrentUser()
      if (user === null) {
        return fail('未登录')
      }
      try {
        fixtures.deleteSession(Number(match[1]!), user.userId)
        return ok(null)
      } catch (error) {
        return fail((error as Error).message)
      }
    },
  },

  // ═══════════════ 管理员 · 用量统计 ═══════════════
  {
    method: 'GET',
    pattern: /^\/admin\/metrics\/overview$/,
    handler: () => ok(fixtures.metricsOverview()),
  },
  {
    method: 'GET',
    pattern: /^\/admin\/metrics\/platform$/,
    handler: ({ query }) => ok(fixtures.platformStats(query.get('period') ?? 'LAST_30_DAYS')),
  },
  {
    method: 'GET',
    pattern: /^\/admin\/metrics\/(user|group)\/(\d+)$/,
    handler: ({ query }) => ok(fixtures.platformStats(query.get('period') ?? 'LAST_30_DAYS')),
  },
  {
    method: 'GET',
    pattern: /^\/admin\/metrics\/trend$/,
    handler: () => ok(fixtures.metricsOverview().dailyTrend),
  },
  {
    method: 'GET',
    pattern: /^\/admin\/metrics\/rank\/users$/,
    handler: ({ query }) => ok(fixtures.userRank(Number(query.get('limit') ?? 10))),
  },
  {
    method: 'GET',
    pattern: /^\/admin\/metrics\/rank\/groups$/,
    handler: ({ query }) => ok(fixtures.groupRank(Number(query.get('limit') ?? 10))),
  },

  // ═══════════════ 管理员 · 用户管理 ═══════════════
  {
    method: 'GET',
    pattern: /^\/admin\/users$/,
    handler: () => ok(fixtures.users.map(fixtures.toAdminUserItem)),
  },
  {
    method: 'GET',
    pattern: /^\/admin\/users\/(\d+)$/,
    handler: ({ match }) => {
      const user = fixtures.users.find((u) => u.userId === Number(match[1]!))
      return user ? ok(fixtures.toAdminUserItem(user)) : fail('用户不存在')
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/admin\/users\/(\d+)\/status$/,
    handler: ({ match, body }) => {
      const user = fixtures.users.find((u) => u.userId === Number(match[1]!))
      if (!user) {
        return fail('用户不存在')
      }
      const payload = body as { status?: 'ACTIVE' | 'DISABLED' }
      if (payload?.status !== 'ACTIVE' && payload?.status !== 'DISABLED') {
        return fail('非法的状态值')
      }
      user.status = payload.status
      return ok(null)
    },
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// 适配器实现
// ─────────────────────────────────────────────────────────────────────────────

/** 分片上传会话的内存记录：uploadId → 已上传分片集合与元信息 */
const uploadSessions = new Map<
  string,
  { chunkCount: number; chunkSize: number; uploaded: Set<number>; groupId: number; fileName: string; fileSize: number; contentType: string }
>()

// 分片上传相关路由需要依赖内存中的会话表，单独注册（放在通用路由之后无法表达，
// 因此这里以「显式 handler + 共享状态」方式并入主路由表上方声明，见 routes 内引用）
function registerUploadRoutes(): void {
  routes.push(
    {
      method: 'POST',
      pattern: /^\/documents\/upload\/init$/,
      handler: ({ body }) => {
        const user = fixtures.getCurrentUser()
        if (user === null) {
          return fail('未登录')
        }
        const payload = body as {
          groupId: number
          fileName: string
          fileSize: number
          contentType: string
          chunkSize: number
          chunkCount: number
        }
        const uploadId = `up_${Date.now()}_${Math.round(Math.random() * 1e6)}`
        uploadSessions.set(uploadId, {
          chunkCount: payload.chunkCount,
          chunkSize: payload.chunkSize,
          uploaded: new Set(),
          groupId: payload.groupId,
          fileName: payload.fileName,
          fileSize: payload.fileSize,
          contentType: payload.contentType,
        })
        return ok({
          instantUpload: false, // 演示模式不触发秒传（可自行将 hash 命中逻辑加到这里）
          documentId: null,
          uploadId,
          uploadedChunks: [],
          chunkSize: payload.chunkSize,
          chunkCount: payload.chunkCount,
        })
      },
    },
    {
      method: 'POST',
      pattern: /^\/documents\/upload\/chunks$/,
      handler: ({ body, query }) => {
        // FormData：uploadId / chunkIndex / chunkHash / chunk
        const form = body instanceof FormData ? body : null
        const uploadId = String(form?.get('uploadId') ?? query.get('uploadId') ?? '')
        const chunkIndex = Number(form?.get('chunkIndex') ?? 0)
        const session = uploadSessions.get(uploadId)
        if (!session) {
          return fail('上传会话不存在或已过期')
        }
        session.uploaded.add(chunkIndex)
        return ok({
          status: 'UPLOADING',
          uploadedChunks: [...session.uploaded].sort((a, b) => a - b),
          uploadedChunkCount: session.uploaded.size,
          chunkCount: session.chunkCount,
        })
      },
    },
    {
      method: 'GET',
      pattern: /^\/documents\/upload\/([^/]+)$/,
      handler: ({ match }) => {
        const session = uploadSessions.get(match[1]!)
        if (!session) {
          return fail('上传会话不存在或已过期')
        }
        return ok({
          status: 'UPLOADING',
          uploadedChunks: [...session.uploaded].sort((a, b) => a - b),
          uploadedChunkCount: session.uploaded.size,
          chunkCount: session.chunkCount,
        })
      },
    },
    {
      method: 'POST',
      pattern: /^\/documents\/upload\/([^/]+)\/complete$/,
      handler: ({ match }) => {
        const user = fixtures.getCurrentUser()
        if (user === null) {
          return fail('未登录')
        }
        const session = uploadSessions.get(match[1]!)
        if (!session) {
          return fail('上传会话不存在或已过期')
        }
        if (session.uploaded.size < session.chunkCount) {
          return fail(`仍有 ${session.chunkCount - session.uploaded.size} 个分片未上传`)
        }
        const doc = fixtures.addProcessingDocument({
          groupId: session.groupId,
          fileName: session.fileName,
          fileSize: session.fileSize,
          contentType: session.contentType,
          uploaderUserId: user.userId,
        })
        uploadSessions.delete(match[1]!)
        scheduleReady(doc.documentId)
        return ok(doc.documentId)
      },
    },
  )
}

/**
 * 模拟 ETL 异步处理：4.5 秒后把 PROCESSING 文档置为 READY。
 * 让「上传 → 处理中 → 就绪可检索」的状态流转在演示里可见。
 */
function scheduleReady(documentId: number): void {
  setTimeout(() => fixtures.markDocumentReady(documentId), 4500)
}

// 小文件直传与状态查询路由（依赖 uploadSessions / scheduleReady，一并注册）
function registerSimpleUploadRoutes(): void {
  routes.push(
    {
      method: 'POST',
      pattern: /^\/documents\/upload$/,
      handler: ({ body }) => {
        const user = fixtures.getCurrentUser()
        if (user === null) {
          return fail('未登录')
        }
        const form = body instanceof FormData ? body : null
        const groupId = Number(form?.get('groupId') ?? 0)
        const file = form?.get('file') as File | null
        if (!file) {
          return fail('缺少文件')
        }
        const doc = fixtures.addProcessingDocument({
          groupId,
          fileName: file.name,
          fileSize: file.size,
          contentType: file.type || 'application/octet-stream',
          uploaderUserId: user.userId,
        })
        scheduleReady(doc.documentId)
        return ok(doc.documentId)
      },
    },
    {
      method: 'DELETE',
      pattern: /^\/documents\/(\d+)$/,
      handler: ({ match, query }) => {
        fixtures.deleteDocument(Number(match[1]!), Number(query.get('groupId') ?? 0))
        return ok(null)
      },
    },
    {
      method: 'POST',
      pattern: /^\/documents\/(\d+)\/retry-ingestion$/,
      handler: ({ match, query }) => {
        try {
          void query
          fixtures.retryDocument(Number(match[1]!))
          // 重试成功后同样模拟异步处理完成
          setTimeout(() => fixtures.markDocumentReady(Number(match[1]!)), 4500)
          return ok(null)
        } catch (error) {
          return fail((error as Error).message)
        }
      },
    },
  )
}

registerUploadRoutes()
registerSimpleUploadRoutes()

// 助手同步聊天：委托 streams.ts（会做消息落库），包一层 ApiResponse
// 放在最后注册，避免与会话路由冲突（路径不同，实际无冲突，此处仅保持顺序清晰）
// —— chat/stream 是 Fetch SSE，不走 axios，见 api/assistant.ts 的分支说明。

/**
 * 创建 Mock 适配器（供 http.ts 安装到 axios 实例上）
 *
 * 返回符合 axios adapter 签名的函数：接收 config，返回 AxiosResponse 或抛 AxiosError。
 */
export function createMockAdapter(): AxiosAdapter {
  return async (config) => {
    await latency()

    const method = (config.method ?? 'get').toUpperCase()
    // axios 的 url 是相对 baseURL 的路径（如 /auth/login），先剥掉可能存在的查询串
    const rawUrl = config.url ?? ''
    const splitIndex = rawUrl.indexOf('?')
    const pathPart = splitIndex >= 0 ? rawUrl.slice(0, splitIndex) : rawUrl
    const query = new URLSearchParams(splitIndex >= 0 ? rawUrl.slice(splitIndex + 1) : '')
    // config.params 中的参数也被 api 层大量使用，合并进查询串
    if (config.params && typeof config.params === 'object') {
      for (const [k, v] of Object.entries(config.params as Record<string, unknown>)) {
        if (v !== undefined && v !== null && String(v) !== '') {
          query.set(k, String(v))
        }
      }
    }

    const entry = routes.find((r) => r.method === method && r.pattern.test(pathPart))
    if (!entry) {
      // 未收录的接口：返回 404，便于发现「Mock 路由漏配」的问题
      throw new AxiosError(
        `Mock 路由未收录：${method} ${pathPart}`,
        'ERR_BAD_REQUEST',
        config,
        {},
        statusError(config, 404, `Mock 路由未收录：${method} ${pathPart}`),
      )
    }

    let payload: unknown
    try {
      payload = entry.handler({
        path: pathPart,
        query,
        body: extractBody(config),
        config,
        match: pathPart.match(entry.pattern) ?? [],
      })
    } catch (error) {
      // handler 中显式抛出的 AxiosResponse（如 401）转为 AxiosError，保持 axios 语义
      if (error instanceof AxiosError) {
        throw error
      }
      if (typeof error === 'object' && error !== null && 'status' in error) {
        throw new AxiosError(
          (error as AxiosResponse).statusText ?? 'Request failed',
          'ERR_BAD_REQUEST',
          config,
          {},
          error as AxiosResponse,
        )
      }
      throw error
    }

    // Blob 响应（文档下载）：不包 ApiResponse，直接返回
    if (payload instanceof Blob) {
      const response: AxiosResponse<Blob> = {
        data: payload,
        status: 200,
        statusText: 'OK',
        headers: { 'content-disposition': 'attachment; filename="citemind-demo.txt"' },
        config,
      }
      return response
    }

    const response: AxiosResponse = {
      data: payload,
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }
    return response
  }
}
