// ============================================================
// 问答会话状态管理（useQaSessions 组合式函数）
// 使用位置：/app/qa 页面（QaView.vue 调用其方法管理会话），
// QaMessage / QaTranscript / QaSidebar 仅引用其导出的类型。
// 职责：提供问答会话（QaSession）与消息（QaMessage）的内存态管理 ——
//       会话的创建 / 选中 / 删除 / 清空、消息的追加与增量更新
//       （流式回答靠 updateMessage 逐段刷新）、消息 / 会话 ID 生成，
//       以及「用首个用户问题自动生成会话标题」。
// 数据流：
//   sessions / activeSessionId 是模块级 ref（定义在函数外），多次调用
//   useQaSessions 拿到的是同一份单例状态；QaView 在加载历史、发起
//   流式提问时调用这里的方法变更状态，QaSidebar / QaTranscript 只读消费。
// 注意：本模块不负责持久化 —— 历史会话持久化在服务端，由 QaView
//   经 listQaRecords 拉取后转换为本结构（recordId / hydrated 标记同步状态）。
// ============================================================
import { ref, computed } from 'vue'
import type { CitationItem, EvidenceOverview } from '@/api/qa'

// 消息角色：仅「用户」与「AI 助手」两种
export type QaRole = 'user' | 'assistant'

// 单条消息：pending 表示 AI 回答流式进行中；answered=false 表示拒答或出错
// （配合 reasonCode / reasonMessage 展示原因）；citations / evidenceOverview
// 为回答依据；recordId 关联服务端问答记录
export interface QaMessage {
  id: string
  role: QaRole
  content: string
  createdAt: number
  pending?: boolean
  answered?: boolean
  reasonCode?: string | null
  reasonMessage?: string | null
  citations?: CitationItem[]
  evidenceOverview?: EvidenceOverview | null
  recordId?: number | null
}

// 一个会话（即一次问答线程）：recordId 存在说明来自服务端历史；
// hydrated 表示已通过详情接口补全过引用与证据（避免重复请求）
export interface QaSession {
  id: string
  title: string
  groupId: number | null
  groupName: string
  messages: QaMessage[]
  createdAt: number
  updatedAt: number
  recordId?: number
  hydrated?: boolean
}

// 生成前端消息 / 会话 ID：时间戳（36 进制）+ 随机段，保证本地唯一
function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// 模块级单例状态：定义在函数外部，使所有调用方共享同一份会话数据
const sessions = ref<QaSession[]>([])
const activeSessionId = ref<string | null>(null)

// 组合式函数入口：返回共享状态与全部操作方法
export function useQaSessions() {
  // 当前激活会话的派生引用；无激活 ID 或 ID 已失效时为 null
  const activeSession = computed<QaSession | null>(() => {
    if (!activeSessionId.value) return null
    return sessions.value.find((s) => s.id === activeSessionId.value) ?? null
  })

  // 新建空白会话并立即激活（插入到列表最前）；初始标题「新的问答」，
  // 追加首条用户消息时自动改写为问题摘要
  function createSession(groupId: number | null, groupName: string): QaSession {
    const now = Date.now()
    const session: QaSession = {
      id: uid(),
      title: '新的问答',
      groupId,
      groupName,
      messages: [],
      createdAt: now,
      updatedAt: now,
    }
    sessions.value.unshift(session)
    activeSessionId.value = session.id
    return session
  }

  // 切换激活会话（ID 不存在时静默忽略）
  function selectSession(id: string) {
    if (sessions.value.some((s) => s.id === id)) {
      activeSessionId.value = id
    }
  }

  // 删除会话；若删除的是当前激活会话，则回退激活列表第一条（无则置空）
  function deleteSession(id: string) {
    const idx = sessions.value.findIndex((s) => s.id === id)
    if (idx === -1) return
    sessions.value.splice(idx, 1)
    if (activeSessionId.value === id) {
      activeSessionId.value = sessions.value[0]?.id ?? null
    }
  }

  // 清空全部会话（工具方法，当前页面流程未使用）
  function clearAllSessions() {
    sessions.value = []
    activeSessionId.value = null
  }

  // 追加消息并刷新会话更新时间；首个用户问题自动成为会话标题
  function appendMessage(sessionId: string, message: QaMessage) {
    const s = sessions.value.find((x) => x.id === sessionId)
    if (!s) return
    s.messages.push(message)
    s.updatedAt = Date.now()
    // Auto title from first user question (max 24 chars)
    if (message.role === 'user' && s.title === '新的问答') {
      const firstLine = message.content.trim().split('\n')[0] ?? ''
      s.title = firstLine.length > 24 ? firstLine.slice(0, 24) + '…' : firstLine || '新的问答'
    }
  }

  // 按 ID 局部更新消息字段（浅合并），流式回答的增量刷新全靠它
  function updateMessage(sessionId: string, messageId: string, patch: Partial<QaMessage>) {
    const s = sessions.value.find((x) => x.id === sessionId)
    if (!s) return
    const m = s.messages.find((x) => x.id === messageId)
    if (!m) return
    Object.assign(m, patch)
    s.updatedAt = Date.now()
  }

  return {
    sessions,
    activeSession,
    activeSessionId,
    createSession,
    selectSession,
    deleteSession,
    clearAllSessions,
    appendMessage,
    updateMessage,
    uid,
  }
}
