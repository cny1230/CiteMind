package com.citemind.rag.ingestion.config;

import com.citemind.rag.document.mapper.DocumentMapper;
import com.citemind.rag.ingestion.service.pipeline.ChunkService;
import com.citemind.rag.ingestion.service.pipeline.parser.DocumentParserFactory;
import com.citemind.rag.ingestion.service.DocumentIngestionProcessor;
import com.citemind.rag.ingestion.service.EtlDocumentIngestionProcessor;
import com.citemind.rag.ingestion.service.pipeline.transformer.StructureAwareChunkTransformer;
import com.citemind.rag.ingestion.service.pipeline.transformer.TextCleanupTransformer;
import com.citemind.rag.ingestion.vector.VectorIngestionService;
import com.citemind.rag.engine.storage.ObjectStorageService;
import com.citemind.rag.ingestion.service.pipeline.transformer.ChunkingProperties;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 文档摄入模块的 Spring 配置类。
 *
 * <h3>职责</h3>
 * <p>负责装配文档 ETL 流水线所需的全部 Bean，包括：</p>
 * <ul>
 *     <li>{@link DocumentIngestionProcessor} —— 文档摄入主处理器</li>
 *     <li>{@link TextCleanupTransformer} —— 文本清洗转换器
 *         （仅在容器中不存在同类型 Bean 时才创建默认实例）</li>
 * </ul>
 *
 * <h3>设计要点</h3>
 * <ul>
 *     <li>使用 {@code proxyBeanMethods = false} 避免 CGLIB 代理，提升启动性能</li>
 *     <li>通过 {@link ObjectProvider} 实现延迟依赖解析，允许其他模块在文档
 *         模块之后加载而不会出现循环依赖</li>
 *     <li>{@link #requireBean(ObjectProvider, Class)} 在依赖缺失时快速失败，
 *         抛出明确的 {@link IllegalStateException} 而非 NPE</li>
 * </ul>
 *
 * @author CiteMind-RAG Team
 * @since 1.0.0
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(ChunkingProperties.class)
public class DocumentIngestionConfiguration {
    // ─────────────────────────────────────────────────────────────────────────────
    // 【骨架占位】本类属于功能模块实现类，业务逻辑已全部剥离，仅保留类名作为架构占位。
    // 类的原有职责见上方 Javadoc；字段、方法与实现细节请依据 docs/ 需求与接口文档重新实现。
    // ─────────────────────────────────────────────────────────────────────────────
}
