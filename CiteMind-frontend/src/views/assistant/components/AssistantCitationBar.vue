<script setup lang="ts">
// ============================================================
// 助手消息引用条（Evidence Chain）
// ------------------------------------------------------------
// 职责：纯展示组件，接收一条助手回答附带的引用列表（AssistantCitationItem[]），
//   以 chip 形式展示序号 / 文件类型标签 / 文件名 / 相关度得分；
//   点击有效引用（documentId 非空）时向父组件冒泡 inspect 事件，
//   由 AssistantView 打开文档预览弹窗完成引用溯源。
// 依赖：无 api 调用，仅使用 @/types/assistant 的类型定义。
// 父子关系：父 → AssistantMessage.vue（回答完成且 citations 非空时渲染）。
// ============================================================
import type { AssistantCitationItem } from '@/types/assistant'

// 引用条数据：由后端 done 事件带回的 citations 数组
defineProps<{
  citations: AssistantCitationItem[]
}>()

// 点击某条引用时冒泡给父组件（父组件负责打开预览）
const emit = defineEmits<{
  inspect: [citation: AssistantCitationItem]
}>()

// 相关度得分格式化：0~1 小数 → 百分数字符串（如 0.87 → "87.0%"），非法值显示 --
function formatScore(score: number): string {
  if (!Number.isFinite(score)) return '--'
  return (score * 100).toFixed(1) + '%'
}

// 根据文件扩展名生成 chip 上的类型标签文案（PDF/MD/DOC/TXT），无扩展名兜底 DOC
function fileTag(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return 'PDF'
  if (ext === 'md') return 'MD'
  if (ext === 'docx' || ext === 'doc') return 'DOC'
  if (ext === 'txt') return 'TXT'
  return ext.toUpperCase() || 'DOC'
}

// 根据扩展名返回标签配色 class（PDF 红 / MD 蓝 / DOC 亮蓝 / 其它灰）
function tagClass(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return 'citebar__chip-tag--pdf'
  if (ext === 'md') return 'citebar__chip-tag--md'
  if (ext === 'docx' || ext === 'doc') return 'citebar__chip-tag--doc'
  return 'citebar__chip-tag--txt'
}
</script>

<template>
  <div class="citebar">
    <!-- 标题区：Evidence Chain 眉题 + 引用数量徽标 -->
    <div class="citebar__head">
      <span class="citebar__eyebrow">Evidence Chain</span>
      <span class="citebar__title">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        <strong>引用证据</strong>
        <span class="citebar__count">{{ citations.length }}</span>
      </span>
    </div>

    <!-- 引用 chip 网格 -->
    <div class="citebar__grid">
      <!-- 单条引用 chip：序号 + 类型标签 + 文件名 + 相关度；无 documentId 的禁用不可点 -->
      <button
        v-for="(c, idx) in citations"
        :key="`${c.documentId ?? 'x'}-${c.chunkId ?? idx}`"
        class="citebar__chip"
        type="button"
        :disabled="c.documentId === null"
        @click="c.documentId !== null && emit('inspect', c)"
      >
        <span class="citebar__chip-no">{{ String(idx + 1).padStart(2, '0') }}</span>
        <span class="citebar__chip-tag" :class="tagClass(c.fileName)">{{ fileTag(c.fileName) }}</span>
        <span class="citebar__chip-name" :title="c.fileName">{{ c.fileName }}</span>
        <span class="citebar__chip-score">{{ formatScore(c.score) }}</span>
        <svg class="citebar__chip-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <line x1="7" y1="17" x2="17" y2="7" />
          <polyline points="7 7 17 7 17 17" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.citebar {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed rgba(15, 23, 42, 0.1);
}

.citebar__head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 10px;
  padding-left: 2px;
}

.citebar__eyebrow {
  font-family: 'Poppins', sans-serif;
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--brand-primary);
}

.citebar__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.citebar__title svg {
  color: var(--brand-primary);
}

.citebar__title strong {
  font-weight: 600;
  color: var(--text-primary);
}

.citebar__count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-muted);
  background: rgba(148, 163, 184, 0.14);
  padding: 1px 7px;
  border-radius: 100px;
}

.citebar__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.citebar__chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 5px 10px 5px 8px;
  background: #fff;
  border: 1px solid var(--border-default);
  border-radius: 100px;
  font-family: inherit;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.citebar__chip:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: var(--brand-primary);
  background: var(--surface-accent);
  box-shadow: 0 4px 14px rgba(74, 144, 217, 0.12);
}

.citebar__chip:hover:not(:disabled) .citebar__chip-arrow {
  transform: translate(1px, -1px);
  color: var(--brand-primary);
}

.citebar__chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.citebar__chip-no {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.66rem;
  font-weight: 700;
  color: var(--text-muted);
  letter-spacing: 0.04em;
}

.citebar__chip-tag {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  padding: 1px 5px;
  border-radius: 3px;
}

.citebar__chip-tag--pdf {
  color: #dc2626;
  background: rgba(239, 68, 68, 0.1);
}

.citebar__chip-tag--md {
  color: var(--brand-primary);
  background: rgba(74, 144, 217, 0.1);
}

.citebar__chip-tag--doc {
  color: #2563eb;
  background: rgba(59, 130, 246, 0.1);
}

.citebar__chip-tag--txt {
  color: #64748b;
  background: rgba(148, 163, 184, 0.15);
}

.citebar__chip-name {
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 260px;
}

.citebar__chip-score {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--brand-accent-dark);
  letter-spacing: 0.02em;
}

.citebar__chip-arrow {
  color: var(--text-muted);
  transition: all 0.2s ease;
  flex-shrink: 0;
}
</style>
