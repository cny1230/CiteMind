<script setup lang="ts">
// ═══════════════════════════════════════════════════════════════
// 文件头说明（系统设置 · 修改密码页）
// ───────────────────────────────────────────────────────────────
// ① 职责与所属路由：
//    认证用户修改登录密码的设置页，同时承接「强制改密」流程：
//    当 currentUser.mustChangePassword 为 true 时展示警示横幅，
//    改密成功后延迟跳转到角色对应的首页。
//    所属路由：/app/settings（name: settings），ADMIN 与 USER 均可访问
//    （是两种角色唯一共享的工作区页面）。
// ② 依赖的 api / store：
//    - @/stores/auth：useAuthStore（mustChangePassword 派生、changePassword
//      动作——内部走 @/api/auth 接口并刷新用户信息、homePath 角色首页路径）
//    - @/api/http：extractApiError（统一错误文案提取）
// ③ 主要数据流 / 交互：
//    表单 reactive 本地校验（必填 / 新密码≥6位 / 两次一致 / 新旧不同）→
//    authStore.changePassword → 清空表单并显示成功提示；
//    若处于强制改密状态，1.2 秒后 router.push(homePath) 离开本页。
// ④ 父子组件关系：
//    父：DefaultLayout 的 <router-view> 内容出口；子：无自定义子组件。
//    注意：components/AccountPasswordForm.vue 是另一份相似的改密表单
//    （供登录/弹窗场景），与本页各自独立实现，未互相复用。
// ═══════════════════════════════════════════════════════════════
import { reactive, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { extractApiError } from '@/api/http'

const router = useRouter()
const authStore = useAuthStore()

// 是否处于「强制改密」状态：由后端用户资料派生，控制警示横幅与改密成功后的自动跳转
const mustChange = computed(() => authStore.currentUser?.mustChangePassword ?? false)

// 改密表单：当前密码 + 新密码 + 确认新密码（confirmPassword 仅用于前端校验，不提交）
const form = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

// 提交中标记：防止重复提交并切换按钮文案
const loading = ref(false)
// 校验 / 请求失败的错误提示
const errorMsg = ref('')
// 改密成功的成功提示
const successMsg = ref('')

// 提交改密：先做四步前端校验（快速失败，减少无效请求），再调用 authStore.changePassword；
// 强制改密场景下成功后延迟 1.2 秒跳转到角色首页，让用户能读到成功提示
async function handleChangePassword() {
  errorMsg.value = ''
  successMsg.value = ''

  if (!form.currentPassword.trim() || !form.newPassword.trim() || !form.confirmPassword.trim()) {
    errorMsg.value = '请填写所有密码字段'
    return
  }

  if (form.newPassword.length < 6) {
    errorMsg.value = '新密码长度至少 6 个字符'
    return
  }

  if (form.newPassword !== form.confirmPassword) {
    errorMsg.value = '两次输入的新密码不一致'
    return
  }

  if (form.currentPassword === form.newPassword) {
    errorMsg.value = '新密码不能与当前密码相同'
    return
  }

  loading.value = true
  try {
    await authStore.changePassword({
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    })
    form.currentPassword = ''
    form.newPassword = ''
    form.confirmPassword = ''
    successMsg.value = '密码修改成功'

    if (mustChange.value) {
      setTimeout(() => {
        router.push(authStore.homePath)
      }, 1200)
    }
  } catch (err) {
    errorMsg.value = extractApiError(err, '修改密码失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="settings-page">
    <!-- 页头：标题与副标题 -->
    <div class="page-header">
      <h1>系统设置</h1>
      <p>账号安全与密码管理</p>
    </div>

    <!-- 强制修改密码提示 -->
    <div v-if="mustChange" class="must-change-banner">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
        <path d="M12 8V12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <circle cx="12" cy="16" r="0.5" fill="currentColor" stroke="none"/>
      </svg>
      <span>出于安全考虑，您需要先修改密码后才能继续使用系统</span>
    </div>

    <!-- 修改密码 -->
    <div class="settings-card">
      <h2 class="card-title">修改密码</h2>
      <!-- 改密表单：submit.prevent 阻止原生提交，统一走 handleChangePassword -->
      <form class="password-form" @submit.prevent="handleChangePassword">
        <div class="input-group">
          <label>当前密码</label>
          <input
            v-model="form.currentPassword"
            type="password"
            placeholder="输入当前密码"
            autocomplete="current-password"
          />
        </div>
        <div class="input-group">
          <label>新密码</label>
          <input
            v-model="form.newPassword"
            type="password"
            placeholder="输入新密码（至少 6 位）"
            autocomplete="new-password"
          />
        </div>
        <div class="input-group">
          <label>确认新密码</label>
          <input
            v-model="form.confirmPassword"
            type="password"
            placeholder="再次输入新密码"
            autocomplete="new-password"
          />
        </div>

        <!-- 校验 / 请求结果反馈区 -->
        <p v-if="errorMsg" class="form-error">{{ errorMsg }}</p>
        <p v-if="successMsg" class="form-success">{{ successMsg }}</p>

        <!-- 提交按钮：loading 时禁用防重复提交 -->
        <button type="submit" class="btn-submit" :disabled="loading">
          <span v-if="!loading">保存修改</span>
          <span v-else>保存中...</span>
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.page-header {
  margin-bottom: 28px;
}
.page-header h1 {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 4px;
}
.page-header p {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

/* ── 强制修改密码横幅 ── */
.must-change-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(245, 158, 11, 0.03));
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: var(--radius-sm);
  color: #b45309;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 24px;
}
.must-change-banner svg {
  flex-shrink: 0;
  color: #f59e0b;
}

/* ── 设置卡片 ── */
.settings-card {
  max-width: 480px;
  background: var(--surface-white);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 28px 32px;
}

.card-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 22px;
}

/* ── 表单 ── */
.password-form {
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

.form-success {
  font-size: 13px;
  color: var(--el-color-success);
  margin: 0;
}

.btn-submit {
  padding: 11px 24px;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  color: #fff;
  font-size: 14px;
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
