package com.citemind.rag.auth.security;

import com.citemind.rag.auth.config.AuthProperties;
import com.citemind.rag.auth.mapper.UserRefreshTokenMapper;
import com.citemind.rag.auth.model.entity.UserRefreshToken;
import com.citemind.rag.auth.service.PasswordHasher;
import com.citemind.rag.auth.service.RefreshTokenRecord;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;

/**
 * Refresh Token 管理服务。
 * <p>
 * Refresh token 格式为 {@code tokenId.secret}，tokenId 明文字段索引查找记录，
 * secret 部分 bcrypt 哈希存储。签发和吊销均操作 user_refresh_tokens 表。
 */
@Service
public class RefreshTokenService {
    // ─────────────────────────────────────────────────────────────────────────────
    // 【骨架占位】本类属于功能模块实现类，业务逻辑已全部剥离，仅保留类名作为架构占位。
    // 类的原有职责见上方 Javadoc；字段、方法与实现细节请依据 docs/ 需求与接口文档重新实现。
    // ─────────────────────────────────────────────────────────────────────────────

    // ─────────────────────────────────────────────────────────────────────────────
    // 【数据契约保留】以下嵌套 record/enum 是该模块对外的数据结构（接口契约的一部分），
    // 作为类型定义原样保留；其填充与消费逻辑已随业务实现一并剥离，待重新实现。
    // ─────────────────────────────────────────────────────────────────────────────

    public record IssuedRefreshToken(String refreshToken, RefreshTokenRecord record) {
    }
}
