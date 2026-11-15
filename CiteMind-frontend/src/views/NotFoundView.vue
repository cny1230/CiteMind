<script setup lang="ts">
// ═══════════════════════════════════════════════════════════════
// 文件头说明（404 页面）
// ───────────────────────────────────────────────────────────────
// ① 职责与所属路由：
//    全局兜底的 404 页面，由 router 中 path: '/:pathMatch(.*)*'
//    （name: not-found）匹配所有未定义路径；在认证守卫中被视为公开页，
//    未登录也可直接访问。
// ② 依赖的 api / store：
//    无 api / store 依赖，仅使用 vue-router 的 useRouter 做「返回首页」跳转。
// ③ 主要数据流 / 交互：
//    纯静态展示，无数据加载；唯一交互是点击「返回首页」router.push('/')。
// ④ 父子组件关系：
//    父：App.vue 的 <router-view> 出口；子：无。
// ═══════════════════════════════════════════════════════════════
import { useRouter } from 'vue-router'
// 路由实例：仅用于「返回首页」按钮的编程式跳转
const router = useRouter()
</script>

<template>
  <div class="not-found">
    <!-- 404 内容区：渐变大号状态码 + 标题 + 说明 -->
    <div class="nf-content">
      <span class="nf-code">404</span>
      <h1>页面未找到</h1>
      <p>您访问的页面不存在或已被移除</p>
      <!-- 返回首页按钮 -->
      <button class="nf-btn" @click="router.push('/')">返回首页</button>
    </div>
  </div>
</template>

<style scoped>
.not-found {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-subtle);
}

.nf-content {
  text-align: center;
  color: var(--text-primary);
}

.nf-code {
  display: block;
  font-family: 'Poppins', sans-serif;
  font-size: 96px;
  font-weight: 800;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-accent));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1;
  margin-bottom: 16px;
}

.nf-content h1 {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 8px;
}

.nf-content p {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 32px;
}

.nf-btn {
  padding: 12px 32px;
  border-radius: var(--radius-xs);
  background: var(--brand-primary);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.nf-btn:hover {
  background: var(--brand-primary-light);
}
</style>
