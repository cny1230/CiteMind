// ═══════════════════════════════════════════════════════════════
// 文件头说明（路由表与全局守卫）
// ───────────────────────────────────────────────────────────────
// ① 职责与所属路由：
//    定义全部路由（公开页 / 工作区 / 404），并挂载两处全局守卫：
//    afterEach 统一设置 document.title；beforeEach 完成「会话引导 +
//    登录态分流 + 角色越权重定向」。
// ② 依赖：@/stores/auth（bootstrap 会话恢复、isAuthenticated、homePath、
//    resolveRedirectForPath）；页面组件全部懒加载（按路由代码分割）。
// ③ 守卫规则（beforeEach，每次导航都会执行）：
//    1) bootstrap()：页面首次加载 / 刷新时恢复会话——accessToken 只存
//       内存，刷新后必然为空，此时依赖浏览器自动携带的 Refresh Token
//       Cookie 调 refreshSession 换取新 token（内部并发去重，不会重复请求）；
//    2) 公开页 isPublic：/（首页）、/login、404（按路由 name 判断）；
//    3) 已登录访问公开页 → next(authStore.homePath)：
//       ADMIN → /app/admin/users；USER → /app/groups；
//       强制改密用户 → /app/settings；
//    4) 未登录访问受保护页 → next('/login')；
//    5) 已登录访问工作区时做角色校验（resolveRedirectForPath）：
//       ADMIN 只能进 /app/admin/* 与 /app/settings，访问业务页被弹回
//       管理首页；USER 只能进业务页与 /app/settings，访问 /app/admin/*
//       被弹回用户首页；mustChangePassword 用户访问其它页一律先跳设置页。
// ④ 父子关系：被 main.ts 注册；/app 分支以 DefaultLayout 为父布局组件，
//    其余公开页直接挂在根 <router-view> 下。
// ═══════════════════════════════════════════════════════════════
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  // HTML5 History 模式：URL 无 # 号，BASE_URL 由 Vite 注入（默认 /）
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // ── 公开页面（无侧边栏布局） ──
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
      meta: { title: '数据洞察中心' },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { title: '登录 - 数据洞察中心' },
    },

    // ── 认证后的工作区（含侧边栏布局） ──
    // 父布局路由：所有子页面共享 DefaultLayout（侧边栏 + 顶栏 + 内容出口），
    // 访问 /app 时重定向到默认工作区首页 /app/groups
    {
      path: '/app',
      component: () => import('../layouts/DefaultLayout.vue'),
      redirect: '/app/groups',
      children: [
        {
          path: 'documents',
          name: 'documents',
          component: () => import('../views/documents/DocumentListView.vue'),
          meta: { title: '文档管理' },
        },
        {
          path: 'qa',
          name: 'qa',
          component: () => import('../views/qa/QaView.vue'),
          meta: { title: '知识库问答' },
        },
        {
          path: 'assistant',
          name: 'assistant',
          component: () => import('../views/assistant/AssistantView.vue'),
          meta: { title: 'AI 助手' },
        },
        {
          path: 'assistant/:sessionId',
          name: 'assistant-chat',
          component: () => import('../views/assistant/AssistantView.vue'),
          meta: { title: 'AI 助手' },
        },
        {
          path: 'groups',
          name: 'groups',
          component: () => import('../views/groups/GroupsPage.vue'),
          meta: { title: '协作小组' },
        },
        // 管理端页面：requireAdmin 仅是声明性标记，真正的拦截由全局守卫中
        // authStore.resolveRedirectForPath 的角色规则完成（ADMIN 才能进入）
        {
          path: 'admin/users',
          name: 'admin-users',
          component: () => import('../views/admin/UserManagementView.vue'),
          meta: { title: '用户管理', requireAdmin: true },
        },
        {
          path: 'admin/metrics',
          name: 'admin-metrics',
          component: () => import('../views/admin/MetricsView.vue'),
          meta: { title: '使用统计', requireAdmin: true },
        },
        // 系统设置（改密）：无 requireAdmin，ADMIN / USER 两种角色均可进入；
        // 也是 mustChangePassword 用户的强制落地页
        {
          path: 'settings',
          name: 'settings',
          component: () => import('../views/settings/SettingsView.vue'),
          meta: { title: '系统设置' },
        },
      ],
    },

    // ── 404 ──
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/NotFoundView.vue'),
      meta: { title: '页面未找到' },
    },
  ],
  // 每次导航后滚动回页面顶部（SPA 长页面切换时避免停留在旧的滚动位置）
  scrollBehavior() {
    return { top: 0 }
  },
})

// 全局标题守卫
// 为每个路由设置浏览器标签页标题，未配置 meta.title 时回退默认站点名
router.afterEach((to) => {
  document.title = (to.meta.title as string) || '数据洞察中心'
})

// 全局认证守卫
// 每次导航的统一闸门：恢复会话 → 登录态分流 → 角色越权重定向（详见文件头③）
router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()
  // 公开页集合：营销首页、登录页、404 兜底页（404 通过路由 name 判断更可靠）
  const isPublic = to.path === '/' || to.path === '/login' || to.name === 'not-found'

  // 尝试恢复会话（内部有去重，不会重复请求）
  // 已有完整会话时立即返回；刷新页面后 accessToken 为空，
  // 会走 refreshSession 用 Refresh Token Cookie 换取新 token
  await authStore.bootstrap()

  // 已登录用户访问公开页面 → 跳转到工作区首页
  if (authStore.isAuthenticated && isPublic) {
    return next(authStore.homePath)
  }

  // 未登录用户访问受保护页面 → 跳转到登录页
  if (!authStore.isAuthenticated && !isPublic) {
    return next('/login')
  }

  // 角色/权限检查
  // ADMIN 只能进 /app/admin/* 与 settings；USER 只能进业务页与 settings；
  // 强制改密用户一律先跳 /app/settings。返回非空重定向路径即拦截
  if (authStore.isAuthenticated && !isPublic) {
    const redirect = authStore.resolveRedirectForPath(to.path)
    if (redirect) {
      return next(redirect)
    }
  }

  // 全部规则通过：放行本次导航
  next()
})

export default router
