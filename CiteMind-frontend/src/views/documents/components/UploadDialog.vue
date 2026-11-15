<script setup lang="ts">
// ============================================================
// 文档中心 - 上传文档弹窗（UploadDialog）
// 归属页面：/app/documents（被 DocumentListView.vue 引用，经 v-model:visible 控制显隐）
// 职责：向选中群组上传新文档 —— 支持点击/拖拽选择文件、类型与大小
//       校验（TXT/MD/PDF/DOCX，单文件 ≤ 256MB）、实时进度与失败重试；
//       文件超过 10MB 自动改走分片上传（hash → init → 分片 → 合并），
//       小文件走带进度回调的整包上传。
// 依赖 API 模块（src/api）：
//   - document.ts：uploadDocument（整包上传，onProgress 回调上报进度）
//   - http.ts：extractApiError（解析后端错误文案）
//   - ../composables/useChunkedUpload：分片上传全流程（含取消）
// 数据流：
//   弹窗每次打开重置状态并自动唤起文件选择 → 选定文件校验通过后
//   存入 file → handleUpload 按大小选择上传通道 → 成功后短暂展示
//   成功态，延迟 800ms 触发 uploaded 事件（父组件刷新列表）并关闭。
// 组件关系：仅被 DocumentListView 引用；内部复用 useChunkedUpload 组合式函数。
// ============================================================
import { ref, nextTick, watch, computed, reactive } from 'vue'
import { uploadDocument } from '@/api/document'
import { extractApiError } from '@/api/http'
import { useChunkedUpload } from '../composables/useChunkedUpload'

// 父组件传入：弹窗显隐、目标群组 ID 与群组展示名（群组名仅用于界面提示）
const props = defineProps<{
  visible: boolean
  groupId: number | null
  groupLabel: string
}>()

// update:visible：显隐双向绑定；uploaded：上传成功后通知父组件刷新列表
const emit = defineEmits<{
  'update:visible': [val: boolean]
  uploaded: []
}>()

// 弹窗内部状态：所选文件、整包上传进度/加载态、错误文案、成功标记、
// 隐藏 file input 引用（用于程序化唤起）、拖拽悬停标记
const file = ref<File | null>(null)
const progress = ref(0)
const loading = ref(false)
const errorMsg = ref('')
const success = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const dragging = ref(false)

// 上传限制：允许的扩展名、单文件大小上限、超过阈值改走分片上传
const allowedExts = ['.txt', '.md', '.pdf', '.docx']
const MAX_FILE_SIZE = 256 * 1024 * 1024
const CHUNKED_THRESHOLD = 10 * 1024 * 1024

// 分片上传控制器（reactive 包装）：大文件走此通道，与整包上传共用同一套界面
const chunked = reactive(useChunkedUpload())

// 整包或分片任一通道在上传中都视为「上传中」（用于锁定关闭/取消行为）
const isUploading = computed(() => loading.value || chunked.isUploading)
// 进度条数据源：分片上传进行中优先展示分片进度，否则用整包上传进度
const displayProgress = computed(() =>
  chunked.isUploading ? chunked.progress : progress.value,
)
// 错误文案合并展示：整包错误与分片错误谁有就显示谁
const displayError = computed(() => errorMsg.value || chunked.error)
// 是否处于分片上传流程（决定「取消上传」按钮的显隐）
const isChunkedActive = computed(() => chunked.isUploading)

// 清空全部内部状态（含分片控制器），避免下次打开残留上一次的文件/进度/错误
function resetState() {
  file.value = null
  progress.value = 0
  loading.value = false
  errorMsg.value = ''
  success.value = false
  dragging.value = false
  chunked.reset()
}

// 弹窗每次打开：先重置状态，再自动点击隐藏的 file input 唤起系统文件选择框
watch(
  () => props.visible,
  (val) => {
    if (val) {
      resetState()
      nextTick(() => fileInputRef.value?.click())
    }
  },
)

// 校验文件扩展名与大小；返回错误文案，null 表示校验通过
function validateFile(f: File): string | null {
  const ext = '.' + f.name.split('.').pop()?.toLowerCase()
  if (!allowedExts.includes(ext)) {
    return `不支持的文件类型（支持: ${allowedExts.join(', ')}）`
  }
  if (f.size > MAX_FILE_SIZE) {
    return `文件大小不能超过 ${formatSize(MAX_FILE_SIZE)}`
  }
  return null
}

// 点击选择的 change 回调：读取所选文件并校验，不合法则清空并提示
function onFilePicked(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (!f) {
    file.value = null
    return
  }
  const err = validateFile(f)
  if (err) {
    errorMsg.value = err
    file.value = null
    return
  }
  errorMsg.value = ''
  file.value = f
}

// 拖拽释放：取第一个文件走同一套校验逻辑（与点击选择保持一致）
function onDrop(e: DragEvent) {
  e.preventDefault()
  dragging.value = false
  const f = e.dataTransfer?.files?.[0]
  if (!f) return
  const err = validateFile(f)
  if (err) {
    errorMsg.value = err
    file.value = null
    return
  }
  errorMsg.value = ''
  file.value = f
}

// 拖拽悬停时高亮放置区（需阻止默认行为才能触发后续 drop）
function onDragOver(e: DragEvent) {
  e.preventDefault()
  dragging.value = true
}

// 拖拽离开时取消高亮
function onDragLeave() {
  dragging.value = false
}

// 执行上传：按文件大小选择分片或整包通道；成功后短暂展示成功态，
// 再通知父组件刷新列表并关闭弹窗；整包失败时兜底写入通用错误文案
async function handleUpload() {
  if (!file.value || props.groupId === null) return

  loading.value = true
  errorMsg.value = ''
  progress.value = 0
  try {
    if (file.value.size > CHUNKED_THRESHOLD) {
      await chunked.uploadFile(file.value, props.groupId)
    } else {
      await uploadDocument({
        groupId: props.groupId,
        file: file.value,
        onProgress: (loaded, total) => {
          if (total) {
            progress.value = Math.round((loaded / total) * 100)
          }
        },
      })
    }
    success.value = true
    file.value = null
    setTimeout(() => {
      emit('uploaded')
      emit('update:visible', false)
    }, 800)
  } catch (err) {
    if (!chunked.error) {
      errorMsg.value = extractApiError(err, '上传文件失败')
    }
  } finally {
    loading.value = false
  }
}

// 失败重试：清空错误文案后重新执行上传（文件仍保留在状态中）
async function retryUpload() {
  errorMsg.value = ''
  await handleUpload()
}

// 关闭弹窗；上传进行中禁止关闭，避免中断后进度状态不一致
function close() {
  if (isUploading.value) return
  emit('update:visible', false)
}

// 字节数格式化为 B / KB / MB（保留一位小数）
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <!-- 上传弹窗：上传中禁用点击遮罩 / ESC / 右上角关闭，防止误触中断上传 -->
  <el-dialog
    :model-value="visible"
    :close-on-click-modal="false"
    :close-on-press-escape="!isUploading"
    :show-close="!isUploading"
    width="460px"
    top="13vh"
    @update:model-value="(val: boolean) => { if (!val) close() }"
  >
    <template #header>
      <div class="upload-dialog__header">
        <span class="upload-dialog__eyebrow">Upload</span>
        <h2 class="upload-dialog__title">添加新文档</h2>
      </div>
    </template>

    <div class="upload-dialog">
      <p class="upload-dialog__group">
        目标群组：<strong>{{ groupLabel }}</strong>
      </p>

      <!-- Drop zone -->
      <div
        v-if="!success"
        class="upload-dialog__zone"
        :class="{ 'is-dragging': dragging, 'is-filled': !!file }"
        @click="fileInputRef?.click()"
        @drop="onDrop"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
      >
        <template v-if="!file">
          <div class="upload-dialog__zone-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <p class="upload-dialog__zone-text">
            <strong>点击选择文件</strong>
            <span>或将文件拖拽到此处</span>
          </p>
          <p class="upload-dialog__zone-hint">支持 TXT · MD · PDF · DOCX，最大 256 MB</p>
        </template>
        <template v-else>
          <div class="upload-dialog__file-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <p class="upload-dialog__file-name">{{ file.name }}</p>
          <p class="upload-dialog__file-size">{{ formatSize(file.size) }}</p>
          <button
            class="upload-dialog__file-change"
            type="button"
            @click.stop="fileInputRef?.click()"
          >
            更换文件
          </button>
        </template>
      </div>

      <!-- 隐藏的原生 file input：拖拽区点击时通过程序化 click 唤起 -->
      <input
        ref="fileInputRef"
        type="file"
        accept=".txt,.md,.pdf,.docx"
        class="upload-dialog__file-input"
        @change="onFilePicked"
      />

      <!-- Progress -->
      <div v-if="isUploading || success" class="upload-dialog__progress">
        <div v-if="isChunkedActive && chunked.stage" class="upload-dialog__stage">
          <span v-if="chunked.stage === 'hashing'">{{ chunked.hashingProgress || '正在计算文件指纹...' }}</span>
          <span v-else-if="chunked.stage === 'init'">正在初始化上传...</span>
          <span v-else-if="chunked.stage === 'uploading'">
            分片上传中 {{ chunked.chunkProgress.uploaded }}/{{ chunked.chunkProgress.total }}
          </span>
          <span v-else-if="chunked.stage === 'completing'">正在合并文件...</span>
        </div>
        <div class="upload-dialog__progress-row">
          <div class="upload-dialog__progress-track">
            <div
              class="upload-dialog__progress-fill"
              :class="{ 'is-done': success }"
              :style="{ width: displayProgress + '%' }"
            />
          </div>
          <span class="upload-dialog__progress-text">
            {{ success ? '上传成功' : `${displayProgress}%` }}
          </span>
        </div>
      </div>

      <!-- Error with retry -->
      <div v-if="displayError" class="upload-dialog__error">
        <div class="upload-dialog__error-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <span class="upload-dialog__error-text">{{ displayError }}</span>
        <button
          v-if="file && !isUploading"
          class="upload-dialog__error-retry"
          type="button"
          @click="retryUpload"
        >
          重试
        </button>
      </div>

      <!-- Actions -->
      <div class="upload-dialog__actions">
        <button
          v-if="!success"
          class="upload-dialog__btn upload-dialog__btn--primary"
          :disabled="!file || isUploading"
          @click="handleUpload"
        >
          <span v-if="!isUploading">开始上传</span>
          <span v-else>上传中...</span>
        </button>
        <button
          v-if="isChunkedActive && !success"
          class="upload-dialog__btn upload-dialog__btn--ghost"
          @click="chunked.cancel()"
        >
          取消上传
        </button>
        <button
          v-if="!isChunkedActive || success"
          class="upload-dialog__btn upload-dialog__btn--ghost"
          :disabled="isUploading"
          @click="close"
        >
          {{ success ? '关闭' : '取消' }}
        </button>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.upload-dialog__header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.upload-dialog__eyebrow {
  font-family: 'Poppins', sans-serif;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--brand-primary);
}

.upload-dialog__title {
  margin: 0;
  font-family: 'Poppins', 'Noto Sans SC', sans-serif;
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-primary);
}

.upload-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.upload-dialog__group {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.upload-dialog__group strong {
  color: var(--text-primary);
  font-weight: 600;
}

/* Drop zone */
.upload-dialog__zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 36px 20px;
  border: 2px dashed var(--border-default);
  border-radius: var(--radius-md);
  background: var(--surface-subtle);
  cursor: pointer;
  color: var(--text-muted);
  transition: all 0.2s ease;
}

.upload-dialog__zone:hover,
.upload-dialog__zone.is-dragging {
  border-color: var(--brand-primary);
  background: rgba(74, 144, 217, 0.04);
  color: var(--brand-primary);
}

.upload-dialog__zone.is-filled {
  border-style: solid;
  border-color: var(--brand-primary);
  background: rgba(74, 144, 217, 0.04);
  color: var(--text-primary);
}

.upload-dialog__zone-icon,
.upload-dialog__file-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(74, 144, 217, 0.1);
  color: var(--brand-primary);
}

.upload-dialog__zone-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-primary);
  text-align: center;
}

.upload-dialog__zone-text strong {
  font-weight: 600;
  color: var(--brand-primary);
}

.upload-dialog__zone-text span {
  color: var(--text-muted);
  font-size: 0.82rem;
}

.upload-dialog__zone-hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--text-muted);
  letter-spacing: 0.02em;
}

.upload-dialog__file-name {
  margin: 4px 0 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
  word-break: break-all;
  text-align: center;
  max-width: 340px;
}

.upload-dialog__file-size {
  margin: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.upload-dialog__file-change {
  margin-top: 6px;
  padding: 4px 14px;
  font-family: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--brand-primary);
  background: #fff;
  border: 1px solid rgba(74, 144, 217, 0.3);
  border-radius: 100px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.upload-dialog__file-change:hover {
  background: var(--surface-accent);
  border-color: var(--brand-primary);
}

.upload-dialog__file-input {
  display: none;
}

/* Progress */
.upload-dialog__progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.upload-dialog__stage {
  font-size: 0.8rem;
  color: var(--brand-primary);
  font-weight: 600;
  text-align: center;
  padding: 4px 0;
}

.upload-dialog__progress-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.upload-dialog__progress-track {
  flex: 1;
  height: 6px;
  background: var(--surface-muted);
  border-radius: 3px;
  overflow: hidden;
}

.upload-dialog__progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--brand-primary), var(--brand-accent));
  border-radius: 3px;
  transition: width 0.3s ease;
}

.upload-dialog__progress-fill.is-done {
  background: var(--el-color-success);
}

.upload-dialog__progress-text {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-secondary);
  min-width: 60px;
  text-align: right;
}

/* Error with retry */
.upload-dialog__error {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: rgba(239, 68, 68, 0.06);
  border: 1px solid rgba(239, 68, 68, 0.15);
  border-radius: var(--radius-sm);
}

.upload-dialog__error-icon {
  display: flex;
  color: #dc2626;
  flex-shrink: 0;
}

.upload-dialog__error-text {
  flex: 1;
  font-size: 0.82rem;
  color: #b91c1c;
  line-height: 1.4;
}

.upload-dialog__error-retry {
  flex-shrink: 0;
  padding: 4px 12px;
  font-family: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  color: #dc2626;
  background: #fff;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 100px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.upload-dialog__error-retry:hover {
  background: rgba(239, 68, 68, 0.08);
  border-color: #dc2626;
}

/* Action buttons */
.upload-dialog__actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 4px;
}

.upload-dialog__btn {
  padding: 9px 22px;
  font-family: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s ease;
}

.upload-dialog__btn--primary {
  color: #fff;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
  box-shadow: 0 4px 14px rgba(74, 144, 217, 0.25);
}

.upload-dialog__btn--primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(74, 144, 217, 0.35);
}

.upload-dialog__btn--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.upload-dialog__btn--ghost {
  color: var(--text-secondary);
  background: var(--surface-muted);
}

.upload-dialog__btn--ghost:hover:not(:disabled) {
  background: var(--border-default);
  color: var(--text-primary);
}

.upload-dialog__btn--ghost:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
