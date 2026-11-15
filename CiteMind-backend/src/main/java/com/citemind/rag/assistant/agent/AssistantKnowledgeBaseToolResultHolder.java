package com.citemind.rag.assistant.agent;

import com.citemind.rag.qa.model.vo.AskQuestionResponse;

import java.util.List;

/**
 * 知识库检索工具结果持有器。
 * <p>用于在 Agent 图执行过程中跨步骤传递知识库检索的结果和引用信息。</p>
 * <p>主要通过 {@link AssistantKnowledgeBaseTool} 在工具执行完毕后记录引用列表，
 * 后续由 {@link AssistantAgentFacade} 读取并组装最终响应。</p>
 */
public class AssistantKnowledgeBaseToolResultHolder {
    // ─────────────────────────────────────────────────────────────────────────────
    // 【骨架占位】本类属于功能模块实现类，业务逻辑已全部剥离，仅保留类名作为架构占位。
    // 类的原有职责见上方 Javadoc；字段、方法与实现细节请依据 docs/ 需求与接口文档重新实现。
    // ─────────────────────────────────────────────────────────────────────────────
}
