<script setup lang="ts">
// ============================================================
// 知识库问答页（QaView）
// 路由：/app/qa（DefaultLayout 下的子路由，见 src/router）
// 职责：RAG 问答主页面 —— 左侧为群组/历史会话侧栏，右侧为对话区；
//       组织「提问 → 流式回答 → 引用证据展示 → 引用文档预览」的完整
//       链路，并管理按群组加载的问答历史（详情懒加载、删除）。
// 依赖 API 模块（src/api）：
//   - qa.ts：listQaRecords（历史分页）、getQaRecord（会话详情）、
//     deleteQaRecord（删除记录）、streamAskQuestion（SSE 流式提问），
//     以及 CitationItem / EvidenceOverview / QaRecord* 等类型
//   - group.ts：fetchGroups（拉取群组）；http.ts：extractApiError
//   - document.ts：仅引用 DocumentItem 类型构造预览弹窗数据
//   - stores：app（群组缓存）、auth（登录态与 access token）
// 主要数据流：
//   挂载 / 切换群组 → loadHistoryForSelectedGroup 拉取最近 20 条历史
//   （historyRequestSeq 防竞态）→ buildHistorySession 生成轻量会话
//   （先用 answerPreview 占位，点开时 hydrateHistorySession 拉详情补全）；
//   handleAsk：先落用户消息与 AI 占位消息，再经 streamAskQuestion 的
//   onToken / onCitations / onEvidenceOverview / onError / onRecord
//   回调增量更新消息；提问时若当前会话不属于所选群组则自动新建会话。
// 组件关系：
//   本页为父组件 —— QaSidebar（群组 + 历史）、QaTranscript（消息流，
//   内部渲染 QaMessage / CitationRail / EvidenceOverviewPanel）、
//   QaComposer（输入框，经 ref 调用 setText 回填示例问题）、
//   QaEmptyHero（无消息时的引导页）、DocumentPreviewModal（引用预览）。
// ============================================================
import { ref, computed, watch, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { fetchGroups } from '@/api/group'
import {
  deleteQaRecord,
  getQaRecord,
  listQaRecords,
  streamAskQuestion,
  type CitationItem,
  type EvidenceOverview,
  type QaRecordCitation,
  type QaRecordDetail,
  type QaRecordListItem,
} from '@/api/qa'
import { extractApiError } from '@/api/http'
import type { DocumentItem } from '@/api/document'
import DocumentPreviewModal from '@/components/DocumentPreviewModal.vue'
import QaSidebar from './components/QaSidebar.vue'
import QaTranscript from './components/QaTranscript.vue'
import QaComposer from './components/QaComposer.vue'
import QaEmptyHero from './components/QaEmptyHero.vue'
import { useQaSessions, type QaMessage, type QaSession } from './composables/useQaSessions'

const appStore = useAppStore()
const authStore = useAuthStore()
// 会话状态与操作方法（useQaSessions 为模块级单例，多组件共享同一份 sessions）
const {
  sessions,
  activeSession,
  activeSessionId,
  createSession,
  selectSession,
  deleteSession,
  appendMessage,
  updateMessage,
  uid,
} = useQaSessions()

// ── Group state ──
// 群组加载状态与当前选中群组（初始值取全局缓存的 currentGroupId）
const groupsLoading = ref(false)
const groupsError = ref('')
const selectedGroupId = ref<number | null>(appStore.currentGroupId)

// 当前群组名：用于侧栏、输入框上下文提示与空态引导页
const selectedGroupName = computed(() => {
  const g = appStore.visibleGroups.find((x) => x.groupId === selectedGroupId.value)
  return g?.groupName ?? ''
})

// 是否已选择群组：未选择时输入框禁用、空态页显示警示
const hasGroup = computed(() => selectedGroupId.value !== null)

// 拉取群组并写入全局 store；必要时回退默认群组，随后加载该群组的问答历史
async function loadGroups() {
  groupsLoading.value = true
  groupsError.value = ''
  try {
    const result = await fetchGroups()
    appStore.applyGroupQueryResult(result)
    if (selectedGroupId.value === null || !appStore.visibleGroups.some((g) => g.groupId === selectedGroupId.value)) {
      selectedGroupId.value = appStore.currentGroupId ?? appStore.visibleGroups[0]?.groupId ?? null
    }
    await loadHistoryForSelectedGroup()
  } catch (err) {
    groupsError.value = extractApiError(err, '加载群组失败')
  } finally {
    groupsLoading.value = false
  }
}

// 切换群组：同步全局 store 并重新加载该群组的历史会话
// （当前激活会话暂不重置，见下方注释；提问时才按需重新绑定）
watch(selectedGroupId, (v) => {
  appStore.setCurrentGroupId(v)
  // If active session is bound to a different group, leave it intact — user may be reviewing history.
  // When the user asks a new question, we'll rebind if needed.
  loadHistoryForSelectedGroup()
})

// ── Ask flow ──
// 提问进行中标记 / 历史加载状态；historyRequestSeq 为请求序号，
// 用于丢弃快速切换群组时过期请求的响应（防竞态）
const asking = ref(false)
const historyLoading = ref(false)
const historyError = ref('')
let historyRequestSeq = 0

// 历史记录 → 本地会话 ID 的映射规则：qa-record-<id>（避免与新建会话 ID 冲突）
function recordSessionId(recordId: number): string {
  return `qa-record-${recordId}`
}

// createdAt 解析为毫秒时间戳；解析失败时兜底为当前时间
function timestampOf(value: string): number {
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : Date.now()
}

// 按 groupId 查群组名；查不到时退回当前选中群组名
function groupNameOf(groupId: number | null): string {
  if (groupId === null) return ''
  return appStore.visibleGroups.find((group) => group.groupId === groupId)?.groupName ?? selectedGroupName.value
}

// 后端引用结构 → 前端 CitationItem（score 缺省时补 0，避免界面出现 NaN）
function mapCitation(citation: QaRecordCitation): CitationItem {
  return {
    documentId: citation.documentId,
    chunkId: citation.chunkId,
    chunkIndex: citation.chunkIndex,
    fileName: citation.fileName,
    score: citation.score ?? 0,
    snippet: citation.snippet,
  }
}

// 把一条历史记录包装成本地会话：先用 answerPreview / reasonCode 生成
// 「问 + 答」两条占位消息，引用与证据概览留空（hydrated=false），
// 待用户点开时再通过详情接口补全
function buildHistorySession(record: QaRecordListItem): QaSession {
  const createdAt = timestampOf(record.createdAt)
  return {
    id: recordSessionId(record.id),
    title: record.question,
    groupId: record.groupId,
    groupName: groupNameOf(record.groupId),
    recordId: record.id,
    hydrated: false,
    createdAt,
    updatedAt: createdAt,
    messages: [
      {
        id: `qa-record-${record.id}-question`,
        role: 'user',
        content: record.question,
        createdAt,
      },
      {
        id: `qa-record-${record.id}-answer`,
        role: 'assistant',
        content: record.answerPreview || record.reasonCode || '',
        createdAt,
        pending: false,
        answered: record.answered,
        reasonCode: record.reasonCode,
        reasonMessage: null,
        citations: [],
        evidenceOverview: null,
        recordId: record.id,
      },
    ],
  }
}

// 用 getQaRecord 的详情回填会话：重建完整的两条消息并标记 hydrated，
// 避免同一会话重复请求详情
function applyRecordDetail(session: QaSession, detail: QaRecordDetail) {
  const createdAt = timestampOf(detail.createdAt)
  session.title = detail.question
  session.groupId = detail.groupId
  session.groupName = groupNameOf(detail.groupId)
  session.createdAt = createdAt
  session.updatedAt = createdAt
  session.hydrated = true
  session.messages = [
    {
      id: `qa-record-${detail.id}-question`,
      role: 'user',
      content: detail.question,
      createdAt,
    },
    {
      id: `qa-record-${detail.id}-answer`,
      role: 'assistant',
      content: detail.answered ? detail.answer ?? '' : detail.reasonMessage ?? '',
      createdAt,
      pending: false,
      answered: detail.answered,
      reasonCode: detail.reasonCode,
      reasonMessage: detail.reasonMessage,
      citations: detail.citations.map(mapCitation),
      evidenceOverview: detail.evidenceOverview ?? null,
      recordId: detail.id,
    },
  ]
}

// 拉取当前群组最近 20 条问答历史并生成会话列表，默认激活第一条并懒加载详情；
// 未登录或未选群组时清空本地会话；响应到达时若序号已过期则直接丢弃
async function loadHistoryForSelectedGroup() {
  if (!authStore.accessToken || selectedGroupId.value === null) {
    sessions.value = []
    activeSessionId.value = null
    return
  }
  const requestSeq = ++historyRequestSeq
  historyLoading.value = true
  historyError.value = ''
  try {
    const page = await listQaRecords({
      groupId: selectedGroupId.value,
      page: 1,
      pageSize: 20,
    })
    if (requestSeq !== historyRequestSeq) return
    sessions.value = page.items.map(buildHistorySession)
    activeSessionId.value = sessions.value[0]?.id ?? null
    if (activeSessionId.value) {
      await hydrateHistorySession(activeSessionId.value)
    }
  } catch (err) {
    if (requestSeq !== historyRequestSeq) return
    historyError.value = extractApiError(err, '加载历史会话失败')
  } finally {
    if (requestSeq === historyRequestSeq) {
      historyLoading.value = false
    }
  }
}

// 会话详情懒加载：仅对绑定了 recordId 且尚未 hydrated 的会话请求一次
async function hydrateHistorySession(sessionId: string) {
  const session = sessions.value.find((item) => item.id === sessionId)
  if (!session?.recordId || session.hydrated) return
  try {
    const detail = await getQaRecord(session.recordId)
    applyRecordDetail(session, detail)
  } catch (err) {
    historyError.value = extractApiError(err, '加载历史详情失败')
  }
}

// 确保有可提问的会话：当前激活会话属于所选群组则复用，否则新建会话，
// 避免把问题写进其它群组的历史会话里
function ensureSessionForAsk(): string {
  if (activeSession.value && activeSession.value.groupId === selectedGroupId.value) {
    return activeSession.value.id
  }
  // If active session is for a different group OR no active session, create a new one
  const s = createSession(selectedGroupId.value, selectedGroupName.value)
  return s.id
}

// 提问主流程：追加用户消息与 pending 的 AI 占位消息 → 调用
// streamAskQuestion 流式接口，各回调增量更新占位消息（token 累积、
// 引用到达、证据概览、流内错误、服务端记录 ID）→ 流结束后若从未
// 收到引用则做兜底收尾；整个请求异常时以 REQUEST_FAILED 呈现原因
async function handleAsk(text: string) {
  if (!text.trim() || selectedGroupId.value === null || asking.value) return
  if (!authStore.accessToken) {
    console.warn('No access token; cannot stream.')
    return
  }

  const sessionId = ensureSessionForAsk()
  const now = Date.now()

  // Push user message
  const userMsg: QaMessage = {
    id: uid(),
    role: 'user',
    content: text,
    createdAt: now,
  }
  appendMessage(sessionId, userMsg)

  // Push pending assistant message
  const assistantId = uid()
  appendMessage(sessionId, {
    id: assistantId,
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
    pending: true,
  })

  asking.value = true
  let citationsReceived = false
  let recordId: number | null = null
  try {
    let streamedContent = ''

    await streamAskQuestion(
      {
        groupId: selectedGroupId.value,
        question: text,
      },
      authStore.accessToken!,
      {
        // 流式 token：持续拼接并保持 pending 态（界面呈现打字机效果）
        onToken(token: string) {
          streamedContent += token
          updateMessage(sessionId, assistantId, {
            content: streamedContent,
            pending: true,
          })
        },
        // 引用到达：结束 pending 并写入回答依据；citationsReceived 标记
        // 防止流正常结束后的兜底逻辑覆盖已设置的引用
        onCitations(citations: CitationItem[]) {
          citationsReceived = true
          updateMessage(sessionId, assistantId, {
            content: streamedContent,
            pending: false,
            answered: citations.length > 0 || streamedContent.length > 0,
            reasonCode: null,
            reasonMessage: null,
            citations,
          })
        },
        // 证据覆盖概览（可为 null）单独增量更新
        onEvidenceOverview(overview: EvidenceOverview | null) {
          updateMessage(sessionId, assistantId, {
            evidenceOverview: overview,
          })
        },
        // 服务端流内错误：以 STREAM_ERROR 原因码呈现，保留已生成的内容
        onError(message: string) {
          updateMessage(sessionId, assistantId, {
            content: streamedContent,
            pending: false,
            answered: false,
            reasonCode: 'STREAM_ERROR',
            reasonMessage: message,
            citations: [],
            evidenceOverview: null,
          })
        },
        // 服务端落库后回传记录 ID，绑定到消息上供后续删除历史使用
        onRecord(id: number) {
          recordId = id
          updateMessage(sessionId, assistantId, {
            recordId: id,
          })
        },
      },
    )

    // 流正常结束但 onCitations 未被调用时的兜底（避免覆盖已设置的 citations）
    if (!citationsReceived) {
      updateMessage(sessionId, assistantId, {
        content: streamedContent,
        pending: false,
        answered: streamedContent.length > 0,
        reasonCode: null,
        reasonMessage: null,
        citations: [],
        evidenceOverview: null,
        recordId,
      })
    }
  } catch (err) {
    updateMessage(sessionId, assistantId, {
      content: '',
      pending: false,
      answered: false,
      reasonCode: 'REQUEST_FAILED',
      reasonMessage: extractApiError(err, '请求失败，请稍后再试'),
      citations: [],
      evidenceOverview: null,
    })
  } finally {
    asking.value = false
  }
}

// 侧栏「新建问答」：直接创建空白会话并激活
function handleNewChat() {
  createSession(selectedGroupId.value, selectedGroupName.value)
}

// 选中历史会话：激活并按需懒加载其完整详情（引用/证据）
function handleSelectSession(sessionId: string) {
  selectSession(sessionId)
  hydrateHistorySession(sessionId)
}

// 删除会话：绑定过服务端记录的先调删除接口，成功后再移除本地会话
async function handleDeleteSession(sessionId: string) {
  const session = sessions.value.find((item) => item.id === sessionId)
  if (!session) return
  historyError.value = ''
  try {
    if (session.recordId) {
      await deleteQaRecord(session.recordId)
    }
    deleteSession(sessionId)
  } catch (err) {
    historyError.value = extractApiError(err, '删除历史会话失败')
  }
}

// 输入框组件引用：空态页点击示例问题时用它回填文本
const composerRef = ref<InstanceType<typeof QaComposer> | null>(null)

// 空态页选中示例问题 → 回填到输入框（只填不发送，由用户确认后提交）
function handleStarterPick(prompt: string) {
  composerRef.value?.setText(prompt)
}

// ── Citation preview bridge ──
// 引用预览弹窗状态：由引用卡片点击驱动
const previewVisible = ref(false)
const previewDocument = ref<DocumentItem | null>(null)

// 点击引用卡片 → 用引用信息构造最小可用的 DocumentItem 直接打开
// 预览弹窗（snippet 作为预览文本），省去一次文档详情请求
function openCitation(c: CitationItem) {
  if (c.documentId === null) return
  const groupId = activeSession.value?.groupId ?? selectedGroupId.value
  if (groupId === null) return
  const fileExt = extractExt(c.fileName)
  previewDocument.value = {
    documentId: c.documentId,
    groupId,
    fileName: c.fileName,
    fileExt,
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

// 从文件名提取小写扩展名（无「.」时返回 null）
function extractExt(fileName: string): string | null {
  const idx = fileName.lastIndexOf('.')
  if (idx < 0) return null
  return fileName.slice(idx + 1).toLowerCase()
}

// ── Lifecycle ──
// 挂载初始化：无群组缓存时先拉取群组；有缓存时选中默认群组或直接加载历史
onMounted(() => {
  if (appStore.visibleGroups.length === 0) {
    loadGroups()
  } else if (selectedGroupId.value === null) {
    selectedGroupId.value = appStore.visibleGroups[0]?.groupId ?? null
  } else {
    loadHistoryForSelectedGroup()
  }
})
</script>

<template>
  <!-- 问答页根容器：左侧会话侧栏 + 右侧主区（flex 横向布局，窄屏切换为纵向） -->
  <div class="qa-page">
    <!-- 左侧栏：知识库（群组）切换、新建问答、历史会话列表 -->
    <QaSidebar
      v-model:selected-group-id="selectedGroupId"
      :groups="appStore.visibleGroups"
      :groups-loading="groupsLoading"
      :history-loading="historyLoading"
      :history-error="historyError"
      :sessions="sessions"
      :active-session-id="activeSessionId"
      @new-chat="handleNewChat"
      @select-session="handleSelectSession"
      @delete-session="handleDeleteSession"
    />

    <!-- 右侧主区：会话有消息时渲染对话流，否则渲染空态引导页；底部固定输入框 -->
    <main class="qa-page__main">
      <!-- 对话流：当前会话的全部消息（含引用证据），引用点击透传至预览弹窗 -->
      <template v-if="activeSession && activeSession.messages.length > 0">
        <QaTranscript
          :messages="activeSession.messages"
          :session-id="activeSession.id"
          :group-name="activeSession.groupName"
          @inspect-citation="openCitation"
        />
      </template>
      <!-- 空态引导页：展示示例问题卡片，点击回填输入框 -->
      <template v-else>
        <QaEmptyHero
          :group-name="selectedGroupName"
          :has-group="hasGroup"
          @pick="handleStarterPick"
        />
      </template>

      <!-- 输入区：提交问题（未选群组或生成中时禁用） -->
      <QaComposer
        ref="composerRef"
        :disabled="!hasGroup"
        :loading="asking"
        :group-name="selectedGroupName"
        @submit="handleAsk"
      />
    </main>

    <!-- 引用文档预览弹窗（复用全局组件） -->
    <DocumentPreviewModal
      :visible="previewVisible"
      :document="previewDocument"
      @update:visible="(v: boolean) => (previewVisible = v)"
    />
  </div>
</template>

<style scoped>
.qa-page {
  display: flex;
  height: 100%;
  min-height: 560px;
  background: #fff;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
}

.qa-page__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  position: relative;
}

@media (max-width: 900px) {
  .qa-page {
    flex-direction: column;
    height: auto;
    min-height: 100vh;
    border-radius: 0;
  }
}
</style>
