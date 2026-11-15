package com.citemind.rag.engine.storage;

import com.citemind.rag.common.exception.BusinessException;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.util.List;

/**
 * 对象存储服务的降级占位实现，在 MinIO 未配置时由 Spring 自动注入。
 * <p>
 * 当 {@code storage.minio.endpoint}、{@code storage.minio.access-key}、
 * {@code storage.minio.secret-key} 三项中<em>任意一项</em>为空或未定义时，
 * Spring 会注入此 Bean 作为 {@link ObjectStorageService} 的替代实现，
 * 确保应用在缺少存储配置时仍可正常启动（而非因缺少 Bean 崩溃）。
 * <p>
 * <b>行为特征：</b>所有写/读操作均直接抛出 {@link BusinessException}，
 * 采用「快速失败」（fail-fast）策略——不返回空数据或假成功，
 * 而是在运行时明确告知调用方存储不可用，迫使用户完成配置。
 * <p>
 * <b>注入条件：</b>当 Spring 容器中不存在任何 {@link ObjectStorageService} 实现时自动注入。
 *
 * @author CiteMind-RAG Team
 * @see ObjectStorageService  服务契约接口
 * @see MinioStorageService   正常配置时的生产级 MinIO 实现
 */
@Service
@ConditionalOnMissingBean(ObjectStorageService.class)
@Slf4j
public class MissingObjectStorageService {
    // ─────────────────────────────────────────────────────────────────────────────
    // 【骨架占位】本类属于功能模块实现类，业务逻辑已全部剥离，仅保留类名作为架构占位。
    // 类的原有职责见上方 Javadoc；字段、方法与实现细节请依据 docs/ 需求与接口文档重新实现。
    // ─────────────────────────────────────────────────────────────────────────────
}
