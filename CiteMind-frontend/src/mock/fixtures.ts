// ═══════════════════════════════════════════════════════════════════════════
// Mock 数据仓库（fixtures）
// ───────────────────────────────────────────────────────────────────────────
// 本文件是「纯前端演示模式」的数据源：在没有后端的情况下，为所有页面提供
// 足够逼真的演示数据（用户 / 群组 / 文档 / 问答记录 / 助手会话 / 用量统计）。
//
// 设计要点：
// 1. 类型全部复用 src/api/*.ts 中的接口类型（import type），保证 Mock 返回值
//    与真实后端契约完全一致 —— 页面代码不需要感知数据来自 Mock 还是后端；
// 2. 数据保存在模块级内存变量中，页面上的增删改（建群、上传、审批、提问…）
//    会真实地修改这份数据，因此演示时各页面的联动是「活的」；
// 3. 浏览器刷新后数据会重置为初始演示集（登录态通过 localStorage 保留），
//    详见本目录 index.ts 中对会话保持的说明。
// ═══════════════════════════════════════════════════════════════════════════

// ── 类型仅从 api 层引入（编译期擦除，不会产生运行时依赖环） ──
import type { CurrentUserProfile } from '../api/auth'
import type { AdminUserItem, UserStatus } from '../api/admin-user'
import type {
  DocumentItem,
  DocumentPreview,
} from '../api/document'
import type {
  GroupItem,
  GroupMemberItem,
  GroupQueryResult,
  JoinRequestItem,
  MySentInvitationItem,
  OwnerJoinRequestItem,
  PendingInvitationItem,
} from '../api/group'
import type {
  QaRecordCitation,
  QaRecordDetail,
  QaRecordListItem,
} from '../api/qa'
import type {
  AssistantMessageItem,
  AssistantSessionDetail,
  AssistantSessionListItem,
} from '../types/assistant'

// ═══════════════════════════════════════════════════════════════════════════
// 一、时间与自增 ID 工具
// ═══════════════════════════════════════════════════════════════════════════

/** 演示数据的「当前时间」基准：以页面加载时刻为原点，倒推出历史数据的时间轴 */
const NOW = new Date()

/** 生成「距现在 n 小时前」的 ISO 8601 时间字符串 */
function hoursAgo(n: number): string {
  return new Date(NOW.getTime() - n * 3600_000).toISOString()
}

/** 生成「距现在 n 天前」的 ISO 8601 时间字符串 */
function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString()
}

/** 内存自增主键分配器：为新建的群组 / 文档 / 会话等分配不冲突的 ID */
function makeIdAllocator(start: number) {
  let next = start
  return () => next++
}

export const nextGroupId = makeIdAllocator(100)
export const nextDocumentId = makeIdAllocator(500)
export const nextSessionId = makeIdAllocator(300)
export const nextMessageId = makeIdAllocator(3000)
export const nextRequestId = makeIdAllocator(60)
export const nextInvitationId = makeIdAllocator(80)

// ═══════════════════════════════════════════════════════════════════════════
// 二、用户与登录态
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mock 用户表
 *
 * 演示规则（与根目录 README 的「演示账号」说明保持一致）：
 * - 使用 admin / admin123（或不填密码）登录 → 进入系统管理员视图；
 * - 使用其他任意账号名登录 → 自动注册为普通用户（USER）；
 * - 任意非空密码均可通过，演示模式不校验密码强度。
 */
interface MockUserRecord {
  userId: number
  userCode: string
  username: string
  email: string
  displayName: string
  systemRole: 'ADMIN' | 'USER'
  status: UserStatus
  mustChangePassword: boolean
  lastLoginAt: string | null
}

const users: MockUserRecord[] = [
  {
    userId: 1,
    userCode: '100001',
    username: 'admin',
    email: 'admin@citemind.local',
    displayName: '系统管理员',
    systemRole: 'ADMIN',
    status: 'ACTIVE',
    mustChangePassword: false,
    lastLoginAt: hoursAgo(2),
  },
  {
    userId: 2,
    userCode: '100002',
    username: 'zhang.wei',
    email: 'zhangwei@citemind.local',
    displayName: '张伟',
    systemRole: 'USER',
    status: 'ACTIVE',
    mustChangePassword: false,
    lastLoginAt: hoursAgo(5),
  },
  {
    userId: 3,
    userCode: '100003',
    username: 'li.na',
    email: 'lina@citemind.local',
    displayName: '李娜',
    systemRole: 'USER',
    status: 'ACTIVE',
    mustChangePassword: false,
    lastLoginAt: daysAgo(1),
  },
  {
    userId: 4,
    userCode: '100004',
    username: 'wang.fang',
    email: 'wangfang@citemind.local',
    displayName: '王芳',
    systemRole: 'USER',
    status: 'ACTIVE',
    mustChangePassword: false,
    lastLoginAt: daysAgo(3),
  },
  {
    userId: 5,
    userCode: '100005',
    username: 'chen.jing',
    email: 'chenjing@citemind.local',
    displayName: '陈静',
    systemRole: 'USER',
    status: 'DISABLED',
    mustChangePassword: false,
    lastLoginAt: daysAgo(30),
  },
]

/** 把内部用户记录映射为管理员页面的展示结构（对应 AdminUserItemResponse） */
export function toAdminUserItem(u: MockUserRecord): AdminUserItem {
  return {
    userId: u.userId,
    userCode: u.userCode,
    username: u.username,
    email: u.email,
    displayName: u.displayName,
    systemRole: u.systemRole,
    status: u.status,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt,
  }
}

/** 把内部用户记录映射为「当前登录用户」结构（对应 CurrentUserProfileResponse） */
function toProfile(u: MockUserRecord): CurrentUserProfile {
  return {
    userId: u.userId,
    userCode: u.userCode,
    displayName: u.displayName,
    systemRole: u.systemRole,
    mustChangePassword: u.mustChangePassword,
  }
}

/**
 * 按登录标识（用户名或邮箱，不区分大小写）查找用户；
 * 找不到时返回 null —— 由调用方决定「自动注册为普通用户」。
 */
export function findUserByLoginId(loginId: string): MockUserRecord | null {
  const key = loginId.trim().toLowerCase()
  return (
    users.find(
      (u) => u.username.toLowerCase() === key || u.email.toLowerCase() === key,
    ) ?? null
  )
}

/** 登录成功后记录最近登录时间，便于「用户管理」页演示 */
export function touchUserLastLogin(userId: number): void {
  const u = users.find((x) => x.userId === userId)
  if (u) {
    u.lastLoginAt = new Date().toISOString()
  }
}

/** 注册新用户（演示模式：任意账号名都可以注册成功） */
export function registerUser(payload: {
  username: string
  email: string
  displayName: string
}): MockUserRecord {
  const existing = findUserByLoginId(payload.username)
  if (existing) {
    throw new Error('用户名已存在')
  }
  const created: MockUserRecord = {
    userId: users.length + 1,
    userCode: String(100000 + users.length + 1),
    username: payload.username,
    email: payload.email,
    displayName: payload.displayName || payload.username,
    systemRole: 'USER',
    status: 'ACTIVE',
    mustChangePassword: false,
    lastLoginAt: null,
  }
  users.push(created)
  return created
}

export { users, toProfile }

// ═══════════════════════════════════════════════════════════════════════════
// 三、登录态的持久化（localStorage）
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mock 会话的持久化 key。
 *
 * 演示模式下「登录态」保存在 localStorage：登录成功写入，登出清除。
 * 这样浏览器刷新后路由守卫的 bootstrap（refresh 接口）仍能恢复会话，
 * 体验与真实后端（httpOnly Cookie）一致；但演示数据本身仍会重置。
 */
export const MOCK_SESSION_KEY = 'citemind.mock.userId'

/** 当前登录的用户记录（内存态，由 index.ts 中的 auth 路由维护） */
let currentUser: MockUserRecord | null = null

/** 读取当前登录用户；支持从 localStorage 恢复（对应页面刷新场景） */
export function getCurrentUser(): MockUserRecord | null {
  if (currentUser !== null) {
    return currentUser
  }
  try {
    const raw = localStorage.getItem(MOCK_SESSION_KEY)
    if (raw) {
      const id = Number(raw)
      currentUser = users.find((u) => u.userId === id) ?? null
    }
  } catch {
    // localStorage 不可用（隐私模式等）时静默降级为未登录
  }
  return currentUser
}

/** 设置当前登录用户，并同步写入 localStorage */
export function setCurrentUser(user: MockUserRecord | null): void {
  currentUser = user
  try {
    if (user === null) {
      localStorage.removeItem(MOCK_SESSION_KEY)
    } else {
      localStorage.setItem(MOCK_SESSION_KEY, String(user.userId))
    }
  } catch {
    // 忽略持久化失败
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 四、协作小组
// ═══════════════════════════════════════════════════════════════════════════

/** 群组内部结构：成员列表用「用户 ID + 群内角色」表达（OWNER / MEMBER） */
interface MockGroupRecord {
  groupId: number
  groupCode: string
  groupName: string
  description: string
  createdAt: string
  members: Array<{ userId: number; role: 'OWNER' | 'MEMBER' }>
}

const groups: MockGroupRecord[] = [
  {
    groupId: 1,
    groupCode: 'G-RD-TEAM',
    groupName: '研发中心知识库',
    description: '研发规范、架构设计文档、评审记录与故障复盘。',
    createdAt: daysAgo(90),
    members: [
      { userId: 1, role: 'OWNER' },
      { userId: 2, role: 'MEMBER' },
      { userId: 3, role: 'MEMBER' },
    ],
  },
  {
    groupId: 2,
    groupCode: 'G-PRODUCT',
    groupName: '产品与运营',
    description: '产品需求文档、运营 SOP、竞品分析与周报归档。',
    createdAt: daysAgo(60),
    members: [
      { userId: 3, role: 'OWNER' },
      { userId: 1, role: 'MEMBER' },
      { userId: 4, role: 'MEMBER' },
    ],
  },
  {
    groupId: 3,
    groupCode: 'G-ONBOARD',
    groupName: '新人入职指南',
    description: '入职流程、开发环境搭建、常用工具与内部系统导航。',
    createdAt: daysAgo(30),
    members: [
      { userId: 2, role: 'OWNER' },
      { userId: 4, role: 'MEMBER' },
    ],
  },
]

/** 查询当前用户可见的群组集合（对应 GET /api/groups/my 的语义） */
export function queryGroupsFor(userId: number): GroupQueryResult {
  const ownedGroups: GroupItem[] = groups
    .filter((g) => g.members.some((m) => m.userId === userId && m.role === 'OWNER'))
    .map((g) => toGroupItem(g, userId))
  const joinedGroups: GroupItem[] = groups
    .filter((g) => g.members.some((m) => m.userId === userId && m.role === 'MEMBER'))
    .map((g) => toGroupItem(g, userId))
  const pendingInvitations = invitations
    .filter((inv) => inv.inviteeUserId === userId && inv.status === 'PENDING')
    .map((inv) => {
      const g = groups.find((x) => x.groupId === inv.groupId)
      const inviter = users.find((u) => u.userId === inv.inviterUserId)
      const item: PendingInvitationItem = {
        invitationId: inv.invitationId,
        groupId: inv.groupId,
        groupName: g?.groupName ?? `群组 #${inv.groupId}`,
        inviterUserId: inv.inviterUserId,
        inviterDisplayName: inviter?.displayName ?? '未知用户',
        status: inv.status,
      }
      return item
    })

  return { ownedGroups, joinedGroups, pendingInvitations }
}

/** 群组记录 → 列表项；管理员额外携带待审批申请数（用于角标展示） */
function toGroupItem(g: MockGroupRecord, viewerId: number): GroupItem {
  const isOwner = g.members.some((m) => m.userId === viewerId && m.role === 'OWNER')
  return {
    groupId: g.groupId,
    groupCode: g.groupCode,
    groupName: g.groupName,
    description: g.description,
    pendingRequestCount: isOwner
      ? joinRequests.filter((r) => r.groupId === g.groupId && r.status === 'PENDING').length
      : undefined,
    createdAt: g.createdAt,
  }
}

export function findGroup(groupId: number): MockGroupRecord | null {
  return groups.find((g) => g.groupId === groupId) ?? null
}

/** 创建群组（创建者自动成为 OWNER，对应 POST /api/groups） */
export function createGroup(userId: number, name: string, description?: string): number {
  const groupId = nextGroupId()
  groups.push({
    groupId,
    groupCode: `G-${String(groupId).padStart(3, '0')}-${name.slice(0, 4).toUpperCase()}`,
    groupName: name,
    description: description ?? '',
    createdAt: new Date().toISOString(),
    members: [{ userId, role: 'OWNER' }],
  })
  return groupId
}

/** 群组成员列表（对应 GET /api/groups/{id}/members） */
export function listGroupMembers(groupId: number): GroupMemberItem[] {
  const g = findGroup(groupId)
  if (!g) {
    throw new Error('群组不存在')
  }
  return g.members.map((m) => {
    const u = users.find((x) => x.userId === m.userId)
    return {
      userId: m.userId,
      userCode: u?.userCode ?? String(m.userId),
      displayName: u?.displayName ?? `用户 ${m.userId}`,
      role: m.role,
    }
  })
}

/** 移除成员（管理员操作；管理员不能移除自己） */
export function removeMember(groupId: number, userId: number, operatorId: number): void {
  const g = findGroup(groupId)
  if (!g) {
    throw new Error('群组不存在')
  }
  const isOwner = g.members.some((m) => m.userId === operatorId && m.role === 'OWNER')
  if (!isOwner) {
    throw new Error('仅群组管理员可移除成员')
  }
  if (userId === operatorId) {
    throw new Error('管理员不能移除自己')
  }
  g.members = g.members.filter((m) => m.userId !== userId)
}

/** 退出群组（OWNER 不可退出，对应后端约束） */
export function leaveGroup(groupId: number, userId: number): void {
  const g = findGroup(groupId)
  if (!g) {
    throw new Error('群组不存在')
  }
  const me = g.members.find((m) => m.userId === userId)
  if (!me) {
    throw new Error('你不是该群组成员')
  }
  if (me.role === 'OWNER') {
    throw new Error('群组管理员不能退出，请先转让或解散群组')
  }
  g.members = g.members.filter((m) => m.userId !== userId)
}

export { groups as allGroups }

// ═══════════════════════════════════════════════════════════════════════════
// 五、邀请与加入申请
// ═══════════════════════════════════════════════════════════════════════════

interface MockInvitationRecord {
  invitationId: number
  groupId: number
  inviterUserId: number
  inviteeUserId: number
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELED'
  createdAt: string
}

const invitations: MockInvitationRecord[] = [
  // 演示数据：给 admin 留一条来自「产品与运营」的待处理邀请
  {
    invitationId: 80,
    groupId: 2,
    inviterUserId: 3,
    inviteeUserId: 1,
    status: 'PENDING',
    createdAt: hoursAgo(10),
  },
]

/** 创建邀请（仅群组 OWNER；重复邀请同一待处理对象会被拒绝） */
export function createInvitation(
  groupId: number,
  inviteeUserId: number,
  inviterUserId: number,
): number {
  const g = findGroup(groupId)
  if (!g) {
    throw new Error('群组不存在')
  }
  if (!g.members.some((m) => m.userId === inviterUserId && m.role === 'OWNER')) {
    throw new Error('仅群组管理员可邀请成员')
  }
  if (g.members.some((m) => m.userId === inviteeUserId)) {
    throw new Error('该用户已是群组成员')
  }
  const duplicated = invitations.find(
    (inv) =>
      inv.groupId === groupId && inv.inviteeUserId === inviteeUserId && inv.status === 'PENDING',
  )
  if (duplicated) {
    throw new Error('已存在待处理的邀请')
  }
  const invitationId = nextInvitationId()
  invitations.push({
    invitationId,
    groupId,
    inviterUserId,
    inviteeUserId,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  })
  return invitationId
}

/** 接受邀请：邀请状态翻转为 ACCEPTED，被邀请者加入群组（MEMBER） */
export function acceptInvitation(invitationId: number, userId: number): void {
  const inv = invitations.find((i) => i.invitationId === invitationId)
  if (!inv || inv.inviteeUserId !== userId) {
    throw new Error('邀请不存在')
  }
  if (inv.status !== 'PENDING') {
    throw new Error('邀请已被处理')
  }
  inv.status = 'ACCEPTED'
  const g = findGroup(inv.groupId)
  if (g && !g.members.some((m) => m.userId === userId)) {
    g.members.push({ userId, role: 'MEMBER' })
  }
}

/** 拒绝 / 取消邀请 */
export function decideInvitation(
  invitationId: number,
  status: 'REJECTED' | 'CANCELED',
  userId: number,
): void {
  const inv = invitations.find((i) => i.invitationId === invitationId)
  if (!inv) {
    throw new Error('邀请不存在')
  }
  // 拒绝：被邀请者操作；取消：邀请方操作
  if (status === 'REJECTED' && inv.inviteeUserId !== userId) {
    throw new Error('仅被邀请者可拒绝邀请')
  }
  if (status === 'CANCELED' && inv.inviterUserId !== userId) {
    throw new Error('仅邀请方可取消邀请')
  }
  if (inv.status !== 'PENDING') {
    throw new Error('邀请已被处理')
  }
  inv.status = status
}

/** 我发出的邀请列表（对应 GET /api/groups/invitations/my-sent） */
export function listMySentInvitations(userId: number): MySentInvitationItem[] {
  return invitations
    .filter((inv) => inv.inviterUserId === userId)
    .map((inv) => {
      const g = groups.find((x) => x.groupId === inv.groupId)
      const invitee = users.find((u) => u.userId === inv.inviteeUserId)
      return {
        invitationId: inv.invitationId,
        groupId: inv.groupId,
        groupName: g?.groupName ?? `群组 #${inv.groupId}`,
        inviteeUserId: inv.inviteeUserId,
        inviteeDisplayName: invitee?.displayName ?? `用户 ${inv.inviteeUserId}`,
        status: inv.status,
        createdAt: inv.createdAt,
        decidedAt: null,
      }
    })
}

interface MockJoinRequestRecord {
  requestId: number
  groupId: number
  applicantUserId: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  createdAt: string
}

const joinRequests: MockJoinRequestRecord[] = [
  // 演示数据：研发中心有一条来自「李娜」的待审批申请（owner 视角可见）
  {
    requestId: 60,
    groupId: 1,
    applicantUserId: 4,
    status: 'PENDING',
    createdAt: hoursAgo(8),
  },
]

/** 提交加入申请（通过群组编码） */
export function submitJoinRequest(groupCode: string, userId: number): number {
  const g = groups.find((x) => x.groupCode === groupCode)
  if (!g) {
    throw new Error('群组编码不存在')
  }
  if (g.members.some((m) => m.userId === userId)) {
    throw new Error('你已是该群组成员')
  }
  const duplicated = joinRequests.find(
    (r) => r.groupId === g.groupId && r.applicantUserId === userId && r.status === 'PENDING',
  )
  if (duplicated) {
    throw new Error('已有待处理的加入申请')
  }
  const requestId = nextRequestId()
  joinRequests.push({
    requestId,
    groupId: g.groupId,
    applicantUserId: userId,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  })
  return requestId
}

/** 我的申请列表（申请者视角） */
export function listMyJoinRequests(userId: number): JoinRequestItem[] {
  return joinRequests
    .filter((r) => r.applicantUserId === userId)
    .map((r) => {
      const g = groups.find((x) => x.groupId === r.groupId)
      return {
        requestId: r.requestId,
        groupId: r.groupId,
        groupCode: g?.groupCode ?? '',
        groupName: g?.groupName ?? `群组 #${r.groupId}`,
        status: r.status,
        createdAt: r.createdAt,
        decidedAt: null,
      }
    })
}

/** 群组的待审批申请（管理员视角） */
export function listOwnerJoinRequests(groupId: number): OwnerJoinRequestItem[] {
  return joinRequests
    .filter((r) => r.groupId === groupId)
    .map((r) => {
      const applicant = users.find((u) => u.userId === r.applicantUserId)
      return {
        requestId: r.requestId,
        groupId: r.groupId,
        applicantUserId: r.applicantUserId,
        applicantUserCode: applicant?.userCode ?? '',
        applicantDisplayName: applicant?.displayName ?? `用户 ${r.applicantUserId}`,
        status: r.status,
        createdAt: r.createdAt,
      }
    })
}

/** 审批申请：通过 → 申请者入群；拒绝 → 状态翻转 */
export function decideJoinRequest(
  groupId: number,
  requestId: number,
  decision: 'APPROVED' | 'REJECTED',
  operatorId: number,
): void {
  const g = findGroup(groupId)
  if (!g) {
    throw new Error('群组不存在')
  }
  if (!g.members.some((m) => m.userId === operatorId && m.role === 'OWNER')) {
    throw new Error('仅群组管理员可审批申请')
  }
  const r = joinRequests.find((x) => x.requestId === requestId && x.groupId === groupId)
  if (!r || r.status !== 'PENDING') {
    throw new Error('申请不存在或已处理')
  }
  r.status = decision
  if (decision === 'APPROVED' && !g.members.some((m) => m.userId === r.applicantUserId)) {
    g.members.push({ userId: r.applicantUserId, role: 'MEMBER' })
  }
}

export { invitations, joinRequests }

// ═══════════════════════════════════════════════════════════════════════════
// 六、文档
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 演示文档集。
 *
 * 状态覆盖了列表页的三种主状态：
 * - READY      解析完成，可预览 / 检索（大多数）；
 * - PROCESSING ETL 管道处理中（模拟上传后自动流转到 READY，见 index.ts）；
 * - FAILED     处理失败（可演示「重新处理」按钮）。
 */
const documents: DocumentItem[] = [
  {
    documentId: 101,
    groupId: 1,
    fileName: '后端架构设计说明书.pdf',
    fileExt: '.pdf',
    contentType: 'application/pdf',
    fileSize: 1_863_000,
    status: 'READY',
    failureReason: null,
    uploadedAt: daysAgo(12),
    uploaderUserId: 1,
    uploaderDisplayName: '系统管理员',
    uploaderUserCode: '100001',
    previewText: '本文档描述 CiteMind 平台后端的分层架构……（演示数据节选）',
  },
  {
    documentId: 102,
    groupId: 1,
    fileName: 'API 接口设计规范.docx',
    fileExt: '.docx',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fileSize: 402_000,
    status: 'READY',
    failureReason: null,
    uploadedAt: daysAgo(9),
    uploaderUserId: 2,
    uploaderDisplayName: '张伟',
    uploaderUserCode: '100002',
    previewText: '统一响应结构 ApiResponse<T> { success, data, message }……（演示数据节选）',
  },
  {
    documentId: 103,
    groupId: 1,
    fileName: '故障复盘-2026-10-数据库连接池.md',
    fileExt: '.md',
    contentType: 'text/markdown',
    fileSize: 18_500,
    status: 'READY',
    failureReason: null,
    uploadedAt: daysAgo(5),
    uploaderUserId: 3,
    uploaderDisplayName: '李娜',
    uploaderUserCode: '100003',
    previewText: '# 故障复盘\n\n时间线：连接池耗尽 → 慢查询堆积 → 服务超时……（演示数据节选）',
  },
  {
    documentId: 104,
    groupId: 1,
    fileName: '新人开发环境搭建指南.pdf',
    fileExt: '.pdf',
    contentType: 'application/pdf',
    fileSize: 2_240_000,
    status: 'READY',
    failureReason: null,
    uploadedAt: daysAgo(3),
    uploaderUserId: 1,
    uploaderDisplayName: '系统管理员',
    uploaderUserCode: '100001',
    previewText: '本指南覆盖 JDK 21、Node 20+、PostgreSQL+pgvector、ES、MinIO 的安装……（演示数据节选）',
  },
  {
    documentId: 105,
    groupId: 2,
    fileName: '2026-Q4 产品路线图.docx',
    fileExt: '.docx',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fileSize: 660_000,
    status: 'READY',
    failureReason: null,
    uploadedAt: daysAgo(7),
    uploaderUserId: 3,
    uploaderDisplayName: '李娜',
    uploaderUserCode: '100003',
    previewText: 'Q4 主题：检索质量优化、多租户权限、用量看板……（演示数据节选）',
  },
  {
    documentId: 106,
    groupId: 2,
    fileName: '运营活动 SOP 手册.pdf',
    fileExt: '.pdf',
    contentType: 'application/pdf',
    fileSize: 985_000,
    status: 'READY',
    failureReason: null,
    uploadedAt: daysAgo(2),
    uploaderUserId: 4,
    uploaderDisplayName: '王芳',
    uploaderUserCode: '100004',
    previewText: '活动上线前检查清单：素材、埋点、客服话术、回滚预案……（演示数据节选）',
  },
  {
    documentId: 107,
    groupId: 1,
    fileName: '向量索引调优笔记.pdf',
    fileExt: '.pdf',
    contentType: 'application/pdf',
    fileSize: 1_120_000,
    status: 'PROCESSING',
    failureReason: null,
    uploadedAt: hoursAgo(1),
    uploaderUserId: 1,
    uploaderDisplayName: '系统管理员',
    uploaderUserCode: '100001',
    previewText: null,
  },
  {
    documentId: 108,
    groupId: 1,
    fileName: '损坏的扫描件-合同归档.pdf',
    fileExt: '.pdf',
    contentType: 'application/pdf',
    fileSize: 3_400_000,
    status: 'FAILED',
    failureReason: 'PDF 解析失败：文件为扫描图像，未包含可提取文本层',
    uploadedAt: daysAgo(1),
    uploaderUserId: 2,
    uploaderDisplayName: '张伟',
    uploaderUserCode: '100002',
    previewText: null,
  },
]

/** 查询文档列表：按查询参数过滤（对应 GET /api/documents 的过滤语义） */
export function queryDocuments(query: {
  groupId?: number
  groupRelation?: string
  fileName?: string
  status?: string
  uploaderUserId?: number
}): DocumentItem[] {
  const viewerId = getCurrentUser()?.userId ?? 1
  const visibleGroupIds = new Set(
    groups
      .filter((g) => g.members.some((m) => m.userId === viewerId))
      .map((g) => g.groupId),
  )

  return documents.filter((d) => {
    // 数据隔离：只返回当前用户所在群组的文档（演示后端的 groupId 过滤约束）
    if (!visibleGroupIds.has(d.groupId)) {
      return false
    }
    if (typeof query.groupId === 'number' && d.groupId !== query.groupId) {
      return false
    }
    if (query.status && d.status !== query.status) {
      return false
    }
    if (typeof query.uploaderUserId === 'number' && d.uploaderUserId !== query.uploaderUserId) {
      return false
    }
    if (query.fileName && !d.fileName.toLowerCase().includes(query.fileName.toLowerCase())) {
      return false
    }
    if (query.groupRelation) {
      const g = groups.find((x) => x.groupId === d.groupId)
      const role = g?.members.find((m) => m.userId === viewerId)?.role
      if (query.groupRelation === 'OWNER' && role !== 'OWNER') {
        return false
      }
      if (query.groupRelation === 'MEMBER' && role !== 'MEMBER') {
        return false
      }
    }
    return true
  })
}

/** 文档预览（对应 GET /api/documents/{id}/preview） */
export function getDocumentPreview(documentId: number, groupId: number): DocumentPreview {
  const d = documents.find((x) => x.documentId === documentId && x.groupId === groupId)
  if (!d) {
    throw new Error('文档不存在或不在可见范围内')
  }
  return {
    documentId: d.documentId,
    groupId: d.groupId,
    fileName: d.fileName,
    previewText: d.previewText ?? '',
    status: d.status,
  }
}

/**
 * 新增文档（演示上传 / 分片上传完成的落库动作）。
 * 初始状态为 PROCESSING，由 index.ts 中的定时器在数秒后翻转为 READY，
 * 用于向观众演示「上传 → ETL 处理 → 就绪」的状态流转。
 */
export function addProcessingDocument(params: {
  groupId: number
  fileName: string
  fileSize: number
  contentType: string
  uploaderUserId: number
}): DocumentItem {
  const uploader = users.find((u) => u.userId === params.uploaderUserId)
  const ext = params.fileName.includes('.') ? params.fileName.slice(params.fileName.lastIndexOf('.')) : null
  const item: DocumentItem = {
    documentId: nextDocumentId(),
    groupId: params.groupId,
    fileName: params.fileName,
    fileExt: ext,
    contentType: params.contentType,
    fileSize: params.fileSize,
    status: 'PROCESSING',
    failureReason: null,
    uploadedAt: new Date().toISOString(),
    uploaderUserId: params.uploaderUserId,
    uploaderDisplayName: uploader?.displayName ?? '当前用户',
    uploaderUserCode: uploader?.userCode ?? '',
    previewText: null,
  }
  documents.unshift(item)
  return item
}

/** 将文档置为 READY 并写入演示正文（模拟 ETL 完成） */
export function markDocumentReady(documentId: number): void {
  const d = documents.find((x) => x.documentId === documentId)
  if (d && d.status === 'PROCESSING') {
    d.status = 'READY'
    d.previewText = `《${d.fileName}》解析结果（演示正文）。\n\n` +
      '本文档已通过 ETL 管道完成解析、清洗与结构感知切片，' +
      '切片向量已写入 pgvector（HNSW 索引），关键词已写入 Elasticsearch（IK 分词）。\n\n' +
      '你现在可以在「知识库问答」中就本文档内容提问，回答会附带引用溯源。'
  }
}

/** 将失败文档重新置为 PROCESSING（对应 retry-ingestion 接口） */
export function retryDocument(documentId: number): void {
  const d = documents.find((x) => x.documentId === documentId)
  if (!d) {
    throw new Error('文档不存在')
  }
  if (d.status !== 'FAILED') {
    throw new Error('仅失败的文档可以重新处理')
  }
  d.status = 'PROCESSING'
  d.failureReason = null
}

/** 软删除文档（演示直接从列表移除） */
export function deleteDocument(documentId: number, groupId: number): void {
  const idx = documents.findIndex((x) => x.documentId === documentId && x.groupId === groupId)
  if (idx >= 0) {
    documents.splice(idx, 1)
  }
}

export { documents as allDocuments }

// ═══════════════════════════════════════════════════════════════════════════
// 七、问答记录（历史）
// ═══════════════════════════════════════════════════════════════════════════

const qaRecords: QaRecordDetail[] = [
  {
    id: 1,
    userId: 1,
    groupId: 1,
    question: '后端的统一响应结构是什么？异常如何处理？',
    answer:
      '后端所有接口统一返回 `ApiResponse<T>`（success / data / message）。\n\n业务异常通过 `BusinessException`（400）、`ForbiddenException`（403）、`UnauthorizedException`（401）抛出，由 `GlobalExceptionHandler` 统一转换为对应 HTTP 状态码。',
    answered: true,
    reasonCode: null,
    reasonMessage: null,
    evidenceLevel: 'SUFFICIENT',
    citationCount: 2,
    promptTokens: 742,
    completionTokens: 186,
    totalTokens: 928,
    isEstimated: false,
    latencyMs: 2140,
    modelName: 'qwen-plus',
    endpoint: 'dashscope',
    success: true,
    errorMessage: null,
    createdAt: hoursAgo(30),
    evidenceOverview: null,
    citations: [
      {
        documentId: 101,
        documentVersionId: null,
        chunkId: 15,
        chunkIndex: 3,
        startChunkIndex: 3,
        endChunkIndex: 4,
        fileName: '后端架构设计说明书.pdf',
        score: 0.94,
        retrievalSource: 'HYBRID',
        vectorScore: 0.91,
        keywordScore: 0.72,
        hybridScore: 0.94,
        snippet: '所有 Controller 方法返回 ApiResponse<T>……',
      },
      {
        documentId: 102,
        documentVersionId: null,
        chunkId: 27,
        chunkIndex: 5,
        startChunkIndex: 5,
        endChunkIndex: 5,
        fileName: 'API 接口设计规范.docx',
        score: 0.88,
        retrievalSource: 'VECTOR',
        vectorScore: 0.88,
        keywordScore: 0.41,
        hybridScore: 0.88,
        snippet: '异常体系：Business / Forbidden / Unauthorized ……',
      },
    ],
  },
  {
    id: 2,
    userId: 1,
    groupId: 1,
    question: '文档上传支持断点续传吗？分片大小是多少？',
    answer:
      '支持。上传协议分三阶段：init（秒传检测 + 会话创建）→ chunk（逐片上传，支持断点续传）→ complete（合并并触发 ETL）。默认分片大小 5MB，可通过 uploadId 查询已上传分片后续传。',
    answered: true,
    reasonCode: null,
    reasonMessage: null,
    evidenceLevel: 'SUFFICIENT',
    citationCount: 1,
    promptTokens: 688,
    completionTokens: 142,
    totalTokens: 830,
    isEstimated: false,
    latencyMs: 1870,
    modelName: 'qwen-plus',
    endpoint: 'dashscope',
    success: true,
    errorMessage: null,
    createdAt: hoursAgo(26),
    evidenceOverview: null,
    citations: [
      {
        documentId: 101,
        documentVersionId: null,
        chunkId: 41,
        chunkIndex: 12,
        startChunkIndex: 12,
        endChunkIndex: 13,
        fileName: '后端架构设计说明书.pdf',
        score: 0.92,
        retrievalSource: 'HYBRID',
        vectorScore: 0.89,
        keywordScore: 0.77,
        hybridScore: 0.92,
        snippet: '分片上传协议：init → chunk → complete……',
      },
    ],
  },
  {
    id: 3,
    userId: 2,
    groupId: 1,
    question: '平台的向量模型是什么？维度多少？',
    answer: null,
    answered: false,
    reasonCode: 'NO_EVIDENCE',
    reasonMessage: '检索到的有效证据不足，暂不回答。',
    evidenceLevel: 'NONE',
    citationCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    isEstimated: false,
    latencyMs: 640,
    modelName: 'qwen-plus',
    endpoint: 'dashscope',
    success: true,
    errorMessage: null,
    createdAt: hoursAgo(20),
    evidenceOverview: null,
    citations: [],
  },
  {
    id: 4,
    userId: 1,
    groupId: 2,
    question: 'Q4 产品路线图里检索优化的重点是什么？',
    answer:
      'Q4 的检索优化聚焦三点：1) RRF 融合排序的权重调优；2) 类簇聚合与邻居窗口扩展降低碎片化；3) 引入检索缓存层降低 P95 延迟。',
    answered: true,
    reasonCode: null,
    reasonMessage: null,
    evidenceLevel: 'PARTIAL',
    citationCount: 1,
    promptTokens: 812,
    completionTokens: 210,
    totalTokens: 1022,
    isEstimated: true,
    latencyMs: 2450,
    modelName: 'qwen-plus',
    endpoint: 'dashscope',
    success: true,
    errorMessage: null,
    createdAt: hoursAgo(9),
    evidenceOverview: null,
    citations: [
      {
        documentId: 105,
        documentVersionId: null,
        chunkId: 8,
        chunkIndex: 2,
        startChunkIndex: 2,
        endChunkIndex: 3,
        fileName: '2026-Q4 产品路线图.docx',
        score: 0.81,
        retrievalSource: 'VECTOR',
        vectorScore: 0.81,
        keywordScore: 0.3,
        hybridScore: 0.81,
        snippet: '检索质量优化：RRF 权重、类簇聚合……',
      },
    ],
  },
]

/** 分页查询问答记录（对应 GET /api/qa/records） */
export function pageQaRecords(query: {
  groupId?: number
  answered?: boolean
  page?: number
  pageSize?: number
}): { items: QaRecordListItem[]; total: number; page: number; pageSize: number } {
  const page = Math.max(1, query.page ?? 1)
  const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 10))
  const viewerId = getCurrentUser()?.userId ?? 1

  const filtered = qaRecords.filter((r) => {
    if (r.userId !== viewerId) {
      return false
    }
    if (typeof query.groupId === 'number' && r.groupId !== query.groupId) {
      return false
    }
    if (typeof query.answered === 'boolean' && r.answered !== query.answered) {
      return false
    }
    return true
  })

  const items: QaRecordListItem[] = filtered
    .slice((page - 1) * pageSize, page * pageSize)
    .map((r) => ({
      id: r.id,
      userId: r.userId,
      groupId: r.groupId,
      question: r.question,
      answered: r.answered,
      answerPreview: (r.answer ?? r.reasonMessage ?? '').slice(0, 80),
      reasonCode: r.reasonCode,
      evidenceLevel: r.evidenceLevel,
      citationCount: r.citationCount,
      latencyMs: r.latencyMs,
      createdAt: r.createdAt,
    }))

  return { items, total: filtered.length, page, pageSize }
}

/** 新增一条问答记录（演示提问后写入历史） */
export function appendQaRecord(detail: QaRecordDetail): void {
  qaRecords.unshift(detail)
}

/** 删除问答记录 */
export function deleteQaRecord(recordId: number): void {
  const idx = qaRecords.findIndex((r) => r.id === recordId)
  if (idx >= 0) {
    qaRecords.splice(idx, 1)
  }
}

export { qaRecords }

/** 生成一条引用（供问答 / 助手 Mock 使用），score 带一点随机扰动更像真实检索 */
export function makeCitation(doc: DocumentItem, chunkIndex: number, snippet: string): QaRecordCitation {
  const score = Math.round((0.72 + Math.random() * 0.24) * 100) / 100
  return {
    documentId: doc.documentId,
    documentVersionId: null,
    chunkId: 100 + chunkIndex,
    chunkIndex,
    startChunkIndex: chunkIndex,
    endChunkIndex: chunkIndex,
    fileName: doc.fileName,
    score,
    retrievalSource: 'HYBRID',
    vectorScore: Math.min(1, score + 0.03),
    keywordScore: Math.max(0, score - 0.18),
    hybridScore: score,
    snippet,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 八、AI 助手会话
// ═══════════════════════════════════════════════════════════════════════════

interface MockSessionRecord {
  sessionId: number
  title: string
  status: 'ACTIVE' | 'ARCHIVED'
  createdAt: string
  lastMessageAt: string | null
  /** 每个会话归属一个用户（演示数据隔离） */
  userId: number
  messages: AssistantMessageItem[]
}

const sessions: MockSessionRecord[] = [
  {
    sessionId: 301,
    userId: 1,
    title: '帮我梳理上传链路的技术方案',
    status: 'ACTIVE',
    createdAt: daysAgo(4),
    lastMessageAt: hoursAgo(28),
    messages: [
      {
        messageId: 3001,
        sessionId: 301,
        role: 'USER',
        toolMode: 'CHAT',
        groupId: null,
        content: '我们的大文件上传要支持断点续传，帮我梳理一下技术方案的关键点。',
        structuredPayload: null,
        createdAt: daysAgo(4),
      },
      {
        messageId: 3002,
        sessionId: 301,
        role: 'ASSISTANT',
        toolMode: 'CHAT',
        groupId: null,
        content:
          '建议按「三阶段分片上传协议」设计：\n\n1. **init**：携带文件哈希做秒传检测，创建上传会话；\n2. **chunk**：逐片上传，服务端记录已收分片，天然支持断点续传；\n3. **complete**：校验分片完整性后合并，触发异步 ETL。\n\n关键风险点：分片哈希校验防篡改、并发合并的原子性、孤儿会话的过期回收。',
        structuredPayload: null,
        createdAt: daysAgo(4),
      },
    ],
  },
  {
    sessionId: 302,
    userId: 1,
    title: '知识库检索策略调研',
    status: 'ACTIVE',
    createdAt: daysAgo(2),
    lastMessageAt: hoursAgo(40),
    messages: [
      {
        messageId: 3003,
        sessionId: 302,
        role: 'USER',
        toolMode: 'KB_SEARCH',
        groupId: 1,
        content: '混合检索相比纯向量检索的优势在哪里？',
        structuredPayload: null,
        createdAt: daysAgo(2),
      },
      {
        messageId: 3004,
        sessionId: 302,
        role: 'ASSISTANT',
        toolMode: 'KB_SEARCH',
        groupId: 1,
        content:
          '混合检索 = 向量语义通道 + 关键词全文通道，RRF 融合排序。优势：\n\n- 向量通道捕捉语义相似（同义改写也能召回）；\n- 关键词通道精准命中专业术语、型号、错误码；\n- 融合排序兼顾两者，Top-K 命中率显著高于单通道。',
        structuredPayload: null,
        createdAt: daysAgo(2),
      },
    ],
  },
  {
    sessionId: 303,
    userId: 1,
    title: '新会话',
    status: 'ACTIVE',
    createdAt: hoursAgo(6),
    lastMessageAt: null,
    messages: [],
  },
]

/** 会话列表项（对应 GET /api/assistant/sessions 的原始数组返回） */
export function listSessions(userId: number): AssistantSessionListItem[] {
  return sessions
    .filter((s) => s.userId === userId)
    .map((s) => ({
      sessionId: s.sessionId,
      title: s.title,
      lastMessageAt: s.lastMessageAt,
    }))
    .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''))
}

/** 会话详情（对应 GET/POST/PATCH /api/assistant/sessions…） */
export function getSessionDetail(sessionId: number, userId: number): AssistantSessionDetail | null {
  const s = sessions.find((x) => x.sessionId === sessionId && x.userId === userId)
  if (!s) {
    return null
  }
  return {
    sessionId: s.sessionId,
    title: s.title,
    status: s.status,
    lastMessageAt: s.lastMessageAt,
    createdAt: s.createdAt,
  }
}

/** 创建会话 */
export function createSession(userId: number): AssistantSessionDetail {
  const record: MockSessionRecord = {
    sessionId: nextSessionId(),
    userId,
    title: '新会话',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    lastMessageAt: null,
    messages: [],
  }
  sessions.unshift(record)
  return {
    sessionId: record.sessionId,
    title: record.title,
    status: record.status,
    lastMessageAt: record.lastMessageAt,
    createdAt: record.createdAt,
  }
}

/** 重命名会话 */
export function renameSession(sessionId: number, title: string, userId: number): AssistantSessionDetail {
  const s = sessions.find((x) => x.sessionId === sessionId && x.userId === userId)
  if (!s) {
    throw new Error('会话不存在')
  }
  if (!title.trim()) {
    throw new Error('标题不能为空')
  }
  s.title = title.trim().slice(0, 255)
  return getSessionDetail(sessionId, userId)!
}

/** 删除会话（级联删除消息） */
export function deleteSession(sessionId: number, userId: number): void {
  const idx = sessions.findIndex((x) => x.sessionId === sessionId && x.userId === userId)
  if (idx >= 0) {
    sessions.splice(idx, 1)
  }
}

/** 会话上下文：摘要 + 最近消息（对应 GET /api/assistant/sessions/{id}/context） */
export function getSessionContext(
  sessionId: number,
  userId: number,
  recentLimit = 12,
): { summaryText: string | null; recentMessages: AssistantMessageItem[] } {
  const s = sessions.find((x) => x.sessionId === sessionId && x.userId === userId)
  if (!s) {
    throw new Error('会话不存在')
  }
  const recent = s.messages.slice(-recentLimit)
  const summaryText =
    s.messages.length === 0
      ? null
      : `该会话共 ${s.messages.length} 条消息，主题：「${s.title}」。近期讨论要点已由 L1 会话记忆压缩为摘要（演示数据）。`
  return { summaryText, recentMessages: recent }
}

/** 向会话追加消息（用户消息 / 助手回复），并刷新 lastMessageAt */
export function appendSessionMessage(
  sessionId: number,
  userId: number,
  msg: { role: AssistantMessageItem['role']; content: string; toolMode: AssistantMessageItem['toolMode']; groupId: number | null },
): AssistantMessageItem {
  const s = sessions.find((x) => x.sessionId === sessionId && x.userId === userId)
  if (!s) {
    throw new Error('会话不存在')
  }
  const item: AssistantMessageItem = {
    messageId: nextMessageId(),
    sessionId,
    role: msg.role,
    toolMode: msg.toolMode,
    groupId: msg.groupId,
    content: msg.content,
    structuredPayload: null,
    createdAt: new Date().toISOString(),
  }
  s.messages.push(item)
  s.lastMessageAt = item.createdAt
  // 首条用户消息自动把「新会话」改为摘要标题，贴近真实产品行为
  if (s.title === '新会话' && msg.role === 'USER') {
    s.title = msg.content.slice(0, 16) + (msg.content.length > 16 ? '…' : '')
  }
  return item
}

export { sessions as allSessions }

// ═══════════════════════════════════════════════════════════════════════════
// 九、用量统计（管理员 · 使用统计页）
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 30 天趋势的确定性伪随机生成器。
 * 使用固定种子保证每次调用返回同一组数据，页面刷新不会跳变。
 */
function seededTrend(days: number, base: number, growth: number) {
  const out: Array<{ date: string; requests: number; tokens: number; cost: number }> = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(NOW.getTime() - i * 86_400_000)
    // 伪随机：正弦 + 哈希扰动，确定性可复现
    const noise = Math.sin(i * 12.9898) * 43758.5453
    const frac = noise - Math.floor(noise)
    const dayOfWeek = d.getDay()
    const weekendFactor = dayOfWeek === 0 || dayOfWeek === 6 ? 0.35 : 1
    const requests = Math.round((base + growth * (days - i)) * weekendFactor * (0.75 + frac * 0.5))
    const tokens = requests * (620 + Math.round(frac * 180))
    const cost = Math.round(((tokens / 1000) * 0.024 + Number.EPSILON) * 100) / 100
    out.push({ date: d.toISOString().slice(0, 10), requests, tokens, cost })
  }
  return out
}

const trend30 = seededTrend(30, 120, 6)

/** 概览（对应 GET /api/admin/metrics/overview） */
export function metricsOverview() {
  const today = trend30[trend30.length - 1]!
  return {
    todayRequests: today.requests,
    todayTokens: today.tokens,
    todayCost: today.cost,
    // 注意：页面按「百分数值」渲染（如 97.1 → 97.1%），不要传 0~1 的小数
    todaySuccessRate: 97.1,
    dailyTrend: trend30,
  }
}

/** 平台统计（对应 GET /api/admin/metrics/platform?period=） */
export function platformStats(period: string) {
  const days = periodToDays(period)
  const slice = trend30.slice(-days)
  const requests = slice.reduce((s, x) => s + x.requests, 0)
  const tokens = slice.reduce((s, x) => s + x.tokens, 0)
  const cost = Math.round(slice.reduce((s, x) => s + x.cost, 0) * 100) / 100
  const failed = Math.round(requests * 0.029)
  return {
    totalPromptTokens: Math.round(tokens * 0.62),
    totalCompletionTokens: Math.round(tokens * 0.38),
    totalTokens: tokens,
    totalCost: cost,
    totalRequests: requests,
    successRequests: requests - failed,
    failedRequests: failed,
    // 页面按百分数值渲染（97.1 → 97.1%）
    successRate: 97.1,
    avgLatencyMs: 2160,
    avgRpm: Math.round(requests / days / 480),
    avgTpm: Math.round(tokens / days / 480),
  }
}

/** 把 Period 枚举转换为天数 */
function periodToDays(period: string): number {
  switch (period) {
    case 'TODAY':
      return 1
    case 'LAST_7_DAYS':
      return 7
    case 'LAST_14_DAYS':
      return 14
    default:
      return 30
  }
}

/** 用户排行（对应 GET /api/admin/metrics/rank/users） */
export function userRank(limit = 10) {
  const rows = users
    .filter((u) => u.status === 'ACTIVE')
    .map((u, i) => ({
      id: u.userId,
      name: u.displayName,
      totalRequests: 320 - i * 63,
      totalTokens: 210_000 - i * 41_000,
      totalCost: Math.round((5.2 - i * 1.1) * 100) / 100,
    }))
  return rows.slice(0, limit)
}

/** 群组排行（对应 GET /api/admin/metrics/rank/groups） */
export function groupRank(limit = 10) {
  const rows = groups.map((g, i) => ({
    id: g.groupId,
    name: g.groupName,
    totalRequests: 540 - i * 151,
    totalTokens: 366_000 - i * 98_000,
    totalCost: Math.round((8.9 - i * 2.3) * 100) / 100,
  }))
  return rows.slice(0, limit)
}
