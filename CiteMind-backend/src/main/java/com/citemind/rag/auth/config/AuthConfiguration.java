package com.citemind.rag.auth.config;

import com.citemind.rag.common.exception.BusinessException;
import com.citemind.rag.auth.service.PasswordHasher;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.nio.charset.StandardCharsets;
import java.time.Clock;

/**
 * 认证模块配置，注册 PasswordHasher 和 Clock Bean。
 */
@Configuration
@EnableConfigurationProperties(AuthProperties.class)
public class AuthConfiguration {
    // ─────────────────────────────────────────────────────────────────────────────
    // 【骨架占位】本类属于功能模块实现类，业务逻辑已全部剥离，仅保留类名作为架构占位。
    // 类的原有职责见上方 Javadoc；字段、方法与实现细节请依据 docs/ 需求与接口文档重新实现。
    // ─────────────────────────────────────────────────────────────────────────────
}
