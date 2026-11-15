package com.citemind.rag.auth.service;

import com.citemind.rag.common.exception.BusinessException;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;

/**
 * 密码策略校验：最小长度、字母+数字组合、BCrypt 字节上限。
 * <p>
 * 供 {@link AuthService} 注册和 {@link AccountService} 修改密码共用。
 */
@Component
public class PasswordPolicyValidator {
    // ─────────────────────────────────────────────────────────────────────────────
    // 【骨架占位】本类属于功能模块实现类，业务逻辑已全部剥离，仅保留类名作为架构占位。
    // 类的原有职责见上方 Javadoc；字段、方法与实现细节请依据 docs/ 需求与接口文档重新实现。
    // ─────────────────────────────────────────────────────────────────────────────
}
