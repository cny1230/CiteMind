// ═══════════════════════════════════════════════════════════════════════════
// Mock 流式回答（SSE 模拟器）与「演示知识库」
// ───────────────────────────────────────────────────────────────────────────
// 真实后端的 /api/qa/stream-ask 与 /api/assistant/chat/stream 是基于 Fetch 的
// SSE 接口（不走 axios），因此 Mock 无法在 axios adapter 层拦截，
// 而是在 api/qa.ts 与 api/assistant.ts 的流式函数入口处提前分支到本文件。
//
// 本文件职责：
// 1. 维护一个「演示知识库」：按问题关键词命中预置的 Markdown 答案与引用；
// 2. 以打字机节奏回放答案文本（onToken / delta 事件），支持 AbortSignal 中断；
// 3. 结束时回调引用列表（citations）与证据总览（evidenceOverview）。
// ═══════════════════════════════════════════════════════════════════════════

import type {
  CitationItem,
  EvidenceOverview,
  QaRecordDetail,
  QaStreamHandlers,
  AskQuestionPayload,
} from '../api/qa'
import type {
  AssistantChatPayload,
  AssistantChatResult,
  AssistantChatStreamEvent,
} from '../types/assistant'
import {
  allDocuments,
  appendQaRecord,
  appendSessionMessage,
  getCurrentUser,
  makeCitation,
} from './fixtures'

// ─────────────────────────────────────────────────────────────────────────────
// 演示知识库：关键词 → 答案
// ─────────────────────────────────────────────────────────────────────────────
// 每条目 = 匹配关键词数组 + Markdown 答案。
// 命中优先级 = 数组顺序（更靠前的条目优先），兜底使用 generic 条目。

interface KnowledgeEntry {
  keywords: string[]
  answer: string
}

const KNOWLEDGE: KnowledgeEntry[] = [
  {
    keywords: ['上传', '分片', '断点', '续传', '秒传'],
    answer: [
      '## 分片上传协议\n',
      '平台的大文件上传采用 **三阶段协议**，天然支持断点续传与秒传：\n\n',
      '| 阶段 | 接口 | 说明 |\n|---|---|---|\n',
      '| ① init | `POST /api/documents/upload/init` | 携带 SHA-256 文件哈希做**秒传检测**；命中则直接复用已有文件 |\n',
      '| ② chunk | `POST /api/documents/upload/chunks` | 逐片上传，服务端记录已收分片序号，**断点续传**时跳过已传分片 |\n',
      '| ③ complete | `POST /api/documents/upload/{id}/complete` | 校验分片完整性，合并触发异步 ETL |\n\n',
      '关键设计：\n\n- 分片哈希校验，防止传输损坏与篡改；\n- 合并动作原子化，并发完成请求只生效一次；\n- 孤儿上传会话由后台 Runner 定期回收。',
    ].join(''),
  },
  {
    keywords: ['检索', '混合', '向量', '关键词', 'RRF', '召回'],
    answer: [
      '## 混合检索架构\n\n',
      '检索采用**双通道并行 + RRF 融合排序**：\n\n',
      '1. **向量语义通道**：pgvector + HNSW 索引，COSINE 距离，512 维向量，捕捉语义相似性；\n',
      '2. **关键词通道**：Elasticsearch + IK 中文分词 + BM25，精准命中专业术语与错误码；\n',
      '3. **RRF 融合**：两路结果按倒数排名融合，兼顾语义与精确匹配；\n',
      '4. **证据增强**：类簇聚合 + 邻居窗口扩展，避免上下文碎片化。\n\n',
      '所有检索都会附加 `groupId + status=READY` 过滤，保证群组数据隔离。',
    ].join(''),
  },
  {
    keywords: ['引用', '溯源', '来源', 'citation'],
    answer: [
      '## 引用溯源\n\n',
      '每条回答都携带结构化引用列表：文档 ID、切片序号、相关度评分、片段摘录。\n\n',
      '前端将引用渲染为可点击的侧边栏（CitationRail / AssistantCitationBar），',
      '点击即可定位到来源文档的预览内容，实现「**让每一次提问都有据可查**」。',
    ].join(''),
  },
  {
    keywords: ['认证', '登录', 'jwt', 'token', '权限', '角色'],
    answer: [
      '## 认证与权限体系\n\n',
      '- **JWT 双令牌**：Access Token（30 分钟，Authorization 头）+ Refresh Token（14 天，httpOnly Cookie + 数据库轮换）；\n',
      '- **三级角色**：系统管理员（Admin）/ 群组管理员（Owner）/ 普通成员（Member）；\n',
      '- 密码使用 BCrypt 自适应哈希存储；管理员可重置用户密码并强制其下次修改；\n',
      '- 所有关键操作通过 AOP 切面记录操作日志。',
    ].join(''),
  },
  {
    keywords: ['助手', 'agent', '会话', '记忆', '压缩'],
    answer: [
      '## AI 助手与短期记忆\n\n',
      '助手基于 **ReactAgent 图执行引擎**：思考 → 工具调用 → 生成回复。\n\n',
      '支持 CHAT（自由对话）/ KB_SEARCH（知识库检索）双模式，同一会话内动态切换。\n\n',
      '长期对话通过**三级记忆压缩**维持上下文：\n\n',
      '1. L1 会话记忆：增量 LLM 摘要；\n2. L2 紧凑摘要：丢弃冗余细节；\n3. L3 运行时截断：Token 超限时的最后防线。',
    ].join(''),
  },
  {
    keywords: ['etl', '解析', '切片', '管道', '处理'],
    answer: [
      '## ETL 文档处理管道\n\n',
      '文档上传完成后进入异步 ETL 流水线（Spring Event + @Async + @Retryable）：\n\n',
      '1. **读取**：从对象存储加载原始文件；\n2. **解析**：PDF（PDFBox）/ DOCX（POI）/ MD / TXT 多格式解析器；\n',
      '3. **清洗**：空白规整、页眉页脚剔除；\n4. **结构感知切片**：按标题层级切分，目标 240 token、上限 320 token、重叠 32 token；\n',
      '5. **向量化**：text-embedding-v3（512 维）批量写入 pgvector；\n6. **索引**：切片写入 ES（IK 分词）；\n7. **状态机**：PROCESSING → READY / FAILED，全程可追踪、失败可重试。',
    ].join(''),
  },
  {
    keywords: ['用量', '统计', '成本', 'token', '费用'],
    answer: [
      '## LLM 用量与成本\n\n',
      '平台对每次 LLM 调用采集用量记录：prompt / completion / total tokens、延迟、模型与端点。\n\n',
      '成本按 token 单价折算（估算值会标记 `isEstimated`），管理员可在「使用统计」页查看：\n\n',
      '- 今日指标与 30 天趋势；\n- 平台 / 用户 / 群组三个维度的统计；\n- 用户与群组的用量排行。',
    ].join(''),
  },
  {
    keywords: ['部署', '环境', 'docker', '启动'],
    answer: [
      '## 部署与启动\n\n',
      '- 后端：`./mvnw spring-boot:run`（默认 local profile，端口 10001）；\n',
      '- 前端：`npm install && npm run dev`（端口 5173）；\n',
      '- 中间件：`deploy/docker-compose.yml` 提供 PostgreSQL(pgvector) / Elasticsearch(IK) / MinIO；\n',
      '- 数据库初始化：`sql/schema.sql`；\n- API 文档：http://localhost:10001/doc.html（Knife4j）。',
    ].join(''),
  },
]

/** 兜底答案：介绍平台能力（也充当「产品介绍」话术） */
const GENERIC_ANSWER = [
  '根据知识库内容，回答如下：\n\n',
  'CiteMind 是一个融合 RAG 与 AI Agent 的知识库平台，核心能力包括：\n\n',
  '- **文档全生命周期管理**：分片上传（秒传 / 断点续传）→ 多格式解析 → 异步 ETL 入库；\n',
  '- **混合检索问答**：向量 + 关键词双通道、RRF 融合、四级证据评估、引用溯源；\n',
  '- **AI 助手**：ReactAgent 双模式对话、三级短期记忆压缩、SSE 流式输出；\n',
  '- **企业级治理**：JWT 双令牌认证、三级角色权限、群组数据隔离、用量统计。\n\n',
  '如需了解某个主题的细节，可以直接继续追问。',
].join('')

/** 拒答演示：问题包含这些词时返回「证据不足」分支，演示四级证据评估的拒答能力 */
const REFUSAL_HINTS = ['无从回答', '不要回答', '拒答演示']

// ─────────────────────────────────────────────────────────────────────────────
// 答案选择与引用构建
// ─────────────────────────────────────────────────────────────────────────────

/** 按关键词命中演示知识库，返回最匹配的答案；无命中时返回兜底答案 */
export function pickAnswer(question: string): string {
  const q = question.toLowerCase()
  for (const entry of KNOWLEDGE) {
    if (entry.keywords.some((k) => q.includes(k.toLowerCase()))) {
      return entry.answer
    }
  }
  return GENERIC_ANSWER
}

/** 挑选该群组下可用于引用的 READY 文档（不足时放宽到全部 READY 文档） */
function pickCitationDocs(groupId: number): typeof allDocuments {
  const readyInGroup = allDocuments.filter((d) => d.groupId === groupId && d.status === 'READY')
  if (readyInGroup.length > 0) {
    return readyInGroup
  }
  return allDocuments.filter((d) => d.status === 'READY')
}

/** 构建引用列表（1~3 条，带真实感的相关度评分与片段摘录） */
function buildCitations(groupId: number, count: number): CitationItem[] {
  const docs = pickCitationDocs(groupId)
  if (docs.length === 0) {
    return []
  }
  const citations: CitationItem[] = []
  for (let i = 0; i < Math.min(count, docs.length); i++) {
    const doc = docs[i]!
    const citation = makeCitation(doc, 3 + i * 2, doc.previewText ?? '')
    citations.push({
      documentId: citation.documentId,
      chunkId: citation.chunkId,
      chunkIndex: citation.chunkIndex,
      fileName: citation.fileName,
      score: citation.score ?? 0,
      snippet: citation.snippet,
    })
  }
  return citations
}

/** 构建证据总览（EvidenceOverviewPanel 的数据源） */
function buildEvidenceOverview(groupId: number, citations: CitationItem[]): EvidenceOverview {
  const groups = new Map<number, EvidenceOverview['groups'][number]>()
  for (const c of citations) {
    const key = c.documentId ?? 0
    if (!groups.has(key)) {
      groups.set(key, {
        documentId: c.documentId,
        fileName: c.fileName,
        evidenceCount: 0,
        topScore: 0,
        retrievalSources: [],
        snippets: [],
      })
    }
    const g = groups.get(key)!
    g.evidenceCount += 1
    g.topScore = Math.max(g.topScore, c.score)
    if (!g.retrievalSources.includes('HYBRID')) {
      g.retrievalSources.push('HYBRID')
    }
    g.snippets.push({
      evidenceId: `ev-${key}-${g.evidenceCount}`,
      chunkId: c.chunkId,
      chunkIndex: c.chunkIndex,
      startChunkIndex: c.chunkIndex,
      endChunkIndex: c.chunkIndex,
      score: c.score,
      retrievalSource: 'HYBRID',
      snippet: c.snippet,
    })
  }
  return {
    documentCount: groups.size,
    evidenceCount: citations.length,
    coverageMode: 'MULTI_DOC',
    groups: [...groups.values()],
    warnings: [],
  }
}

/** 延时工具：等待 ms 毫秒，期间响应 AbortSignal */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** 把整段答案切成「打字机」节奏的文本增量（按标点/换行自然断句） */
function chunkAnswer(answer: string): string[] {
  const parts = answer.split(/(?<=[。！？\n])/g)
  return parts.filter((p) => p.length > 0)
}

/** 追问历史落库：构建一条问答记录并写入演示数据集 */
function saveQaRecord(
  payload: AskQuestionPayload,
  question: string,
  citations: CitationItem[],
  answered: boolean,
  latencyStart: number,
): number {
  const detail: QaRecordDetail = {
    id: Date.now() % 100000,
    userId: getCurrentUser()?.userId ?? 1,
    groupId: payload.groupId,
    question,
    answer: answered ? buildCitationsAnswerText(citations) : null,
    answered,
    reasonCode: answered ? null : 'NO_EVIDENCE',
    reasonMessage: answered ? null : '检索到的有效证据不足，暂不回答。',
    evidenceLevel: answered ? 'SUFFICIENT' : 'NONE',
    citationCount: citations.length,
    promptTokens: answered ? 640 + question.length * 2 : 0,
    completionTokens: answered ? 160 + Math.round(Math.random() * 120) : 0,
    totalTokens: answered ? 800 + question.length * 3 : 0,
    isEstimated: false,
    latencyMs: Date.now() - latencyStart,
    modelName: 'qwen-plus',
    endpoint: 'dashscope',
    success: true,
    errorMessage: null,
    createdAt: new Date().toISOString(),
    evidenceOverview: null,
    citations: [],
  }
  appendQaRecord(detail)
  return detail.id
}

function buildCitationsAnswerText(citations: CitationItem[]): string {
  return citations.length > 0
    ? `已基于 ${citations.length} 条知识库证据生成回答（演示模式记录）。`
    : '（演示模式记录）'
}

// ─────────────────────────────────────────────────────────────────────────────
// 对外 Mock 实现
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 同步问答 Mock（POST /api/qa/ask 的 Mock 分支）
 * 直接返回完整回答结果，不打字机动画。
 */
export async function mockAskQuestion(payload: AskQuestionPayload) {
  const start = Date.now()
  const question = payload.question
  const shouldRefuse = REFUSAL_HINTS.some((h) => question.includes(h))

  if (shouldRefuse) {
    return {
      answered: false,
      answer: null,
      reasonCode: 'NO_EVIDENCE',
      reasonMessage: '检索到的有效证据不足，暂不回答。',
      citations: [],
      evidenceOverview: null,
      recordId: saveQaRecord(payload, question, [], false, start),
    }
  }

  const answer = pickAnswer(question)
  const citations = buildCitations(payload.groupId, 2 + (question.length % 2))
  const recordId = saveQaRecord(payload, question, citations, true, start)
  return {
    answered: true,
    answer,
    reasonCode: null,
    reasonMessage: null,
    citations,
    evidenceOverview: buildEvidenceOverview(payload.groupId, citations),
    recordId,
  }
}

/**
 * 流式问答 Mock（POST /api/qa/stream-ask 的 Mock 分支）
 * 以打字机节奏回调 onToken，结束时回调 onCitations / onEvidenceOverview / onRecord。
 */
export async function mockStreamAskQuestion(
  payload: AskQuestionPayload,
  handlers: QaStreamHandlers,
): Promise<void> {
  const start = Date.now()
  const question = payload.question
  const shouldRefuse = REFUSAL_HINTS.some((h) => question.includes(h))

  try {
    if (shouldRefuse) {
      await sleep(600, handlers.signal)
      handlers.onCitations([])
      handlers.onEvidenceOverview?.(null)
      handlers.onError('检索到的有效证据不足，暂不回答。')
      saveQaRecord(payload, question, [], false, start)
      return
    }

    const answer = pickAnswer(question)
    const citations = buildCitations(payload.groupId, 2 + (question.length % 2))
    handlers.onEvidenceOverview?.(buildEvidenceOverview(payload.groupId, citations))

    // 打字机回放：每段间隔 120~260ms，模拟 LLM 的增量输出节奏
    for (const part of chunkAnswer(answer)) {
      await sleep(120 + Math.random() * 140, handlers.signal)
      handlers.onToken(part)
    }

    handlers.onCitations(citations)
    const recordId = saveQaRecord(payload, question, citations, true, start)
    handlers.onRecord?.(recordId)
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      return // 用户主动中断：静默结束，与真实 SSE 断开行为一致
    }
    handlers.onError((error as Error)?.message ?? '流式问答服务内部错误')
  }
}

/**
 * 同步助手聊天 Mock（POST /api/assistant/chat 的 Mock 分支）
 * 返回完整回复与引用列表，并将会话消息写入演示数据集。
 */
export async function mockAssistantChat(payload: AssistantChatPayload): Promise<AssistantChatResult> {
  const userId = getCurrentUser()?.userId ?? 1
  const question = payload.message
  const isKb = payload.toolMode === 'KB_SEARCH'

  // 用户消息落库
  appendSessionMessage(payload.sessionId, userId, {
    role: 'USER',
    content: question,
    toolMode: payload.toolMode,
    groupId: payload.groupId ?? null,
  })

  // KB_SEARCH 模式带引用；CHAT 模式无引用（与真实语义一致）
  const citations = isKb ? buildCitations(payload.groupId ?? 0, 2) : []
  const reply = isKb
    ? pickAnswer(question)
    : [
        `收到：「${question.slice(0, 40)}${question.length > 40 ? '…' : ''}」\n\n`,
        '这是 CiteMind Agent（演示模式）的回复。真实后端会由 ReactAgent 图引擎驱动：\n\n',
        '- CHAT 模式：自主规划 → 必要时调用工具 → 生成回复；\n',
        '- KB_SEARCH 模式：限定群组知识库检索并生成带引用的回答；\n\n',
        '切换到 KB_SEARCH 模式即可体验带引用溯源的知识库问答。',
      ].join('')

  const assistantMsg = appendSessionMessage(payload.sessionId, userId, {
    role: 'ASSISTANT',
    content: reply,
    toolMode: payload.toolMode,
    groupId: payload.groupId ?? null,
  })

  return {
    sessionId: payload.sessionId,
    messageId: assistantMsg.messageId,
    reply,
    toolMode: payload.toolMode,
    groupId: payload.groupId ?? null,
    citations,
  }
}

/**
 * 流式助手聊天 Mock（POST /api/assistant/chat/stream 的 Mock 分支）
 * 事件序列：start → delta×N → done（携带完整回复与引用）。
 */
export async function mockStreamAssistantMessage(
  payload: AssistantChatPayload,
  handlers: {
    onEvent: (event: AssistantChatStreamEvent) => void
    signal?: AbortSignal
  },
): Promise<void> {
  const base = {
    sessionId: payload.sessionId,
    toolMode: payload.toolMode,
    groupId: payload.groupId ?? null,
  }

  try {
    handlers.onEvent({ ...base, event: 'start', delta: null, messageId: null, reply: null, citations: [], error: null })

    // 复用同步 Mock 生成回复（同样会落库），再拆成增量事件回放
    const result = await mockAssistantChat(payload)
    for (const part of chunkAnswer(result.reply)) {
      await sleep(90 + Math.random() * 110, handlers.signal)
      handlers.onEvent({ ...base, event: 'delta', delta: part, messageId: null, reply: null, citations: [], error: null })
    }

    handlers.onEvent({
      ...base,
      event: 'done',
      delta: null,
      messageId: result.messageId,
      reply: result.reply,
      citations: result.citations,
      error: null,
    })
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      return
    }
    handlers.onEvent({
      ...base,
      event: 'error',
      delta: null,
      messageId: null,
      reply: null,
      citations: [],
      error: (error as Error)?.message ?? '流式服务错误',
    })
  }
}
