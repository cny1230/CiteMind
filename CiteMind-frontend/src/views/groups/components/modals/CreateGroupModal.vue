<script setup lang="ts">
// ============================================================
// 创建小组弹窗
// ------------------------------------------------------------
// 职责：输入小组名称（必填，≤128 字）与描述（可选，≤512 字），
//   前端校验通过后 emit('submit') 上抛 payload；
//   实际调 createGroup 接口与后续刷新在 GroupsPage 中完成。
//   弹窗每次打开（watch visible）都会清空表单与错误提示。
// 依赖：无 api 调用；使用 Element Plus 的 el-dialog / el-button。
// 父子关系：父 → GroupsPage.vue（v-model:visible 控制显隐，loading 控制提交态）。
// ============================================================
import { ref, watch } from 'vue'

// visible：显隐（v-model）；loading：创建中（父组件接口请求期间为 true）
const props = defineProps<{
  visible: boolean
  loading: boolean
}>()

// update:visible 供 v-model；submit 上抛 { name, description? }
const emit = defineEmits<{
  'update:visible': [value: boolean]
  submit: [payload: { name: string; description?: string }]
}>()

// 表单字段与校验错误信息
const name = ref('')
const description = ref('')
const error = ref('')

// 每次打开弹窗时重置表单，避免残留上次输入
watch(
  () => props.visible,
  (v) => {
    if (v) {
      name.value = ''
      description.value = ''
      error.value = ''
    }
  },
)

// 提交校验：名称必填；通过后上抛 payload（空描述转 undefined 让后端字段缺省）
function handleSubmit() {
  error.value = ''
  if (name.value.trim().length === 0) {
    error.value = '请输入小组名称'
    return
  }
  emit('submit', {
    name: name.value.trim(),
    description: description.value.trim() || undefined,
  })
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
    <template #header>
      <div class="modal-header">
        <h2 class="modal-header__title">创建小组</h2>
        <span class="modal-header__badge">新建</span>
      </div>
    </template>

    <!-- 表单区：错误提示 + 名称 / 描述两个字段 -->
    <div class="modal-body">
      <p v-if="error" class="modal-error">{{ error }}</p>

      <!-- 小组名称（必填，Enter 直接提交） -->
      <label class="form-field">
        <span class="form-field__label">小组名称</span>
        <input
          v-model="name"
          type="text"
          maxlength="128"
          placeholder="例如：设计资料库"
          class="form-field__input"
          @keyup.enter="handleSubmit"
        />
      </label>

      <label class="form-field">
        <span class="form-field__label">小组描述 <small>（可选）</small></span>
        <textarea
          v-model="description"
          maxlength="512"
          rows="4"
          placeholder="描述这个小组的用途与协作范围"
          class="form-field__textarea"
        />
      </label>
    </div>

    <!-- 底部操作：取消 / 创建（loading 时按钮显示"创建中..."） -->
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="loading" @click="handleSubmit">
        {{ loading ? '创建中...' : '创建小组' }}
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
  background: var(--surface-accent);
  color: var(--brand-primary);
}

.modal-body {
  display: grid;
  gap: 16px;
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

.form-field__label small {
  font-weight: 400;
  color: var(--text-muted);
}

.form-field__input,
.form-field__textarea {
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

.form-field__input:focus,
.form-field__textarea:focus {
  outline: none;
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 3px rgba(74, 144, 217, 0.1);
}
</style>
