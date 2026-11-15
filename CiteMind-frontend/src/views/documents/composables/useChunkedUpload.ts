// ═══════════════════════════════════════════════════════════════════════════
// 分片上传 Composable（useChunkedUpload）
// ───────────────────────────────────────────────────────────────────────────
// 供 UploadDialog.vue 使用，封装「大文件三阶段分片上传」的完整前端流程：
//
//   ① hashing     计算文件整体 SHA-256（用于服务端秒传检测）
//   ② init        POST /api/documents/upload/init
//                 —— 命中秒传（instantUpload）直接结束；
//                    未命中则拿到 uploadId 与断点续传信息（已上传分片列表）
//   ③ uploading   逐片 POST /api/documents/upload/chunks（跳过已传分片）
//   ④ completing  POST /api/documents/upload/{uploadId}/complete 合并触发 ETL
//
// 状态通过 reactive 对象暴露给组件，UI 可展示阶段文案、分片进度与整体百分比；
// 内部使用 AbortController 支持「取消上传」；出错时错误信息写入 error 字段，
// 组件据此展示错误条与重试按钮。
// ═══════════════════════════════════════════════════════════════════════════

import { computed, reactive } from 'vue'
import {
  completeDocumentUpload,
  initDocumentUpload,
  uploadDocumentChunk,
} from '@/api/document'
import { extractApiError } from '@/api/http'

/** 分片大小：5MB（与后端约定保持一致，过大易失败、过小请求过多） */
const CHUNK_SIZE = 5 * 1024 * 1024

/** 上传阶段（驱动 UI 的阶段文案展示） */
export type ChunkedUploadStage = '' | 'hashing' | 'init' | 'uploading' | 'completing'

/**
 * 创建分片上传控制器。
 *
 * 返回值经 reactive 包装后供组件直接使用：
 * - 状态：isUploading / progress / error / stage / hashingProgress / chunkProgress
 * - 操作：uploadFile(file, groupId) / cancel() / reset()
 *
 * 用法（UploadDialog.vue）：
 * ```ts
 * const chunked = reactive(useChunkedUpload())
 * await chunked.uploadFile(file, groupId)
 * ```
 */
export function useChunkedUpload() {
  // ── 响应式状态 ──
  const state = reactive({
    isUploading: false,
    progress: 0,
    error: '',
    stage: '' as ChunkedUploadStage,
    hashingProgress: '',
    chunkProgress: { uploaded: 0, total: 0 },
  })

  /** 当前上传的中止控制器（cancel 时触发） */
  let abortController: AbortController | null = null

  /** 复位状态（保留 error 由调用方决定，这里彻底清空） */
  function reset() {
    state.isUploading = false
    state.progress = 0
    state.error = ''
    state.stage = ''
    state.hashingProgress = ''
    state.chunkProgress = { uploaded: 0, total: 0 }
    abortController = null
  }

  /** 取消上传：中止正在进行的请求（init/chunk/complete 都携带同一 signal） */
  function cancel() {
    abortController?.abort()
    reset()
  }

  // ─────────────────────────────────────────────
  // 内部工具
  // ─────────────────────────────────────────────

  /**
   * 计算数据的 SHA-256 十六进制哈希。
   * 使用浏览器原生 WebCrypto（需 HTTPS 或 localhost 环境）。
   */
  async function sha256Hex(data: ArrayBuffer | Blob): Promise<string> {
    const buffer = data instanceof Blob ? await data.arrayBuffer() : data
    const digest = await crypto.subtle.digest('SHA-256', buffer)
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  /**
   * 主流程：三阶段分片上传。
   *
   * @param file 用户选择的文件
   * @param groupId 目标群组（需为当前用户管理的群组）
   */
  async function uploadFile(file: File, groupId: number): Promise<void> {
    // 每次上传前复位状态并创建新的 AbortController
    reset()
    state.isUploading = true
    abortController = new AbortController()
    const { signal } = abortController

    try {
      // ── ① hashing：计算文件指纹 ──
      state.stage = 'hashing'
      state.hashingProgress = '正在计算文件指纹...'
      const fileHash = await sha256Hex(file)

      // ── ② init：秒传检测 + 创建上传会话 ──
      state.stage = 'init'
      const chunkCount = Math.max(1, Math.ceil(file.size / CHUNK_SIZE))
      const initResult = await initDocumentUpload(
        {
          groupId,
          fileName: file.name,
          fileSize: file.size,
          contentType: file.type || 'application/octet-stream',
          fileHash,
          chunkSize: CHUNK_SIZE,
          chunkCount,
        },
        signal,
      )

      // 秒传命中：服务端已存在相同哈希的文件，直接结束
      if (initResult.instantUpload) {
        state.progress = 100
        return
      }

      const uploadId = initResult.uploadId
      if (!uploadId) {
        throw new Error('初始化上传失败：未返回 uploadId')
      }

      // ── ③ uploading：逐片上传（断点续传：跳过服务端已有的分片） ──
      state.stage = 'uploading'
      state.chunkProgress = { uploaded: initResult.uploadedChunks.length, total: chunkCount }
      const uploadedSet = new Set(initResult.uploadedChunks)

      for (let index = 0; index < chunkCount; index++) {
        if (uploadedSet.has(index)) {
          continue // 断点续传：该分片已存在，跳过
        }

        const start = index * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, file.size)
        const chunkBlob = file.slice(start, end)
        const chunkHash = await sha256Hex(chunkBlob)

        await uploadDocumentChunk(
          { uploadId, chunkIndex: index, chunkHash, chunk: chunkBlob },
          undefined,
          signal,
        )

        uploadedSet.add(index)
        state.chunkProgress.uploaded = uploadedSet.size
        state.progress = Math.round((uploadedSet.size / chunkCount) * 95) // 预留 5% 给合并
      }

      // ── ④ completing：通知服务端合并 ──
      state.stage = 'completing'
      await completeDocumentUpload(uploadId, signal)
      state.progress = 100
    } catch (error) {
      // 用户主动取消：静默复位即可，不作为错误展示
      if ((error as Error)?.name === 'AbortError') {
        return
      }
      state.error = extractApiError(error, '分片上传失败')
      throw error
    } finally {
      state.stage = ''
      state.isUploading = false
    }
  }

  return {
    // 状态（reactive 包装后组件内可直接读写）
    isUploading: computed(() => state.isUploading),
    progress: computed(() => state.progress),
    error: computed({
      get: () => state.error,
      set: (value: string) => {
        state.error = value
      },
    }),
    stage: computed(() => state.stage),
    hashingProgress: computed(() => state.hashingProgress),
    chunkProgress: computed(() => state.chunkProgress),
    // 操作
    uploadFile,
    cancel,
    reset,
  }
}
