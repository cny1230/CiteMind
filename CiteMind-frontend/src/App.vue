<script setup lang="ts">
// ═══════════════════════════════════════════════════════════════
// 文件头说明（应用根组件）
// ───────────────────────────────────────────────────────────────
// ① 职责与所属路由：
//    应用最外层组件。核心职责是在会话引导（bootstrap）期间展示全屏
//    Loading 遮罩，避免守卫尚未恢复会话时页面闪烁或误跳登录页。
//    无固定路由（所有路由都渲染在本组件的 router-view 中）。
// ② 依赖的 api / store：
//    - @/stores/auth：useAuthStore（仅消费 isBootstrapping 引导状态标记）
// ③ 主要数据流 / 交互：
//    authStore.isBootstrapping = true（路由守卫中的 bootstrap() 进行中）
//    → 渲染全屏遮罩；false → 渲染 <router-view> 进入正常路由渲染。
//    bootstrap() 本身不在这里调用，而是由 router/index.ts 的全局守卫触发。
// ④ 父子组件关系：
//    父：main.ts createApp 挂载的根；子：<router-view> 渲染的各页面
//    （公开页 HomeView / LoginView / NotFound 或 DefaultLayout 工作区）。
// ═══════════════════════════════════════════════════════════════
import { useAuthStore } from '@/stores/auth'

// 仅消费 auth store 的引导状态；真正的 bootstrap() 调用在路由守卫中
const authStore = useAuthStore()
</script>

<template>
  <!-- 会话引导遮罩：bootstrap 期间阻断渲染，防止内容闪烁或误跳登录页 -->
  <div v-if="authStore.isBootstrapping" class="bootstrap-overlay">
    <div class="bootstrap-spinner">
      <svg width="48" height="48" viewBox="0 0 32 32" fill="none" class="spinner-svg">
        <defs>
          <linearGradient id="bootstrapGrad" x1="2" y1="2" x2="30" y2="30">
            <stop stop-color="#4A90D9" />
            <stop offset="1" stop-color="#5CC9C1" />
          </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="12" stroke="var(--surface-muted)" stroke-width="2.5" fill="none" />
        <circle
          cx="16" cy="16" r="12" stroke="url(#bootstrapGrad)" stroke-width="2.5"
          fill="none" stroke-dasharray="56 20" stroke-linecap="round"
        />
      </svg>
      <p class="bootstrap-text">正在加载...</p>
    </div>
  </div>
  <!-- 引导完成后渲染路由出口（公开页或工作区布局） -->
  <router-view v-else />
</template>

<style>
.bootstrap-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-subtle);
  z-index: 1000;
}

.bootstrap-spinner {
  text-align: center;
}

.spinner-svg {
  animation: spin 1.2s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.bootstrap-text {
  margin-top: 18px;
  font-size: 14px;
  color: var(--text-muted);
  font-weight: 500;
}
</style>
