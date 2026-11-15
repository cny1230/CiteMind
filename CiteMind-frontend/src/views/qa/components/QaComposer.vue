<script setup lang="ts">
// ============================================================
// 问答 - 问题输入框（QaComposer）
// 归属页面：/app/qa（被 QaView.vue 引用，固定在对话区底部）
// 职责：问题输入区 —— 自适应高度的多行输入；Enter 发送 /
//       Shift+Enter 换行（兼容中文输入法组合态）；展示当前知识库
//       上下文提示与生成中加载态；通过 defineExpose 暴露 focus /
//       setText，供空态页回填示例问题。
// 依赖：不调用任何 API —— disabled / loading / groupName 由父组件
//       传入，提交仅通过 submit 事件上抛（QaView.handleAsk 发起请求）。
// 组件关系：仅被 QaView 引用（父组件以 ref 调用其 setText / focus）；无子组件。
// ============================================================
import { ref, computed, nextTick, watch } from 'vue'

// 父组件传入：禁用态（未选群组）、生成中加载态、占位文案与当前群组名
const props = defineProps<{
  disabled: boolean
  loading: boolean
  placeholder?: string
  groupName?: string
}>()

// submit：把校验后的非空文本交给父组件发送
const emit = defineEmits<{
  submit: [text: string]
}>()

// 输入内容与 textarea DOM 引用（用于自动调高与聚焦）
const text = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

// 占位文案按状态切换：未选群组提示 → 生成中提示 → 默认操作说明
const hint = computed(() =>
  props.disabled
    ? '请先在左侧选择一个知识库群组'
    : props.loading
      ? '正在等待回答…'
      : props.placeholder || '输入你的问题，按 Enter 发送，Shift + Enter 换行',
)

// 自适应高度：先重置为 auto 再按内容撑开，超过 200px 后内部滚动
function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  const max = 200
  el.style.height = Math.min(el.scrollHeight, max) + 'px'
}

// 内容变化后在下一帧重新计算高度（等 DOM 更新完成）
watch(text, () => {
  nextTick(autoResize)
})

// 键盘行为：Enter 直接发送、Shift+Enter 换行；isComposing 判断防止
// 中文输入法选词回车被误判为发送
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    submit()
  }
}

// 发送前校验：空文本 / 禁用 / 生成中直接忽略；发送后清空输入框
function submit() {
  const v = text.value.trim()
  if (!v || props.disabled || props.loading) return
  emit('submit', v)
  text.value = ''
  nextTick(autoResize)
}

// 聚焦输入框（供父组件通过模板 ref 调用）
function focus() {
  textareaRef.value?.focus()
}

// 回填文本（供父组件调用）：回填后自适应高度并聚焦
function setText(value: string) {
  text.value = value
  nextTick(() => {
    autoResize()
    textareaRef.value?.focus()
  })
}

// 向父组件暴露 focus / setText 两个方法
defineExpose({ focus, setText })
</script>

<template>
  <!-- 输入区整体：上下文提示条 + 输入外壳（含快捷键说明与发送按钮） -->
  <div class="qa-composer">
    <div class="qa-composer__wrap">
      <!-- Context chip -->
      <div v-if="groupName" class="qa-composer__context">
        <span class="qa-composer__context-dot" />
        <span class="qa-composer__context-text">正在询问：<strong>{{ groupName }}</strong></span>
      </div>

      <div class="qa-composer__shell" :class="{ 'is-disabled': disabled }">
        <textarea
          ref="textareaRef"
          v-model="text"
          :disabled="disabled || loading"
          class="qa-composer__input"
          rows="1"
          :placeholder="hint"
          @keydown="onKeydown"
        />

        <!-- 底部操作条：左侧快捷键说明，右侧发送按钮（生成中显示 spinner） -->
        <div class="qa-composer__bar">
          <div class="qa-composer__bar-left">
            <kbd class="qa-composer__kbd">Enter</kbd>
            <span class="qa-composer__kbd-label">发送</span>
            <span class="qa-composer__kbd-sep">·</span>
            <kbd class="qa-composer__kbd">Shift + Enter</kbd>
            <span class="qa-composer__kbd-label">换行</span>
          </div>
          <button
            class="qa-composer__send"
            type="button"
            :disabled="!text.trim() || disabled || loading"
            @click="submit"
          >
            <template v-if="loading">
              <span class="qa-composer__spinner" />
              <span>生成中</span>
            </template>
            <template v-else>
              <span>发送</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </template>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.qa-composer {
  flex-shrink: 0;
  padding: 18px 24px 22px;
  background: linear-gradient(to top, #fff 70%, rgba(255, 255, 255, 0));
  position: relative;
}

.qa-composer__wrap {
  max-width: 860px;
  margin: 0 auto;
}

.qa-composer__context {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;
  padding: 3px 12px;
  background: rgba(92, 201, 193, 0.08);
  border: 1px solid rgba(92, 201, 193, 0.2);
  border-radius: 100px;
  font-size: 0.76rem;
  color: var(--text-secondary);
}

.qa-composer__context-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--brand-accent);
  animation: pulse-ctx 2s ease-in-out infinite;
}

@keyframes pulse-ctx {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.qa-composer__context-text strong {
  color: var(--text-primary);
  font-weight: 600;
}

/* Shell */
.qa-composer__shell {
  background: #fff;
  border: 1.5px solid var(--border-default);
  border-radius: 16px;
  padding: 12px 14px 10px;
  box-shadow:
    0 4px 14px rgba(0, 0, 0, 0.04),
    0 1px 2px rgba(0, 0, 0, 0.03);
  transition: all 0.2s ease;
}

.qa-composer__shell:focus-within {
  border-color: var(--brand-primary);
  box-shadow:
    0 0 0 4px rgba(74, 144, 217, 0.08),
    0 8px 20px rgba(74, 144, 217, 0.08);
}

.qa-composer__shell.is-disabled {
  background: var(--surface-subtle);
  opacity: 0.85;
}

.qa-composer__input {
  width: 100%;
  min-height: 44px;
  max-height: 200px;
  padding: 4px 2px;
  border: none;
  outline: none;
  resize: none;
  font-family: inherit;
  font-size: 0.96rem;
  line-height: 1.6;
  color: var(--text-primary);
  background: transparent;
}

.qa-composer__input::placeholder {
  color: var(--text-muted);
}

.qa-composer__input:disabled {
  cursor: not-allowed;
}

/* Bar */
.qa-composer__bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-subtle);
}

.qa-composer__bar-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 0.72rem;
  color: var(--text-muted);
}

.qa-composer__kbd {
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

.qa-composer__kbd-label {
  margin-right: 2px;
}

.qa-composer__kbd-sep {
  opacity: 0.5;
  margin: 0 2px;
}

/* Send */
.qa-composer__send {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 18px;
  font-family: inherit;
  font-size: 0.84rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: #fff;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  border: none;
  border-radius: 10px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(74, 144, 217, 0.25);
  transition: all 0.2s ease;
}

.qa-composer__send:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(74, 144, 217, 0.35);
}

.qa-composer__send:active:not(:disabled) {
  transform: translateY(0);
}

.qa-composer__send:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  background: linear-gradient(135deg, #94a3b8, #64748b);
  box-shadow: none;
}

.qa-composer__spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
