<script setup lang="ts">
// ═══════════════════════════════════════════════════════════════
// 文件头说明（首页登录 / 注册弹窗）
// ───────────────────────────────────────────────────────────────
// ① 职责与所属路由：
//    营销首页（HomeView）内嵌的「登录 / 注册」二合一弹窗（基于 el-dialog），
//    无固定路由，由首页的登录 / 免费试用 / CTA 按钮以 v-model:visible 唤起。
// ② 依赖的 api / store：
//    - @/stores/auth：useAuthStore（login 动作写会话、resolveLandingPath 落地页）
//    - @/api/auth：register 注册接口、LoginPayload / RegisterPayload 类型
//    - @/api/http：extractApiError（统一错误文案提取）
// ③ 主要数据流 / 交互：
//    mode 在 'login' / 'register' 间切换（切换时清空错误提示）；
//    弹窗关闭（visible → false）时重置两套表单，避免残留上一次输入；
//    登录成功，或注册成功后自动 login → 关闭弹窗、emit('success')、
//    router.push(resolveLandingPath()) 跳转角色落地页。
// ④ 父子组件关系：
//    父：HomeView（v-model:visible 双向绑定并可监听 success 事件）；
//    子：el-dialog（Element Plus）。
// ═══════════════════════════════════════════════════════════════
import { ref, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { register as registerApi } from '@/api/auth'
import { extractApiError } from '@/api/http'
import type { LoginPayload, RegisterPayload } from '@/api/auth'

// 入参：visible 控制弹窗显隐
const props = defineProps<{
  visible: boolean
}>()

// update:visible：v-model 协议；success：登录/注册成功后通知父组件（如关闭弹窗、刷新状态）
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'success'): void
}>()

const router = useRouter()
const authStore = useAuthStore()

// 当前弹窗模式：'login' 登录 / 'register' 注册（两套表单独立维护）
const mode = ref<'login' | 'register'>('login')

// 登录表单：loginId 支持「用户名或邮箱」
const loginForm = reactive<LoginPayload>({
  loginId: '',
  password: '',
})

// 注册表单：displayName 可选，缺省时提交前回退为 username
const registerForm = reactive<RegisterPayload>({
  username: '',
  email: '',
  displayName: '',
  password: '',
})

// 提交中标记：登录 / 注册共用，防止重复提交
const loading = ref(false)
// 校验 / 请求失败的错误提示（登录、注册共用一处展示位）
const errorMsg = ref('')

// 切换登录 / 注册模式：切换时清空错误提示，避免上一模式的报错串场
function switchMode(target: 'login' | 'register') {
  mode.value = target
  errorMsg.value = ''
}

// 弹窗每次关闭时重置两套表单与错误提示，防止残留旧输入
watch(() => props.visible, (val) => {
  if (!val) {
    errorMsg.value = ''
    loginForm.loginId = ''
    loginForm.password = ''
    registerForm.username = ''
    registerForm.email = ''
    registerForm.displayName = ''
    registerForm.password = ''
  }
})

// 弹窗内登录：校验 → authStore.login → 关闭弹窗并通知父组件 → 按角色跳转落地页
async function handleLogin() {
  if (!loginForm.loginId.trim() || !loginForm.password.trim()) {
    errorMsg.value = '请输入登录标识和密码'
    return
  }
  errorMsg.value = ''
  loading.value = true
  try {
    await authStore.login({
      loginId: loginForm.loginId.trim(),
      password: loginForm.password,
    })
    emit('update:visible', false)
    emit('success')
    router.push(authStore.resolveLandingPath())
  } catch (err) {
    errorMsg.value = extractApiError(err, '登录失败')
  } finally {
    loading.value = false
  }
}

// 弹窗内注册：校验必填 → register 接口注册（displayName 缺省回退 username）
// → 注册成功后立即用同一账号密码自动登录 → 关闭弹窗并跳转落地页
async function handleRegister() {
  if (!registerForm.username.trim() || !registerForm.email.trim() || !registerForm.password.trim()) {
    errorMsg.value = '请填写必填字段'
    return
  }
  errorMsg.value = ''
  loading.value = true
  try {
    await registerApi({
      username: registerForm.username.trim(),
      email: registerForm.email.trim(),
      displayName: registerForm.displayName.trim() || registerForm.username.trim(),
      password: registerForm.password,
    })
    await authStore.login({
      loginId: registerForm.username.trim(),
      password: registerForm.password,
    })
    emit('update:visible', false)
    emit('success')
    router.push(authStore.resolveLandingPath())
  } catch (err) {
    errorMsg.value = extractApiError(err, '注册失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :show-close="true"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    width="420px"
    top="15vh"
    @update:model-value="(val: boolean) => emit('update:visible', val)"
  >
    <!-- 弹窗头部：标题 / 副标题随 mode（登录或注册）切换文案 -->
    <template #header>
      <div class="modal-header">
        <h2>{{ mode === 'login' ? '欢迎回来' : '创建账号' }}</h2>
        <p>{{ mode === 'login' ? '登录数据洞察中心' : '立即注册，开启智能知识服务' }}</p>
      </div>
    </template>

    <!-- Toggle tabs -->
    <div class="mode-tabs">
      <button
        class="mode-tab"
        :class="{ active: mode === 'login' }"
        @click="switchMode('login')"
      >登录</button>
      <button
        class="mode-tab"
        :class="{ active: mode === 'register' }"
        @click="switchMode('register')"
      >注册</button>
    </div>

    <!-- Login form -->
    <form v-if="mode === 'login'" class="modal-form" @submit.prevent="handleLogin">
      <div class="input-group">
        <label>登录标识</label>
        <input
          v-model="loginForm.loginId"
          type="text"
          placeholder="用户名或邮箱"
          autocomplete="username"
        />
      </div>
      <div class="input-group">
        <label>密码</label>
        <input
          v-model="loginForm.password"
          type="password"
          placeholder="输入密码"
          autocomplete="current-password"
        />
      </div>
      <p v-if="errorMsg" class="form-error">{{ errorMsg }}</p>
      <!-- 登录提交：loading 时禁用防重复提交 -->
      <button type="submit" class="btn-submit" :disabled="loading">
        <span v-if="!loading">登录</span>
        <span v-else>登录中...</span>
      </button>
    </form>

    <!-- Register form -->
    <!-- 注册表单：必填项（用户名/邮箱/密码）标红星，displayName 为可选项 -->
    <form v-else class="modal-form" @submit.prevent="handleRegister">
      <div class="input-group">
        <label>用户名 <span class="required">*</span></label>
        <input
          v-model="registerForm.username"
          type="text"
          placeholder="字母、数字、下划线"
          autocomplete="username"
        />
      </div>
      <div class="input-group">
        <label>邮箱 <span class="required">*</span></label>
        <input
          v-model="registerForm.email"
          type="email"
          placeholder="your@email.com"
          autocomplete="email"
        />
      </div>
      <div class="input-group">
        <label>显示名称</label>
        <input
          v-model="registerForm.displayName"
          type="text"
          placeholder="您的称呼（可选）"
        />
      </div>
      <div class="input-group">
        <label>密码 <span class="required">*</span></label>
        <input
          v-model="registerForm.password"
          type="password"
          placeholder="设置密码"
          autocomplete="new-password"
        />
      </div>
      <p v-if="errorMsg" class="form-error">{{ errorMsg }}</p>
      <button type="submit" class="btn-submit" :disabled="loading">
        <span v-if="!loading">注册</span>
        <span v-else>注册中...</span>
      </button>
    </form>
  </el-dialog>
</template>

<style scoped>
/* Header */
.modal-header {
  text-align: center;
  padding-top: 8px;
}
.modal-header h2 {
  font-family: 'Poppins', 'Noto Sans SC', sans-serif;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 4px;
}
.modal-header p {
  font-size: 13.5px;
  color: var(--text-secondary);
  margin: 0;
}

/* Mode toggle tabs */
.mode-tabs {
  display: flex;
  background: var(--surface-muted);
  border-radius: var(--radius-sm);
  padding: 3px;
  margin: 20px 0 16px;
}
.mode-tab {
  flex: 1;
  padding: 8px 0;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  transition: all 0.2s ease;
}
.mode-tab.active {
  background: var(--surface-white);
  color: var(--text-primary);
  box-shadow: var(--shadow-xs);
  font-weight: 600;
}
.mode-tab:not(.active):hover {
  color: var(--text-primary);
}

/* Form */
.modal-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.input-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.input-group label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.required {
  color: var(--el-color-danger);
}
.input-group input {
  padding: 10px 13px;
  border: 1.5px solid var(--border-default);
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-family: inherit;
  color: var(--text-primary);
  background: var(--surface-white);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  outline: none;
}
.input-group input::placeholder {
  color: #94a3b8;
}
.input-group input:focus {
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 3px rgba(74, 144, 217, 0.1);
}

.form-error {
  font-size: 13px;
  color: var(--el-color-danger);
  margin: 0;
}

.btn-submit {
  padding: 12px 24px;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  transition: all 0.2s ease;
  box-shadow: 0 4px 14px rgba(74, 144, 217, 0.25);
  margin-top: 4px;
}
.btn-submit:hover:not(:disabled) {
  box-shadow: 0 6px 20px rgba(74, 144, 217, 0.35);
  transform: translateY(-1px);
}
.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
