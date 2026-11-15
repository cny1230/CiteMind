// ═══════════════════════════════════════════════════════════════
// 文件头说明（Pinia 根实例）
// ───────────────────────────────────────────────────────────────
// ① 职责与所属路由：创建并导出全局唯一的 Pinia 实例，由 main.ts
//    app.use(pinia) 注册；无路由归属（应用级基础设施）。
// ② 依赖：仅 pinia 的 createPinia，不依赖任何 api / 其他 store。
// ③ 数据流：业务 store（stores/auth.ts、stores/app.ts）在守卫与组件中
//    通过 useXxxStore() 使用该实例；单独成文件是为了让 main.ts、路由守卫
//    与测试代码引用同一实例，避免 router ↔ store 的循环依赖。
// ④ 父子关系：无 UI；被 main.ts 挂载为应用级插件，是所有 store 的容器。
// ═══════════════════════════════════════════════════════════════
import { createPinia } from 'pinia'

// 全局唯一 Pinia 实例：main.ts 中 app.use(pinia) 完成注册
export const pinia = createPinia()
