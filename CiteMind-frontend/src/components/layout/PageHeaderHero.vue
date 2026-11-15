<script setup lang="ts">
// ═══════════════════════════════════════════════════════════════
// 文件头说明（页面头通用组件）
// ───────────────────────────────────────────────────────────────
// ① 职责与所属路由：
//    工作区各页面的统一页头：眉标小字（eyebrow）+ 大标题 + 描述文字，
//    右侧可选 actions 插槽放置「刷新」等操作按钮。无固定路由，
//    典型使用者：views/admin/UserManagementView.vue。
// ② 依赖的 api / store：
//    无外部依赖，纯展示组件（props + 具名插槽，无数据请求）。
// ③ 主要数据流 / 交互：
//    文案全部由父组件通过 props 传入；仅当父组件提供了 #actions
//    插槽（$slots.actions 存在）时才渲染右侧操作区，避免空白占位。
// ④ 父子组件关系：
//    父：任意工作区页面；子：无（actions 插槽内容由父组件注入）。
// ═══════════════════════════════════════════════════════════════
// 入参：eyebrow 顶部小字眉标；title 主标题；description 说明文字
defineProps<{
  eyebrow: string
  title: string
  description: string
}>()
</script>

<template>
  <header class="page-header-hero">
    <!-- 左侧文案区：眉标 + 主标题 + 描述 -->
    <div class="page-header-hero__copy">
      <p class="page-header-hero__eyebrow">{{ eyebrow }}</p>
      <h1 class="page-header-hero__title">{{ title }}</h1>
      <p class="page-header-hero__desc">{{ description }}</p>
    </div>
    <!-- 右侧操作区：父组件通过 #actions 插槽注入按钮，未传插槽时不渲染 -->
    <div v-if="$slots.actions" class="page-header-hero__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.page-header-hero {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 24px;
  padding: 24px 28px;
  background: linear-gradient(135deg, rgba(74, 144, 217, 0.03) 0%, rgba(92, 201, 193, 0.03) 100%);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
}

.page-header-hero__eyebrow {
  margin: 0 0 4px;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--brand-primary);
}

.page-header-hero__title {
  margin: 0;
  font-family: 'Poppins', 'Noto Sans SC', sans-serif;
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}

.page-header-hero__desc {
  margin: 6px 0 0;
  font-size: 0.88rem;
  color: var(--text-secondary);
  line-height: 1.6;
  max-width: 44rem;
}

.page-header-hero__actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

@media (max-width: 768px) {
  .page-header-hero {
    flex-direction: column;
    padding: 20px;
  }

  .page-header-hero__actions {
    width: 100%;
  }
}
</style>
