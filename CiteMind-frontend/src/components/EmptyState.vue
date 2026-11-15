<script setup lang="ts">
// ═══════════════════════════════════════════════════════════════
// 文件头说明（空状态通用组件）
// ───────────────────────────────────────────────────────────────
// ① 职责与所属路由：
//    列表 / 页面无数据时的统一占位展示：图标 + 标题 + 描述 + 附加内容插槽。
//    无固定路由，被各业务页在「暂无数据」分支中复用。
// ② 依赖的 api / store：
//    无外部依赖，纯展示组件（仅接收 props 与插槽，无数据请求）。
// ③ 主要数据流 / 交互：
//    title 必填、description 可选（不传则不渲染 <p>）；
//    #icon 插槽可替换默认的「群组」占位图标；默认插槽用于放置
//    父组件自定义的内容（如「去创建」按钮、引导链接等）。
// ④ 父子组件关系：
//    父：任意业务页面；子：无（全部内容由插槽注入）。
// ═══════════════════════════════════════════════════════════════
// 入参：title 空状态主标题（必填）；description 辅助说明（可选）
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <div class="empty-state">
    <!-- 图标区：默认提供占位图标，父组件可用 #icon 插槽覆盖 -->
    <div class="empty-state__icon">
      <slot name="icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
          <circle cx="8" cy="7" r="3" stroke="currentColor" stroke-width="1.2" opacity="0.3"/>
          <circle cx="16" cy="7" r="3" stroke="currentColor" stroke-width="1.2" opacity="0.3"/>
          <path d="M2 20V19C2 16.7909 3.79086 15 6 15H10C12.2091 15 14 16.7909 14 19V20" stroke="currentColor" stroke-width="1.2" opacity="0.3"/>
        </svg>
      </slot>
    </div>
    <!-- 标题与可选描述 -->
    <h3>{{ title }}</h3>
    <p v-if="description">{{ description }}</p>
    <!-- 默认插槽：供父组件追加操作按钮等自定义内容 -->
    <slot></slot>
  </div>
</template>

<style scoped>
.empty-state {
  text-align: center;
  padding: 64px 24px;
}

.empty-state__icon {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
  color: var(--text-muted);
}

.empty-state h3 {
  margin: 0 0 8px;
  font-size: 1.05rem;
  color: var(--text-primary);
}

.empty-state p {
  margin: 0 auto;
  max-width: 360px;
  font-size: 0.88rem;
  color: var(--text-secondary);
  line-height: 1.6;
}
</style>
