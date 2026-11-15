// ═══════════════════════════════════════════════════════════════
// 文件头说明（应用入口）
// ───────────────────────────────────────────────────────────────
// ① 职责与所属路由：创建 Vue 应用实例，按顺序注册全局插件并挂载到
//    index.html 的 #app 节点；无路由归属（应用启动引导）。
// ② 依赖：Element Plus（组件库 + 全量样式）、./App.vue 根组件、
//    ./router（路由表与全局守卫）、./stores/pinia（Pinia 实例）、
//    ./assets/main.css（全局样式与 CSS 设计变量）。
// ③ 数据流：插件注册顺序 pinia → router → ElementPlus。路由守卫与
//    业务组件中大量 useAuthStore() / useAppStore()，因此 pinia 必须
//    先于 router 安装；ElementPlus 全量注册使 el-dialog、ElMessageBox
//    等无需按需引入即可使用。
// ④ 父子关系：App.vue 为组件树根；页面组件由 router 懒加载注入。
// ═══════════════════════════════════════════════════════════════
import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

import App from './App.vue'
import router from './router'
import { pinia } from './stores/pinia'
import './assets/main.css'

// 创建根应用实例（挂载点为 index.html 中的 <div id="app">）
const app = createApp(App)

// 先注册 Pinia：路由守卫与组件内的 useXxxStore() 依赖它，顺序不能颠倒
app.use(pinia)
// 注册路由：内部 beforeEach 守卫负责会话恢复与权限跳转
app.use(router)
// 注册 Element Plus：弹窗 / 消息等组件全局可用（含其全局样式）
app.use(ElementPlus)

// 挂载到 #app，正式启动渲染
app.mount('#app')
