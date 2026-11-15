<script setup lang="ts">
// ============================================================
// AI 助手主视图 — 路由 /app/assistant 与 /app/assistant/:sessionId
// ------------------------------------------------------------
// 职责：
//   1. 管理会话列表与"当前会话"（新建 / 切换 / 重命名 / 删除）；
//   2. 组织主区渲染：有激活会话且已有消息 → AssistantTranscript，
//      否则 → AssistantEmpty 空态引导页；底部常驻 AssistantComposer；
//   3. 完整的 SSE 流式问答链路：确保会话存在 → 乐观插入用户气泡与
//      助手占位气泡 → streamAssistantMessage 建立 SSE 连接 →
//      onStreamEvent 处理 start（置流式态）/ delta（增量追加文本）/
//      done（写入最终回复、messageId 与引用 citations）/ error 事件；
//   4. 引用渲染与溯源：done 带回的 citations 传给 AssistantCitationBar，
//      点击引用经 inspect-citation 冒泡回来，openCitation 拼装
//      DocumentItem 打开 DocumentPreviewModal 预览原文片段。
//
// 依赖的 api 模块函数：
//   - @/api/assistant：fetchAssistantSessions / fetchAssistantSessionDetail /
//     fetchAssistantConversationContext（历史消息）/ createAssistantSession /
//     renameAssistantSession / deleteAssistantSession /
//     streamAssistantMessage（SSE 流式对话）
//   - @/api/group：fetchGroups（KB_SEARCH 模式的群组下拉数据）
//   - @/api/http：extractApiError（统一提取错误文案）
//
// 父子关系：
//   父：/app 布局页；子：AssistantSidebar（左栏会话列表）、
//   AssistantTranscript / AssistantEmpty（主区二选一）、
//   AssistantComposer（输入条）、DocumentPreviewModal（引用预览）。
// ============================================================
import { ref, computed, onMounted } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { fetchGroups } from '@/api/group'
import { extractApiError } from '@/api/http'
import {
  createAssistantSession,
  deleteAssistantSession,
  fetchAssistantSessions,
  fetchAssistantSessionDetail,
  fetchAssistantConversationContext,
  renameAssistantSession,
  streamAssistantMessage,
} from '@/api/assistant'
import type {
  AssistantChatStreamEvent,
  AssistantCitationItem,
  AssistantMessageItem,
  AssistantSessionListItem,
  AssistantToolMode,
} from '@/types/assistant'
import type { DocumentItem } from '@/api/document'
import DocumentPreviewModal from '@/components/DocumentPreviewModal.vue'
import AssistantSidebar from './components/AssistantSidebar.vue'
import AssistantTranscript from './components/AssistantTranscript.vue'
import AssistantComposer from './components/AssistantComposer.vue'
import AssistantEmpty from './components/AssistantEmpty.vue'
import type { UiAssistantMessage } from './components/AssistantMessage.vue'

const appStore = useAppStore()
const authStore = useAuthStore()

// ── Sessions ──
// 会话列表（侧边栏数据源）
const sessions = ref<AssistantSessionListItem[]>([])
// 当前激活会话 ID；null 表示未进入任何会话（主区显示空态引导页）
const activeSessionId = ref<number | null>(null)
// 会话列表加载中（侧边栏显示骨架屏）
const sessionsLoading = ref(false)
// 当前会话的消息列表（前端 UI 模型，额外携带流式/失败态字段）
const messages = ref<UiAssistantMessage[]>([])
// 历史消息加载中（主区显示 loading）
const loadingHistory = ref(false)

// 当前激活会话的完整条目（供头部标题展示），按 ID 从列表中查找
const activeSession = computed(() =>
  sessions.value.find((s) => s.sessionId === activeSessionId.value) ?? null,
)

// ── Mode + KB ──
// 对话工具模式：CHAT=自由对话；KB_SEARCH=知识库检索（必须先选群组）
const mode = ref<AssistantToolMode>('CHAT')
// KB_SEARCH 模式选中的知识库群组 ID，初始取全局 store 记忆的当前群组
const selectedGroupId = ref<number | null>(appStore.currentGroupId)

// 当前选中群组名称（传给 Transcript 展示）
const selectedGroupName = computed(() => {
  const g = appStore.visibleGroups.find((x) => x.groupId === selectedGroupId.value)
  return g?.groupName ?? ''
})

// ── Streaming state ──
// 正在接收 SSE 流式回复（期间禁止重复提交，Composer 显示"停止"按钮）
const streaming = ref(false)
// 当前流式请求的中止控制器，用于 Esc/切换会话时中断
let streamAbort: AbortController | null = null
// 最近一次提问的参数快照，供"重试"按原参数重新发起
let lastAskPayload: { text: string; mode: AssistantToolMode; groupId: number | null } | null = null

// ── Helpers ──
// 生成本地临时消息 ID（时间戳+随机串），仅用于前端 v-for key
function localId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// 后端消息结构 → 前端 UI 消息模型（messageId 存在时用 srv- 前缀作稳定 key）
function toUi(m: AssistantMessageItem): UiAssistantMessage {
  return {
    localId: `srv-${m.messageId}`,
    messageId: m.messageId,
    role: m.role,
    content: m.content ?? '',
    toolMode: m.toolMode,
    groupId: m.groupId,
    createdAt: m.createdAt,
  }
}

// ── Data loaders ──
// 拉取会话列表；silent=true 时不亮 loading（用于流式结束后的静默刷新，让自动改名生效）
async function loadSessions(silent = false) {
  if (!silent) sessionsLoading.value = true
  try {
    sessions.value = await fetchAssistantSessions()
  } catch (err) {
    console.error('Load sessions failed:', extractApiError(err, ''))
  } finally {
    sessionsLoading.value = false
  }
}

// 群组列表懒加载：store 已有数据则跳过，否则拉取一次供 KB 模式下拉使用
async function loadGroupsIfNeeded() {
  if (appStore.visibleGroups.length > 0) return
  try {
    const result = await fetchGroups()
    appStore.applyGroupQueryResult(result)
  } catch (err) {
    console.error('Load groups failed:', extractApiError(err, ''))
  }
}

// 加载指定会话的历史消息：走 conversation-context 接口取最近 50 条（时间升序）
async function loadSessionHistory(sessionId: number) {
  loadingHistory.value = true
  try {
    // Prefer context endpoint — returns recent messages (asc by time), plenty for UI.
    const ctx = await fetchAssistantConversationContext(sessionId, 50)
    messages.value = (ctx.recentMessages ?? []).map(toUi)
  } catch (err) {
    console.error('Load session history failed:', extractApiError(err, ''))
    messages.value = []
  } finally {
    loadingHistory.value = false
  }
}

// ── Session actions ──
// 新建会话：调接口后把新会话插到列表顶部并立即激活（清空消息区）
async function handleNewSession() {
  try {
    const detail = await createAssistantSession()
    const item: AssistantSessionListItem = {
      sessionId: detail.sessionId,
      title: detail.title,
      lastMessageAt: detail.lastMessageAt,
    }
    sessions.value.unshift(item)
    activeSessionId.value = detail.sessionId
    messages.value = []
  } catch (err) {
    console.error('Create session failed:', extractApiError(err, '创建会话失败'))
  }
}

// 切换会话：重复点击忽略；若有流式进行中先中止，再加载该会话历史
async function handleSelectSession(id: number) {
  if (activeSessionId.value === id) return
  if (streaming.value) abortStream()
  activeSessionId.value = id
  await loadSessionHistory(id)
}

// 重命名会话：以服务端返回的标题为准同步到本地列表
async function handleRenameSession(id: number, title: string) {
  try {
    const detail = await renameAssistantSession(id, title)
    const target = sessions.value.find((s) => s.sessionId === id)
    if (target) target.title = detail.title
  } catch (err) {
    console.error('Rename session failed:', extractApiError(err, '重命名失败'))
  }
}

// 删除会话：二次确认后调接口并从列表移除；若删的是当前会话则清空激活态
async function handleDeleteSession(id: number) {
  const target = sessions.value.find((s) => s.sessionId === id)
  if (!target) return
  try {
    await ElMessageBox.confirm(
      `确定删除会话「${target.title}」吗？会话下的所有消息都会被清除。`,
      '删除会话',
      { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deleteAssistantSession(id)
    sessions.value = sessions.value.filter((s) => s.sessionId !== id)
    if (activeSessionId.value === id) {
      activeSessionId.value = null
      messages.value = []
    }
  } catch (err) {
    console.error('Delete session failed:', extractApiError(err, '删除失败'))
  }
}

// ── Ensure a session exists before asking ──
// 提问前兜底：没有激活会话时先静默创建一个并激活，返回 sessionId
async function ensureSession(): Promise<number | null> {
  if (activeSessionId.value !== null) return activeSessionId.value
  try {
    const detail = await createAssistantSession()
    const item: AssistantSessionListItem = {
      sessionId: detail.sessionId,
      title: detail.title,
      lastMessageAt: detail.lastMessageAt,
    }
    sessions.value.unshift(item)
    activeSessionId.value = detail.sessionId
    messages.value = []
    return detail.sessionId
  } catch (err) {
    console.error('Create session failed:', extractApiError(err, '创建会话失败'))
    return null
  }
}

// ── Streaming ask ──
// 发起一次流式问答（由 Composer @submit 触发）：
//   1) 校验：非空、非流式中、KB 模式必须已选群组、必须有 token；
//   2) ensureSession 保证会话存在，并记录 lastAskPayload 供重试；
//   3) 乐观插入用户气泡 + 助手占位气泡（target 指向占位气泡的响应式引用）；
//   4) streamAssistantMessage 建立 SSE，onEvent 把增量写入 target；
//   5) 中断（AbortError）保留已生成内容并标注"已中断"；其余异常标记 failed。
async function handleAsk(text: string) {
  if (!text.trim() || streaming.value) return

  // KB mode requires a group
  if (mode.value === 'KB_SEARCH' && selectedGroupId.value === null) {
    return
  }
  if (!authStore.accessToken) {
    console.warn('No access token; cannot stream.')
    return
  }

  const sessionId = await ensureSession()
  if (sessionId === null) return

  const groupIdForPayload = mode.value === 'KB_SEARCH' ? selectedGroupId.value : null

  lastAskPayload = { text, mode: mode.value, groupId: groupIdForPayload }

  // Push user bubble (optimistic)
  const nowIso = new Date().toISOString()
  const userMsg: UiAssistantMessage = {
    localId: localId(),
    messageId: null,
    role: 'USER',
    content: text,
    toolMode: mode.value,
    groupId: groupIdForPayload,
    createdAt: nowIso,
  }
  messages.value.push(userMsg)

  // Push assistant placeholder
  const assistantMsg: UiAssistantMessage = {
    localId: localId(),
    messageId: null,
    role: 'ASSISTANT',
    content: '',
    toolMode: mode.value,
    groupId: groupIdForPayload,
    createdAt: new Date().toISOString(),
    streaming: true,
    citations: [],
  }
  messages.value.push(assistantMsg)
  // 关键：push 后 Vue 会把元素包一层 Proxy，只有通过 Proxy 改属性才会触发响应式。
  // 直接保留 push 前的原始对象会"写到原始内存但 Vue 不知道"，打字机效果失效。
  const target = messages.value[messages.value.length - 1]!

  streaming.value = true
  streamAbort = new AbortController()

  try {
    await streamAssistantMessage(
      {
        sessionId,
        message: text,
        toolMode: mode.value,
        groupId: groupIdForPayload,
      },
      authStore.accessToken,
      {
        signal: streamAbort.signal,
        onEvent: (ev) => onStreamEvent(ev, target),
      },
    )
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      // User aborted — preserve whatever content we already have
      target.streaming = false
      if (!target.content) {
        target.content = '_(已中断)_'
      } else {
        target.content += '\n\n_(已中断)_'
      }
    } else {
      target.streaming = false
      target.failed = true
      target.failureMessage = extractApiError(err, '流式请求失败')
    }
  } finally {
    streaming.value = false
    streamAbort = null
    // Bump the session in the local list (move to top, update lastMessageAt)
    bumpSession(sessionId)
    // Silently reload sessions so auto-rename takes effect
    loadSessions(true)
  }
}

// SSE 事件分发：start 置流式态；delta 追加增量文本；done 用服务端最终
// 回复/messageId/引用列表覆盖本地状态；error 标记失败并展示原因
function onStreamEvent(ev: AssistantChatStreamEvent, target: UiAssistantMessage) {
  switch (ev.event) {
    case 'start':
      target.streaming = true
      break
    case 'delta':
      if (ev.delta) target.content += ev.delta
      break
    case 'done':
      if (ev.reply != null && ev.reply.length > 0) {
        // Prefer authoritative final reply
        target.content = ev.reply
      }
      if (ev.messageId != null) {
        target.messageId = ev.messageId
        target.localId = `srv-${ev.messageId}`
      }
      target.citations = ev.citations ?? []
      target.streaming = false
      break
    case 'error':
      target.streaming = false
      target.failed = true
      target.failureMessage = ev.error ?? '生成失败'
      break
  }
}

// 中断当前流式请求（Esc 快捷键或"停止"按钮触发）
function abortStream() {
  if (streamAbort) {
    streamAbort.abort()
  }
}

// 本轮对话结束后把该会话移到列表顶部并刷新 lastMessageAt（纯本地排序）
function bumpSession(sessionId: number) {
  const idx = sessions.value.findIndex((s) => s.sessionId === sessionId)
  if (idx < 0) return
  const [item] = sessions.value.splice(idx, 1)
  if (item) {
    item.lastMessageAt = new Date().toISOString()
    sessions.value.unshift(item)
  }
}

// 重试：移除末尾失败的助手气泡，恢复当时的模式/群组后按原参数重新提问
async function handleRetry() {
  if (!lastAskPayload || streaming.value) return
  // Drop the trailing failed assistant message; keep user message
  const last = messages.value[messages.value.length - 1]
  if (last && last.role === 'ASSISTANT' && last.failed) {
    messages.value.pop()
  }
  // Restore mode + group (in case user changed them before retry)
  const previous = lastAskPayload
  mode.value = previous.mode
  if (previous.mode === 'KB_SEARCH' && previous.groupId !== null) {
    selectedGroupId.value = previous.groupId
  }
  await handleAsk(previous.text)
}

// Composer 组件引用：供引导页 starter 回填输入框用
const composerRef = ref<InstanceType<typeof AssistantComposer> | null>(null)

// 用户点了空态引导页的 starter：切到对应模式并把 prompt 填进输入框
function handleStarterPick(prompt: string, starterMode: AssistantToolMode) {
  mode.value = starterMode
  composerRef.value?.setText(prompt)
}

// ── Citation preview bridge ──
// 引用预览弹窗显隐
const previewVisible = ref(false)
// 传给预览弹窗的文档信息（由引用条目拼装，snippet 作为预览文本）
const previewDocument = ref<DocumentItem | null>(null)

// 点击引用 chip：用当前群组 + 引用信息拼一个最小 DocumentItem 打开预览；
// 无 documentId 或未选群组时直接忽略
function openCitation(c: AssistantCitationItem) {
  if (c.documentId === null) return
  // Use currently selected group as best guess — KB_SEARCH tracks it precisely
  const groupId = selectedGroupId.value
  if (groupId === null) return
  const idx = c.fileName.lastIndexOf('.')
  const ext = idx >= 0 ? c.fileName.slice(idx + 1).toLowerCase() : null
  previewDocument.value = {
    documentId: c.documentId,
    groupId,
    fileName: c.fileName,
    fileExt: ext,
    contentType: null,
    fileSize: 0,
    status: 'READY',
    failureReason: null,
    uploadedAt: '',
    uploaderUserId: null,
    uploaderDisplayName: null,
    uploaderUserCode: null,
    previewText: c.snippet,
  }
  previewVisible.value = true
}

// ── Init ──
// 初始化：并行拉会话列表与群组；默认进入第一个会话；KB 模式默认选中第一个群组
onMounted(async () => {
  await Promise.all([loadSessions(), loadGroupsIfNeeded()])
  if (sessions.value.length > 0 && activeSessionId.value === null) {
    const firstSession = sessions.value[0]
    if (firstSession) {
      activeSessionId.value = firstSession.sessionId
      await loadSessionHistory(firstSession.sessionId)
    }
  }
  if (selectedGroupId.value === null && appStore.visibleGroups.length > 0) {
    const firstGroup = appStore.visibleGroups[0]
    if (firstGroup) selectedGroupId.value = firstGroup.groupId
  }
})
</script>

<template>
  <div class="asst-page">
    <!-- 左侧会话栏：列表/新建/重命名/删除等动作全部回传本页处理 -->
    <AssistantSidebar
      :sessions="sessions"
      :active-session-id="activeSessionId"
      :loading="sessionsLoading"
      @new-session="handleNewSession"
      @select-session="handleSelectSession"
      @rename-session="handleRenameSession"
      @delete-session="handleDeleteSession"
      @refresh="() => loadSessions()"
    />

    <!-- 主内容区 -->
    <main class="asst-page__main">
      <!-- 已进入会话且有消息/加载中 → 消息流；否则 → 空态引导页 -->
      <template v-if="activeSessionId !== null && (messages.length > 0 || loadingHistory)">
        <AssistantTranscript
          :messages="messages"
          :session-id="activeSessionId"
          :session-title="activeSession?.title ?? ''"
          :mode="mode"
          :group-name="selectedGroupName"
          :loading-history="loadingHistory"
          @update:mode="(m) => (mode = m)"
          @inspect-citation="openCitation"
          @retry="handleRetry"
        />
      </template>
      <template v-else>
        <AssistantEmpty
          :mode="mode"
          :has-kb="selectedGroupId !== null"
          @pick="(prompt, starterMode) => handleStarterPick(prompt, starterMode)"
        />
      </template>

      <!-- 底部输入条：mode 与群组双 v-model，提交/中断委托本页 -->
      <AssistantComposer
        ref="composerRef"
        v-model:mode="mode"
        v-model:selected-group-id="selectedGroupId"
        :disabled="false"
        :streaming="streaming"
        :groups="appStore.visibleGroups"
        @submit="handleAsk"
        @abort="abortStream"
      />
    </main>

    <!-- 引用溯源预览弹窗（点击引用 chip 后打开） -->
    <DocumentPreviewModal
      :visible="previewVisible"
      :document="previewDocument"
      @update:visible="(v: boolean) => (previewVisible = v)"
    />
  </div>
</template>

<style scoped>
.asst-page {
  display: flex;
  height: 100%;
  min-height: 600px;
  background: #fff;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
  position: relative;
}

.asst-page__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  position: relative;
}

@media (max-width: 900px) {
  .asst-page {
    flex-direction: column;
    height: auto;
    min-height: 100vh;
    border-radius: 0;
  }
}
</style>
