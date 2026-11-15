<script setup lang="ts">
// ============================================================
// 加入小组弹窗（按组织 ID 申请加入）
// ------------------------------------------------------------
// 职责：输入目标小组的组织 ID（groupCode），非空校验通过后
//   emit('submit', code) 上抛，实际调 submitJoinRequest 在 GroupsPage
//   中完成；提交后记录进入"我的申请"Tab，等待所有者审批。
//   弹窗每次打开（watch visible）会清空输入与错误提示。
// 依赖：无 api 调用；Element Plus（el-dialog / el-button）。
// 父子关系：父 → GroupsPage.vue（v-model:visible 控制显隐，loading 控制提交态）。
// ============================================================
import { ref, watch } from 'vue'
import type { JoinRequestItem } from '@/api/group'

// visible：显隐（v-model）；loading：提交中
const props = defineProps<{
  visible: boolean
  loading: boolean
}>()

// update:visible 供 v-model；submit 上抛组织 ID 字符串
const emit = defineEmits<{
  'update:visible': [value: boolean]
  submit: [groupCode: string]
}>()

// 组织 ID 输入内容
const code = ref('')
// 校验错误信息
const error = ref('')

// 每次打开弹窗时重置输入与错误
watch(
  () => props.visible,
  (v) => {
    if (v) {
      code.value = ''
      error.value = ''
    }
  },
)

// 提交校验：组织 ID 必填（去空格），通过后上抛
function handleSubmit() {
  error.value = ''
  const trimmed = code.value.trim()
  if (trimmed.length === 0) {
    error.value = '请输入组织 ID'
    return
  }
  emit('submit', trimmed)
}

</script>

<template>
  <el-dialog
    :model-value="visible"
    width="640px"
    top="12vh"
    :close-on-click-modal="false"
    @update:model-value="(v: boolean) => { if (!v) emit('update:visible', false) }"
  >
    <!-- 弹窗头：标题 + "申请"徽标 -->
    <template #header>
      <div class="modal-header">
        <h2 class="modal-header__title">加入小组</h2>
        <span class="modal-header__badge">申请</span>
      </div>
    </template>

    <!-- 表单区：错误提示 + 组织 ID 输入（Enter 直接提交） -->
    <div class="modal-body">
      <p v-if="error" class="modal-error">{{ error }}</p>

      <label class="form-field">
        <span class="form-field__label">组织 ID（groupCode）</span>
        <input
          v-model="code"
          type="text"
          maxlength="80"
          placeholder="例如：engineering-team"
          class="form-field__input"
          @keyup.enter="handleSubmit"
        />
      </label>
      <p class="form-hint">输入目标小组的组织 ID，向其所有者提交加入申请。对方审批通过后，该组会出现在「我加入的组」中。</p>
    </div>

    <!-- 底部操作：关闭 / 提交申请（loading 时按钮显示"提交中..."） -->
    <template #footer>
      <el-button @click="emit('update:visible', false)">关闭</el-button>
      <el-button type="primary" :loading="loading" @click="handleSubmit">
        {{ loading ? '提交中...' : '提交申请' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.modal-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.modal-header__title {
  font-family: 'Poppins', 'Noto Sans SC', sans-serif;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.modal-header__badge {
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  background: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.modal-body {
  display: grid;
  gap: 12px;
  padding: 4px 0;
}

.modal-error {
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  background: rgba(239, 68, 68, 0.08);
  color: var(--el-color-danger);
  font-size: 0.86rem;
  line-height: 1.5;
}

.form-field {
  display: grid;
  gap: 5px;
}

.form-field__label {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.form-field__input {
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

.form-field__input:focus {
  outline: none;
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 3px rgba(74, 144, 217, 0.1);
}

.form-hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.5;
}


</style>
