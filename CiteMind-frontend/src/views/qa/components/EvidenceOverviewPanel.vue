<script setup lang="ts">
// ============================================================
// 问答 - 证据覆盖概览面板（EvidenceOverviewPanel）
// 归属页面：/app/qa（被 QaMessage.vue 引用，位于 AI 回答正文与引用列表之间）
// 职责：展示本次回答检索证据的整体画像 —— 文档数 / 证据数 / 覆盖
//       策略（跨文档覆盖 或 相关性优先）、检索警告，以及按文档分组
//       的证据明细（details 折叠面板，展开后逐条显示 chunk 区间、
//       检索来源、评分与摘要）。
// 依赖：不直接调用 API —— overview 由消息对象下发（EvidenceOverview
//       类型来自 src/api/qa），组件纯展示、无事件上抛。
// 组件关系：仅被 QaMessage 引用；无子组件。
// ============================================================
import type { EvidenceOverview } from '@/api/qa'

// 父级消息携带的证据概览对象（来自流式回答的 onEvidenceOverview 回调）
defineProps<{
  overview: EvidenceOverview
}>()

// 评分 0~1 → 整数百分比；非法值显示 --
function formatScore(score: number): string {
  if (!Number.isFinite(score)) return '--'
  return `${Math.round(score * 100)}%`
}

// 覆盖策略枚举 → 中文标签：DOCUMENT_COVERAGE 为跨文档覆盖，其余按相关性优先
function coverageModeLabel(mode: string): string {
  if (mode === 'DOCUMENT_COVERAGE') return '跨文档覆盖'
  return '相关性优先'
}

// chunk 区间展示：起止不同显示 #start-end；否则取起始值（兜底单值）；
// 全部为空时显示 #--
function chunkRange(start: number | null, end: number | null, fallback: number | null): string {
  if (start !== null && end !== null && start !== end) return `#${start}-${end}`
  const value = start ?? fallback
  return value === null ? '#--' : `#${value}`
}
</script>

<template>
  <!-- 证据覆盖总览：头部统计 → 警告条 → 按文档分组的可折叠证据明细 -->
  <section class="evidence-overview" aria-label="证据覆盖">
    <header class="evidence-overview__head">
      <div class="evidence-overview__title">
        <span class="evidence-overview__pulse" />
        <span>证据覆盖</span>
      </div>
      <div class="evidence-overview__stats">
        <span>{{ overview.documentCount }} 个文档</span>
        <span>{{ overview.evidenceCount }} 条证据</span>
        <span>{{ coverageModeLabel(overview.coverageMode) }}</span>
      </div>
    </header>

    <!-- 检索警告（如覆盖不足等提示），仅有内容时显示 -->
    <div v-if="overview.warnings.length > 0" class="evidence-overview__warnings">
      <p v-for="warning in overview.warnings" :key="warning">
        {{ warning }}
      </p>
    </div>

    <!-- 证据分组：每个 details 为一个文档，summary 显示文件名/条数/最高分/来源，展开为逐条证据 -->
    <div class="evidence-overview__groups">
      <details
        v-for="group in overview.groups"
        :key="`${group.documentId ?? 'x'}-${group.fileName}`"
        class="evidence-overview__group"
      >
        <summary class="evidence-overview__summary">
          <span class="evidence-overview__file" :title="group.fileName">{{ group.fileName }}</span>
          <span class="evidence-overview__meta">{{ group.evidenceCount }} 条</span>
          <span class="evidence-overview__meta">{{ formatScore(group.topScore) }}</span>
          <span class="evidence-overview__sources">{{ group.retrievalSources.join(' / ') }}</span>
        </summary>

        <ol class="evidence-overview__snippets">
          <li
            v-for="snippet in group.snippets"
            :key="`${snippet.evidenceId ?? 'e'}-${snippet.chunkId ?? snippet.chunkIndex ?? 0}`"
            class="evidence-overview__snippet"
          >
            <div class="evidence-overview__snippet-head">
              <code>{{ chunkRange(snippet.startChunkIndex, snippet.endChunkIndex, snippet.chunkIndex) }}</code>
              <span>{{ snippet.retrievalSource }}</span>
              <span>{{ formatScore(snippet.score) }}</span>
            </div>
            <p>{{ snippet.snippet || '未提供证据摘要' }}</p>
          </li>
        </ol>
      </details>
    </div>
  </section>
</template>

<style scoped>
.evidence-overview {
  margin-top: 14px;
  padding: 13px 0 2px;
  border-top: 1px dashed rgba(15, 23, 42, 0.11);
}

.evidence-overview__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.evidence-overview__title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-family: 'Poppins', 'Noto Sans SC', sans-serif;
  font-size: 0.84rem;
  font-weight: 700;
  color: var(--text-primary);
}

.evidence-overview__pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #16a34a;
  box-shadow: 0 0 0 4px rgba(22, 163, 74, 0.12);
}

.evidence-overview__stats {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.evidence-overview__stats span,
.evidence-overview__meta,
.evidence-overview__sources {
  font-size: 0.72rem;
  color: var(--text-secondary);
  background: rgba(15, 23, 42, 0.05);
  border: 1px solid rgba(15, 23, 42, 0.06);
  border-radius: 6px;
  padding: 2px 7px;
  white-space: nowrap;
}

.evidence-overview__warnings {
  margin-bottom: 9px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.18);
}

.evidence-overview__warnings p {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.5;
  color: #92400e;
}

.evidence-overview__groups {
  display: grid;
  gap: 8px;
}

.evidence-overview__group {
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 8px;
  overflow: hidden;
}

.evidence-overview__summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  cursor: pointer;
  list-style: none;
}

.evidence-overview__summary::-webkit-details-marker {
  display: none;
}

.evidence-overview__summary:hover {
  background: rgba(74, 144, 217, 0.05);
}

.evidence-overview__file {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.82rem;
  font-weight: 650;
  color: var(--text-primary);
}

.evidence-overview__sources {
  font-family: 'JetBrains Mono', monospace;
  color: var(--brand-primary-dark);
}

.evidence-overview__snippets {
  margin: 0;
  padding: 0 10px 10px;
  list-style: none;
  display: grid;
  gap: 7px;
}

.evidence-overview__snippet {
  padding: 8px 9px;
  border-radius: 7px;
  background: rgba(248, 250, 252, 0.95);
  border: 1px solid rgba(15, 23, 42, 0.06);
}

.evidence-overview__snippet-head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 4px;
}

.evidence-overview__snippet-head code,
.evidence-overview__snippet-head span {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.68rem;
  color: var(--text-muted);
}

.evidence-overview__snippet p {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.55;
  color: var(--text-secondary);
}

@media (max-width: 720px) {
  .evidence-overview__head {
    align-items: flex-start;
    flex-direction: column;
  }

  .evidence-overview__summary {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .evidence-overview__sources {
    grid-column: 1 / -1;
    justify-self: start;
  }
}
</style>
