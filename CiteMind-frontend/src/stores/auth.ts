// ═══════════════════════════════════════════════════════════════
// 文件头说明（认证 Store：会话恢复 / 登录 / 登出 / 权限跳转）
// ───────────────────────────────────────────────────────────────
// ① 职责与所属路由：
//    全局唯一的认证状态源：会话引导恢复（bootstrap）、登录（login）、
//    登出（logout）、静默续期（refresh）、修改密码（changePassword），
//    并提供按角色约束的落地页 / 重定向计算（resolveAuthorizedPath、
//    resolveRoleRedirect）。无固定路由，被 router 全局守卫、App.vue、
//    LoginView / LoginModal、DefaultLayout 等消费。
// ② 依赖的 api / store：
//    - ../api/auth：login / logout / refreshSession / fetchCurrentUser /
//      changePassword 及相关类型
//    - ../api/http：axios 实例（统一写入 / 清除 Authorization 请求头）
// ③ Token 机制（重要）：
//    - accessToken 只保存在本 store 的内存态（accessToken state）中，
//      刷新页面即丢失，绝不写入 localStorage / sessionStorage，
//      以降低 XSS 窃取风险；每次 setSession / clearSession 都同步
//      增删 axios 的 Authorization: Bearer 请求头；
//    - Refresh Token 由真实后端通过 HttpOnly Cookie 下发并管理，
//      前端 JS 不可读也不需要读；页面刷新后 accessToken 为空 →
//      runBootstrap 调 refreshSession()，浏览器自动携带该 Cookie
//      向后端换取新的 accessToken，实现「无感恢复会话」；
//    - Mock 模式下由 src/mock/ 拦截上述接口，用内存会话模拟同样的
//      「Cookie 续期 + 内存 accessToken」流程，前端代码无需感知差异。
// ④ 调用时机与角色规则：
//    - bootstrap：路由全局守卫每次导航时调用（幂等 + 并发去重）；
//    - login：LoginView / LoginModal 表单提交时调用；
//    - logout：DefaultLayout 用户菜单「退出登录」时调用；
//    - refresh：bootstrap 内部在 accessToken 缺失或校验失败时调用；
//    角色规则：ADMIN 只能进 /app/admin/* 与 /app/settings；
//    USER 只能进业务页（groups/documents/qa/assistant）与 /app/settings；
//    mustChangePassword 用户一律先跳 /app/settings 改密。
// ═══════════════════════════════════════════════════════════════
import { defineStore } from 'pinia'
import {
  changePassword as changePasswordRequest,
  fetchCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  refreshSession,
  type ChangePasswordPayload,
  type CurrentUserProfile,
  type LoginPayload,
} from '../api/auth'
import http from '../api/http'

// 权限跳转规则的常量表（唯一事实来源）：各角色默认落地页、强制改密页、
// 登录页与 USER 可访问的业务路径前缀
const ADMIN_HOME_PATH = '/app/admin/users'
const USER_HOME_PATH = '/app/groups'
const ACCOUNT_SECURITY_PATH = '/app/settings'
const LOGIN_PATH = '/login'
const BUSINESS_PATH_PREFIXES = ['/app/groups', '/app/documents', '/app/qa', '/app/assistant']

// store 状态结构
interface AuthState {
  // accessToken 内存态：刷新页面即丢失，不落 localStorage（见文件头③）
  accessToken: string | null
  // 当前登录用户资料（含 systemRole / mustChangePassword 等权限字段）
  currentUser: CurrentUserProfile | null
  // 会话引导（bootstrap）进行中：App.vue 据此显示全屏 Loading 遮罩
  isBootstrapping: boolean
  // 登录/注册等认证动作进行中：供登录表单禁用提交按钮
  isAuthenticating: boolean
}

// 模块级「进行中的 bootstrap 任务」引用：并发调用 bootstrap 时共享同一个
// Promise，避免路由守卫与组件同时触发导致重复请求后端
let bootstrapTask: Promise<CurrentUserProfile | null> | null = null

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    accessToken: null,
    currentUser: null,
    isBootstrapping: false,
    isAuthenticating: false,
  }),
  getters: {
    // 是否已完整登录：access token 与用户资料两者齐备才算登录
    isAuthenticated(state): boolean {
      return state.accessToken !== null && state.currentUser !== null
    },
    // 当前用户是否为系统管理员（驱动菜单、角色守卫的快捷判断）
    isAdmin(state): boolean {
      return state.currentUser?.systemRole === 'ADMIN'
    },
    // 当前用户是否为普通用户
    isUser(state): boolean {
      return state.currentUser?.systemRole === 'USER'
    },
    // 登录后的默认落地页：按角色与 mustChangePassword 计算（未登录则为 /login）
    homePath(state): string {
      return resolveAuthorizedPath(state.currentUser)
    },
  },
  actions: {
    // 会话引导：路由守卫每次导航都会调用。幂等设计——
    // 已有完整会话直接返回；已有进行中的任务则共享其 Promise（并发去重）；
    // force=true 用于「明确要重新拉取用户信息」的场景，绕过以上两个短路。
    async bootstrap(force = false): Promise<CurrentUserProfile | null> {
      if (!force && this.currentUser !== null && this.accessToken !== null) {
        return this.currentUser
      }

      if (!force && bootstrapTask !== null) {
        return bootstrapTask
      }

      bootstrapTask = this.runBootstrap()
      try {
        return await bootstrapTask
      } finally {
        bootstrapTask = null
      }
    },
    // 静默续期：用 Refresh Token Cookie（浏览器自动携带）换取新的
    // accessToken 并刷新用户资料；成功即覆盖内存会话
    async refresh(): Promise<CurrentUserProfile> {
      const session = await refreshSession()
      this.setSession(session.accessToken, session.currentUser)
      return session.currentUser
    },
    // 登录：由 LoginView / LoginModal 表单提交时调用。loginId 先 trim，
    // 成功后把返回的 accessToken 写入内存态并同步 axios 请求头
    async login(payload: LoginPayload): Promise<CurrentUserProfile> {
      this.isAuthenticating = true
      try {
        const session = await loginRequest({
          loginId: payload.loginId.trim(),
          password: payload.password,
        })
        this.setSession(session.accessToken, session.currentUser)
        return session.currentUser
      } finally {
        this.isAuthenticating = false
      }
    },
    async logout(): Promise<void> {
      try {
        await logoutRequest()
      } catch {
        // 远端退出失败时仍清理本地会话，避免界面残留登录态。
      } finally {
        this.clearSession()
      }
    },
    // 修改密码：成功后先本地把 mustChangePassword 置 false（立即解除改密限制），
    // 再尝试重新拉取用户资料，保证服务端返回的最新状态覆盖本地
    async changePassword(payload: ChangePasswordPayload): Promise<CurrentUserProfile | null> {
      await changePasswordRequest(payload)

      if (this.currentUser !== null) {
        this.currentUser = { ...this.currentUser, mustChangePassword: false }
      }

      try {
        this.currentUser = await fetchCurrentUser()
      } catch {
        return this.currentUser
      }

      return this.currentUser
    },
    // 计算登录后的落地页：requestedPath 是登录前想去的地址（守卫/弹窗可传入），
    // 不合法或越权时回退到角色首页
    resolveLandingPath(requestedPath?: string | null): string {
      return resolveAuthorizedPath(this.currentUser, requestedPath)
    },
    // 路由守卫专用：判断「已登录用户访问 requestedPath 是否需要重定向」。
    // 未登录返回 /login；返回 null 表示放行（路径对当前角色合法）
    resolveRedirectForPath(requestedPath: string): string | null {
      if (this.currentUser === null) {
        return LOGIN_PATH
      }

      return resolveRoleRedirect(this.currentUser, requestedPath)
    },
    // 清空本地会话：内存 token / 用户资料归零并移除 axios 请求头
    // （Refresh Token Cookie 的清除由后端登出接口通过 Set-Cookie 完成）
    clearSession() {
      this.accessToken = null
      this.currentUser = null
      applyAuthorizationHeader(null)
    },
    // 写入会话：内存态保存 accessToken + 用户资料，并同步 axios 请求头。
    // 这是 accessToken 唯一的「落地」位置——只在内存，不进任何 Web Storage
    setSession(accessToken: string, currentUser: CurrentUserProfile) {
      this.accessToken = accessToken
      this.currentUser = currentUser
      applyAuthorizationHeader(accessToken)
    },
    // bootstrap 的实际执行体：
    // 1) 先把（可能为空的）token 同步到 axios 请求头；
    // 2) 内存中有 accessToken → 先尝试 fetchCurrentUser 校验，
    //    失败（token 过期/无效）则自动降级走 refresh 换新 token；
    // 3) 内存中没有 accessToken（如页面刚刷新）→ 直接走 refresh，
    //    依赖浏览器携带的 Refresh Token Cookie 恢复会话；
    // 4) 全部失败则 clearSession，让守卫按「未登录」处理。
    async runBootstrap(): Promise<CurrentUserProfile | null> {
      this.isBootstrapping = true
      applyAuthorizationHeader(this.accessToken)

      try {
        if (this.accessToken !== null) {
          try {
            this.currentUser = await fetchCurrentUser()
            return this.currentUser
          } catch {
            return await this.refresh()
          }
        }

        return await this.refresh()
      } catch {
        this.clearSession()
        return null
      } finally {
        this.isBootstrapping = false
      }
    },
  },
})

// 计算某用户「有权访问的落地页」：
// 未登录 → 登录页；mustChangePassword → 强制改密页；
// ADMIN 只允许管理路径与设置页，否则回管理首页；
// USER 只允许业务路径与设置页，否则回用户首页。
// requestedPath 为登录前目标地址（会先做合法性归一化），越权则忽略并回默认首页。
export function resolveAuthorizedPath(
  user: CurrentUserProfile | null,
  requestedPath?: string | null,
): string {
  if (user === null) {
    return LOGIN_PATH
  }

  if (user.mustChangePassword) {
    return ACCOUNT_SECURITY_PATH
  }

  const safeRequestedPath = normalizeRequestedPath(requestedPath)

  if (user.systemRole === 'ADMIN') {
    return isAdminPath(safeRequestedPath) || safeRequestedPath === ACCOUNT_SECURITY_PATH
      ? safeRequestedPath
      : ADMIN_HOME_PATH
  }

  return isBusinessPath(safeRequestedPath) || safeRequestedPath === ACCOUNT_SECURITY_PATH
    ? safeRequestedPath
    : USER_HOME_PATH
}

// 路由守卫的「越权重定向」计算：返回 null 表示放行。
// 优先级：强制改密（除设置页外一律先去改密）> ADMIN 访问业务页 > USER 访问管理页。
export function resolveRoleRedirect(user: CurrentUserProfile, requestedPath: string): string | null {
  if (user.mustChangePassword && requestedPath !== ACCOUNT_SECURITY_PATH) {
    return ACCOUNT_SECURITY_PATH
  }

  if (user.systemRole === 'ADMIN' && isBusinessPath(requestedPath)) {
    return ADMIN_HOME_PATH
  }

  if (user.systemRole === 'USER' && isAdminPath(requestedPath)) {
    return USER_HOME_PATH
  }

  return null
}

// 把 accessToken 同步到 axios 全局默认请求头（Bearer 方案）；
// token 为空时移除该头，避免携带无效凭证
function applyAuthorizationHeader(accessToken: string | null) {
  if (accessToken === null) {
    delete http.defaults.headers.common.Authorization
    return
  }

  http.defaults.headers.common.Authorization = `Bearer ${accessToken}`
}

// 请求路径合法性归一化：非字符串 / 空串 / 非根开头 / 协议相对路径（//）/
// 登录页本身，都视为无效并返回 null，防止开放重定向类问题
function normalizeRequestedPath(path?: string | null): string | null {
  if (typeof path !== 'string' || path.length === 0) {
    return null
  }

  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith(LOGIN_PATH)) {
    return null
  }

  return path
}

// 是否为管理员专属路径（/app/admin 及其子路径）
function isAdminPath(path: string | null): path is string {
  return path === '/app/admin' || path?.startsWith('/app/admin/') === true
}

// 是否为 USER 业务路径（groups/documents/qa/assistant 及其子路径）
function isBusinessPath(path: string | null): path is string {
  return BUSINESS_PATH_PREFIXES.some((prefix) => path === prefix || path?.startsWith(`${prefix}/`))
}
