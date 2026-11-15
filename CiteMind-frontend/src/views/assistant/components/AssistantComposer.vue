<script setup lang="ts">
// ============================================================
// 助手对话底部输入条（Composer）
// ------------------------------------------------------------
// 职责：对话页底部的固定输入区，包含模式切换（ModeSwitcher）、
//   KB_SEARCH 模式下的知识库群组下拉、自适应高度的多行输入框、
//   快捷键提示与"发送 / 停止"按钮。
// 交互约定：
//   - Enter 发送、Shift+Enter 换行；流式进行中按 Esc 中断（emit abort）；
//   - mode 与 selectedGroupId 通过 v-model 双向绑定到父组件；
//   - KB_SEARCH 且未选群组时禁止发送（kbBlocked）。
// 依赖：无 api 调用，仅使用 @/types/assistant 类型与 stores/app 的 VisibleGroup 类型。
// 父子关系：父 → AssistantView.vue；子 → ModeSwitcher.vue。
//   对外暴露 focus / setText，供 AssistantView（经空态引导页选择 starter）回填。
// ============================================================
import { ref, computed, nextTick, watch } from 'vue'
import type { AssistantToolMode } from '@/types/assistant'
import type { VisibleGroup } from '@/stores/app'
import ModeSwitcher from './ModeSwitcher.vue'

// 外部状态：disabled 整体禁用；streaming 流式进行中（切换为"停止"按钮）
const props = defineProps<{
  disabled: boolean
  streaming: boolean
  mode: AssistantToolMode
  groups: VisibleGroup[]
  selectedGroupId: number | null
}>()

// submit(文本) / abort(中断) / 两个 v-model 的更新事件
const emit = defineEmits<{
  submit: [text: string]
  abort: []
  'update:mode': [mode: AssistantToolMode]
  'update:selectedGroupId': [val: number | null]
}>()

// 输入框内容（v-model）
const text = ref('')
// 原生 textarea 引用，用于自动调高与聚焦
const textareaRef = ref<HTMLTextAreaElement | null>(null)

// 群组下拉的双向绑定代理：读 props.selectedGroupId，写则上抛 update 事件
const groupValue = computed({
  get: () => props.selectedGroupId,
  set: (v) => emit('update:selectedGroupId', v),
})

// 是否处于知识库检索模式
const isKb = computed(() => props.mode === 'KB_SEARCH')
// KB 模式但未选群组 → 阻止发送
const kbBlocked = computed(() => isKb.value && props.selectedGroupId === null)

// 按状态动态切换占位文案：禁用 / KB 未选组 / 流式中 / 聊天或检索
const placeholder = computed(() => {
  if (props.disabled) return '请先在左侧选择或新建一个会话'
  if (kbBlocked.value) return '请先选择要检索的知识库群组'
  if (props.streaming) return '正在接收回答…（按 Esc 中断）'
  return props.mode === 'CHAT'
    ? '和 CiteMind 聊点什么？按 Enter 发送 / Shift + Enter 换行'
    : '在知识库中提问，答案会附带证据引用'
})

// 让 textarea 高度自适应内容（先重置再按 scrollHeight 撑开，上限 200px）
function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 200) + 'px'
}

// 内容变化后下一帧重算高度
watch(text, () => nextTick(autoResize))

// 键盘快捷键：Enter 发送（Shift+Enter 换行、输入法组词中不触发）；Esc 中断流式
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    submit()
    return
  }
  if (e.key === 'Escape' && props.streaming) {
    e.preventDefault()
    emit('abort')
  }
}

// 发送：去空白、各禁用态校验通过后上抛 submit 并清空输入框
function submit() {
  const v = text.value.trim()
  if (!v || props.disabled || props.streaming || kbBlocked.value) return
  emit('submit', v)
  text.value = ''
  nextTick(autoResize)
}

// 对外暴露：聚焦输入框
function focus() {
  textareaRef.value?.focus()
}

// 对外暴露：由父组件回填 starter prompt 并自动调高 + 聚焦
function setText(value: string) {
  text.value = value
  nextTick(() => {
    autoResize()
    textareaRef.value?.focus()
  })
}

// 把 focus / setText 暴露给父组件（AssistantView 经 ref 调用）
defineExpose({ focus, setText })
</script>

<template>
  <div class="acx">
    <!-- 居中限宽容器；外壳样式随 disabled / is-kb / streaming 三态切换 -->
    <div class="acx__wrap">
      <div class="acx__shell" :class="{ 'is-disabled': disabled, 'is-kb': isKb, 'is-streaming': streaming }">
        <!-- Meta bar -->
        <div class="acx__meta">
          <ModeSwitcher :mode="mode" @update:mode="(m) => emit('update:mode', m)" />

          <!-- KB picker (only in KB_SEARCH) -->
          <div v-if="isKb" class="acx__kb">
            <svg class="acx__kb-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M3 5v7c0 1.7 4 3 9 3s9-1.3 9-3V5" />
              <path d="M3 12v7c0 1.7 4 3 9 3s9-1.3 9-3v-7" />
            </svg>
            <select v-model="groupValue" class="acx__kb-select" :class="{ 'is-empty': selectedGroupId === null }">
              <option :value="null" disabled>选择知识库…</option>
              <option v-for="g in groups" :key="g.groupId" :value="g.groupId">
                {{ g.groupName }} · {{ g.relation === 'OWNER' ? '管理员' : '成员' }}
              </option>
            </select>
          </div>

          <div class="acx__spacer" />

          <!-- Status indicator -->
          <div v-if="streaming" class="acx__status">
            <span class="acx__status-dot" />
            <span>streaming</span>
          </div>
        </div>

        <!-- Textarea -->
        <textarea
          ref="textareaRef"
          v-model="text"
          :disabled="disabled"
          class="acx__input"
          rows="1"
          :placeholder="placeholder"
          @keydown="onKeydown"
        />

        <!-- Action bar -->
        <div class="acx__bar">
          <!-- 键盘快捷键提示：Enter 发送 / Shift+Enter 换行 / 流式中 Esc 中断 -->
          <div class="acx__hints">
            <kbd>Enter</kbd><span>发送</span>
            <span class="acx__sep">·</span>
            <kbd>Shift + Enter</kbd><span>换行</span>
            <template v-if="streaming">
              <span class="acx__sep">·</span>
              <kbd>Esc</kbd><span>中断</span>
            </template>
          </div>

          <!-- 发送/停止按钮：流式进行中显示"停止"，否则显示"发送" -->
          <button
            v-if="streaming"
            class="acx__btn acx__btn--abort"
            type="button"
            @click="emit('abort')"
          >
            <span class="acx__btn-square" />
            <span>停止</span>
          </button>
          <button
            v-else
            class="acx__btn acx__btn--send"
            type="button"
            :disabled="!text.trim() || disabled || kbBlocked"
            @click="submit"
          >
            <span>发送</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.acx {
  flex-shrink: 0;
  padding: 18px 24px 22px;
  background: linear-gradient(to top, #fff 70%, rgba(255, 255, 255, 0));
  position: relative;
  z-index: 4;
}

.acx__wrap {
  max-width: 900px;
  margin: 0 auto;
}

/* Shell */
.acx__shell {
  background: #fff;
  border: 1.5px solid var(--border-default);
  border-radius: 16px;
  padding: 12px 14px 10px;
  box-shadow:
    0 4px 14px rgba(0, 0, 0, 0.04),
    0 1px 2px rgba(0, 0, 0, 0.03);
  transition: all 0.25s ease;
}

.acx__shell:focus-within {
  border-color: var(--brand-primary);
  box-shadow:
    0 0 0 4px rgba(74, 144, 217, 0.08),
    0 8px 20px rgba(74, 144, 217, 0.08);
}

.acx__shell.is-kb {
  border-color: rgba(92, 201, 193, 0.35);
}

.acx__shell.is-kb:focus-within {
  border-color: var(--brand-accent-dark);
  box-shadow:
    0 0 0 4px rgba(92, 201, 193, 0.1),
    0 8px 20px rgba(92, 201, 193, 0.1);
}

.acx__shell.is-streaming {
  border-color: var(--brand-accent);
  box-shadow:
    0 0 0 3px rgba(92, 201, 193, 0.15),
    0 8px 20px rgba(0, 0, 0, 0.05);
  animation: acx-breathing 2.5s ease-in-out infinite;
}

@keyframes acx-breathing {
  0%, 100% { box-shadow: 0 0 0 3px rgba(92, 201, 193, 0.15), 0 8px 20px rgba(0, 0, 0, 0.05); }
  50%     { box-shadow: 0 0 0 5px rgba(92, 201, 193, 0.22), 0 8px 20px rgba(0, 0, 0, 0.05); }
}

.acx__shell.is-disabled {
  opacity: 0.7;
  background: var(--surface-subtle);
}

/* Meta */
.acx__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--border-subtle);
  flex-wrap: wrap;
}

.acx__kb {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 8px;
  background: rgba(92, 201, 193, 0.08);
  border: 1px solid rgba(92, 201, 193, 0.25);
  border-radius: 100px;
  animation: acx-kb-in 0.25s ease-out;
}

@keyframes acx-kb-in {
  from { opacity: 0; transform: translateX(-4px); }
  to   { opacity: 1; transform: translateX(0); }
}

.acx__kb-icon {
  color: var(--brand-accent-dark);
  flex-shrink: 0;
}

.acx__kb-select {
  font-family: inherit;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--text-primary);
  background: transparent;
  border: none;
  outline: none;
  cursor: pointer;
  max-width: 200px;
  padding-right: 4px;
}

.acx__kb-select:disabled {
  cursor: not-allowed;
}

.acx__kb-select.is-empty {
  color: #b45309;
}

.acx__kb-select option {
  background: #fff;
  color: var(--text-primary);
}

.acx__spacer {
  flex: 1;
}

.acx__status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--brand-accent-dark);
}

.acx__status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--brand-accent);
  box-shadow: 0 0 8px rgba(92, 201, 193, 0.8);
  animation: acx-pulse 1s ease-in-out infinite;
}

@keyframes acx-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%     { opacity: 0.4; transform: scale(0.75); }
}

/* Input */
.acx__input {
  width: 100%;
  min-height: 44px;
  max-height: 200px;
  margin-top: 8px;
  padding: 4px 2px 0;
  border: none;
  outline: none;
  resize: none;
  font-family: inherit;
  font-size: 0.96rem;
  line-height: 1.6;
  color: var(--text-primary);
  background: transparent;
  caret-color: var(--brand-primary);
}

.acx__input::placeholder {
  color: var(--text-muted);
}

.acx__input:disabled {
  cursor: not-allowed;
}

/* Bar */
.acx__bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-subtle);
}

.acx__hints {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 0.72rem;
  color: var(--text-muted);
}

.acx__hints kbd {
  display: inline-block;
  padding: 2px 7px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--surface-subtle);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  box-shadow: 0 1px 0 var(--border-default);
}

.acx__sep {
  opacity: 0.5;
  margin: 0 2px;
}

/* Buttons */
.acx__btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 18px;
  font-family: inherit;
  font-size: 0.84rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.acx__btn--send {
  color: #fff;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  box-shadow: 0 4px 12px rgba(74, 144, 217, 0.25);
}

.acx__shell.is-kb .acx__btn--send {
  background: linear-gradient(135deg, var(--brand-accent), var(--brand-accent-dark));
  box-shadow: 0 4px 12px rgba(92, 201, 193, 0.3);
}

.acx__btn--send:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(74, 144, 217, 0.35);
}

.acx__shell.is-kb .acx__btn--send:hover:not(:disabled) {
  box-shadow: 0 8px 18px rgba(92, 201, 193, 0.4);
}

.acx__btn--send:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  background: linear-gradient(135deg, #94a3b8, #64748b);
  box-shadow: none;
}

.acx__btn--abort {
  color: #dc2626;
  background: #fff;
  border: 1px solid rgba(239, 68, 68, 0.35);
}

.acx__btn--abort:hover {
  background: rgba(239, 68, 68, 0.06);
  border-color: #ef4444;
}

.acx__btn-square {
  display: inline-block;
  width: 9px;
  height: 9px;
  background: #ef4444;
  border-radius: 2px;
}
</style>

