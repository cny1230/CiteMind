/// <reference types="vite/client" />

// ─────────────────────────────────────────────
// Vite 环境变量类型声明
// ─────────────────────────────────────────────
// 在 .env / .env.example 中定义的 VITE_ 前缀变量都会暴露到
// import.meta.env 上，这里补充它们的类型定义，保证 TS 严格模式下可用。
interface ImportMetaEnv {
  /**
   * API 基础路径（默认 '/api'，由 Vite dev server 代理到后端 10001 端口）。
   * 直连后端时可配置为完整地址，如 http://localhost:10001/api
   */
  readonly VITE_API_BASE_URL?: string
  /**
   * Mock 演示模式开关：
   * - 'false' → 关闭 Mock，请求走真实后端；
   * - 其余值 / 未设置 → 开启 Mock（内置演示数据驱动所有页面）。
   */
  readonly VITE_USE_MOCK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
