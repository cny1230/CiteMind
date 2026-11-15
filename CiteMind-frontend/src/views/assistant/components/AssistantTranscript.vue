<script setup lang="ts">
// ============================================================
// 对话主区（Transcript）：粘性头部 + 可滚动消息流
// ------------------------------------------------------------
// 职责：渲染当前会话的标题栏（内嵌 ModeSwitcher 便于中途切换模式）
//   与消息列表（逐条交给 AssistantMessage），并负责滚动体验：
//   - 距底部 <80px 视为"贴底"，新消息 / 流式增量时自动跟随滚动；
//   - 用户向上滚动后出现"回到底部"悬浮按钮；
//   - 切换会话时立即（无动画）滚到底并重置贴底状态。
// 依赖：无 api 调用，仅依赖类型与子组件。
// 父子关系：父 → AssistantView.vue；子 → AssistantMessage.vue、ModeSwitcher.vue。
// ============================================================
import { ref, watch, nextTick } from 'vue'
import type { AssistantCitationItem, AssistantToolMode } from '@/types/assistant'
import AssistantMessage, { type UiAssistantMessage } from './AssistantMessage.vue'
import ModeSwitcher from './ModeSwitcher.vue'

// messages：当前会话消息；sessionId/sessionTitle：头部展示；
// mode/groupName：头部模式切换与群组名；loadingHistory：历史加载态
const props = defineProps<{
  messages: UiAssistantMessage[]
  sessionId: number | null
  sessionTitle: string
  mode: AssistantToolMode
  groupName: string
  loadingHistory: boolean
}>()

// 模式切换、引用查看、失败重试全部上抛给 AssistantView
const emit = defineEmits<{
  'update:mode': [mode: AssistantToolMode]
  'inspect-citation': [citation: AssistantCitationItem]
  retry: []
}>()

// 滚动容器引用
const scrollRef = ref<HTMLElement | null>(null)
// 是否贴底（距底部 <80px），决定是否自动跟随滚动
const isAtBottom = ref(true)

// 滚到底部；smooth=false 用于切换会话时的瞬时定位
function scrollToBottom(smooth = true) {
  const el = scrollRef.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
}

// 滚动监听：以 80px 阈值更新贴底标记
function onScroll() {
  const el = scrollRef.value
  if (!el) return
  const threshold = 80
  isAtBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
}

// 消息条数变化（新消息 / 重试删气泡）后，若处于贴底状态则平滑滚到底
watch(
  () => props.messages.length,
  async () => {
    await nextTick()
    if (isAtBottom.value) scrollToBottom(true)
  },
)

// 切换会话：DOM 更新后瞬时滚到底并重置贴底状态
watch(
  () => props.sessionId,
  async () => {
    await nextTick()
    scrollToBottom(false)
    isAtBottom.value = true
  },
)

// Stream deltas: when last assistant message content length changes
watch(
  () => props.messages[props.messages.length - 1]?.content.length ?? 0,
  async () => {
    await nextTick()
    if (isAtBottom.value) scrollToBottom(false)
  },
)
</script>

<template>
  <div class="atx">
    <!-- Sticky header -->
    <header class="atx__head">
      <div class="atx__head-left">
        <span class="atx__eyebrow">Active Thread</span>
        <h2 class="atx__title" :title="sessionTitle">
          <span class="atx__title-pulse" />
          {{ sessionTitle || '未命名会话' }}
        </h2>
      </div>

      <div class="atx__head-right">
        <ModeSwitcher :mode="mode" compact @update:mode="(m) => emit('update:mode', m)" />
      </div>
    </header>

    <!-- Scroll area -->
    <div ref="scrollRef" class="atx__scroll" @scroll="onScroll">
      <!-- Loading history skeleton -->
      <div v-if="loadingHistory" class="atx__loading">
        <div class="atx__loading-ring" />
        <span>加载历史消息…</span>
      </div>

      <!-- 消息流：逐条渲染，引用与重试事件继续向上冒泡 -->
      <div v-else class="atx__thread">
        <AssistantMessage
          v-for="m in messages"
          :key="m.localId"
          :message="m"
          @inspect-citation="(c) => emit('inspect-citation', c)"
          @retry="emit('retry')"
        />
      </div>
    </div>

    <!-- Scroll-to-bottom fab -->
    <button
      v-show="!isAtBottom"
      class="atx__scroll-btn"
      type="button"
      @click="scrollToBottom(true)"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <polyline points="19 12 12 19 5 12" />
      </svg>
      <span>最新</span>
    </button>
  </div>
</template>

<style scoped>
.atx {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #fff;
  position: relative;
}

.atx > * {
  position: relative;
  z-index: 1;
}

/* Head */
.atx__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 32px 14px;
  border-bottom: 1px solid var(--border-subtle);
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  position: sticky;
  top: 0;
  z-index: 5;
  flex-shrink: 0;
}

.atx__head-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.atx__eyebrow {
  font-family: 'Poppins', sans-serif;
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--brand-primary);
}

.atx__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-family: 'Poppins', 'Noto Sans SC', sans-serif;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 400px;
}

.atx__title-pulse {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--brand-accent);
  box-shadow: 0 0 10px rgba(92, 201, 193, 0.6);
  flex-shrink: 0;
  animation: atx-pulse 2.2s ease-in-out infinite;
}

@keyframes atx-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.88); }
}

.atx__head-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* Scroll area with grid paper background (matches Qa) */
.atx__scroll {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border-default) transparent;
  background-image:
    linear-gradient(rgba(74, 144, 217, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(74, 144, 217, 0.04) 1px, transparent 1px);
  background-size: 28px 28px;
  background-position: 0 0;
}

.atx__scroll::-webkit-scrollbar {
  width: 6px;
}

.atx__scroll::-webkit-scrollbar-thumb {
  background: var(--border-default);
  border-radius: 3px;
}

.atx__scroll::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

.atx__thread {
  max-width: 900px;
  margin: 0 auto;
  padding: 8px 0 24px;
}

/* Loading */
.atx__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 80px 20px;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.atx__loading-ring {
  width: 18px;
  height: 18px;
  border: 2px solid var(--surface-muted);
  border-top-color: var(--brand-primary);
  border-radius: 50%;
  animation: atx-spin 0.7s linear infinite;
}

@keyframes atx-spin {
  to { transform: rotate(360deg); }
}

/* Scroll-to-bottom */
.atx__scroll-btn {
  position: absolute;
  right: 24px;
  bottom: 16px;
  z-index: 10;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  font-family: inherit;
  font-size: 0.76rem;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  border: none;
  border-radius: 100px;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(74, 144, 217, 0.3);
  animation: fade-in 0.2s ease-out;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

.atx__scroll-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(74, 144, 217, 0.4);
}
</style>
