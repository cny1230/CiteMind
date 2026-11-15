<script setup lang="ts">
// ═══════════════════════════════════════════════════════════════
// 文件头说明（修改密码表单 · 可复用组件）
// ───────────────────────────────────────────────────────────────
// ① 职责与所属路由：
//    通用的「账号改密」表单组件：当前密码 + 新密码 + 确认新密码，
//    前端校验后直接调用改密接口，成功后向父组件发出 completed 事件。
//    设计为可嵌入弹窗 / 卡片的复用单元（inline 模式去掉卡片外壳），
//    无固定路由，由需要改密入口的页面按需引入。
// ② 依赖的 api / store：
//    - @/api/auth：changePassword（直接调用改密接口，不经 authStore 包装）
//    - @/api/http：extractApiError（统一错误文案提取）
// ③ 主要数据流 / 交互：
//    本地校验（必填 / 新密码≥6位 / 两次一致）→ changePassword 请求 →
//    清空表单、展示成功提示 → 1.2 秒后 emit('completed')，父组件据此
//    关闭弹窗或做后续跳转；失败经 extractApiError 展示错误。
// ④ 父子组件关系：
//    父：任意需要内嵌改密表单的页面 / 弹窗（props.inline 控制样式）；
//    子：无。注意：views/settings/SettingsView.vue 是独立实现的改密页，
//    走 authStore.changePassword，与本组件（直连 api）互不复用。
// ═══════════════════════════════════════════════════════════════
import { ref } from 'vue'
import { changePassword } from '@/api/auth'
import { extractApiError } from '@/api/http'

// inline：以内联（无边框卡片）模式渲染，适配弹窗等已有容器的场景
const props = defineProps<{
  inline?: boolean
}>()

// completed：改密成功（含 1.2 秒延迟）后触发，父组件可据此关闭弹窗或跳转
const emit = defineEmits<{
  completed: []
}>()

// 三个密码输入与提交状态；confirmPassword 仅用于前端校验，不提交后端
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
// 提交中标记：防止重复提交并切换按钮文案
const submitting = ref(false)
// 校验 / 请求失败的错误提示
const error = ref('')
// 改密成功的成功提示
const success = ref('')

// 提交改密：三步前端校验（快速失败减少无效请求）→ 调接口 → 成功后
// 清空表单并延迟 1.2 秒通知父组件（让用户能读到成功提示）
async function handleSubmit() {
  error.value = ''
  success.value = ''

  if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
    error.value = '请填写所有字段'
    return
  }

  if (newPassword.value.length < 6) {
    error.value = '新密码长度不能少于6位'
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    error.value = '两次输入的新密码不一致'
    return
  }

  submitting.value = true
  try {
    await changePassword({
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    })
    success.value = '密码修改成功'
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    setTimeout(() => emit('completed'), 1200)
  } catch (err) {
    error.value = extractApiError(err, '密码修改失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="account-password-form" :class="{ 'account-password-form--inline': inline }">
    <!-- 成功 / 错误反馈区 -->
    <div v-if="success" class="form-feedback form-feedback--success">{{ success }}</div>
    <div v-if="error" class="form-feedback form-feedback--error">{{ error }}</div>

    <!-- 三个密码输入字段：autocomplete 区分当前 / 新密码，便于密码管理器识别 -->
    <div class="form-fields">
      <label class="form-field">
        <span>当前密码</span>
        <input
          v-model="currentPassword"
          type="password"
          autocomplete="current-password"
          placeholder="输入当前密码"
        />
      </label>
      <label class="form-field">
        <span>新密码</span>
        <input
          v-model="newPassword"
          type="password"
          autocomplete="new-password"
          placeholder="输入新密码（至少6位）"
        />
      </label>
      <label class="form-field">
        <span>确认新密码</span>
        <input
          v-model="confirmPassword"
          type="password"
          autocomplete="new-password"
          placeholder="再次输入新密码"
        />
      </label>
    </div>

    <!-- 提交按钮：submitting 时禁用防重复提交（type=button，不走表单原生提交） -->
    <button
      class="btn-submit"
      :disabled="submitting"
      type="button"
      @click="handleSubmit"
    >
      {{ submitting ? '提交中...' : '修改密码' }}
    </button>
  </div>
</template>

<style scoped>
.account-password-form {
  display: grid;
  gap: 16px;
  padding: 20px;
  background: var(--surface-white);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
}

.account-password-form--inline {
  border: none;
  padding: 0;
  background: transparent;
}

.form-feedback {
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.88rem;
  line-height: 1.5;
}

.form-feedback--success {
  background: rgba(16, 185, 129, 0.08);
  color: #10b981;
}

.form-feedback--error {
  background: rgba(239, 68, 68, 0.08);
  color: #ef4444;
}

.form-fields {
  display: grid;
  gap: 14px;
}

.form-field {
  display: grid;
  gap: 5px;
}

.form-field span {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.form-field input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  font-family: inherit;
  color: var(--text-primary);
  background: var(--surface-white);
  transition: border-color 0.15s ease;
}

.form-field input:focus {
  outline: none;
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 3px rgba(74, 144, 217, 0.1);
}

.btn-submit {
  justify-self: start;
  padding: 9px 22px;
  border-radius: var(--radius-sm);
  background: var(--brand-primary);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
  transition: all 0.15s ease;
}

.btn-submit:hover:not(:disabled) {
  background: var(--brand-primary-dark);
}

.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
