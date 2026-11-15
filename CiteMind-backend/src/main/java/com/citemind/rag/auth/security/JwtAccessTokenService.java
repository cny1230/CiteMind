package com.citemind.rag.auth.security;

import com.citemind.rag.auth.config.AuthProperties;
import com.citemind.rag.common.enums.SystemRole;
import com.citemind.rag.common.exception.BusinessException;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;

/**
 * JWT Access Token 签发与解析服务。
 * <p>
 * 使用 HMAC-SHA 签名，密钥从配置读取，最短要求 32 字节。
 */
@Service
public class JwtAccessTokenService {
    // ─────────────────────────────────────────────────────────────────────────────
    // 【骨架占位】本类属于功能模块实现类，业务逻辑已全部剥离，仅保留类名作为架构占位。
    // 类的原有职责见上方 Javadoc；字段、方法与实现细节请依据 docs/ 需求与接口文档重新实现。
    // ─────────────────────────────────────────────────────────────────────────────

    // ─────────────────────────────────────────────────────────────────────────────
    // 【数据契约保留】以下嵌套 record/enum 是该模块对外的数据结构（接口契约的一部分），
    // 作为类型定义原样保留；其填充与消费逻辑已随业务实现一并剥离，待重新实现。
    // ─────────────────────────────────────────────────────────────────────────────

    public record TokenSubject(
            Long userId,
            String userCode,
            String displayName,
            SystemRole systemRole,
            boolean mustChangePassword
    ) {
    }

    public record AccessTokenClaims(
            Long userId,
            String userCode,
            String displayName,
            SystemRole systemRole,
            boolean mustChangePassword,
            Instant issuedAt,
            Instant expiresAt
    ) {
    }
}
