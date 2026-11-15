package com.citemind.rag.qa.service;

import com.citemind.rag.qa.model.vo.AskQuestionResponse;
import com.citemind.rag.qa.rag.ReadyChunkDocumentRetriever;
import com.citemind.rag.qa.rag.RetrievedEvidenceBundle;
import com.citemind.rag.qa.support.CitationAssembler;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * QA 模块对外检索门面，供 assistant 等模块调用。
 */
@Service
public class QaRetrievalService {
    // ─────────────────────────────────────────────────────────────────────────────
    // 【骨架占位】本类属于功能模块实现类，业务逻辑已全部剥离，仅保留类名作为架构占位。
    // 类的原有职责见上方 Javadoc；字段、方法与实现细节请依据 docs/ 需求与接口文档重新实现。
    // ─────────────────────────────────────────────────────────────────────────────

    // ─────────────────────────────────────────────────────────────────────────────
    // 【数据契约保留】以下嵌套 record/enum 是该模块对外的数据结构（接口契约的一部分），
    // 作为类型定义原样保留；其填充与消费逻辑已随业务实现一并剥离，待重新实现。
    // ─────────────────────────────────────────────────────────────────────────────

    public record QaRetrievalResult(
            RetrievedEvidenceBundle bundle,
            List<AskQuestionResponse.Citation> citations
    ) {}
}
