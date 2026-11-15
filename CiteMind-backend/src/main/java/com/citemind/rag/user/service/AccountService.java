package com.citemind.rag.user.service;

import com.citemind.rag.auth.CurrentUserService;
import com.citemind.rag.auth.security.RefreshTokenService;
import com.citemind.rag.auth.service.PasswordHasher;
import com.citemind.rag.auth.service.PasswordPolicyValidator;
import com.citemind.rag.common.exception.BusinessException;
import com.citemind.rag.user.mapper.UserMapper;
import com.citemind.rag.user.model.dto.ChangePasswordRequest;
import com.citemind.rag.user.model.entity.User;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 个人账户服务，处理修改密码等。
 */
@Slf4j
@Service
public class AccountService {
    // ─────────────────────────────────────────────────────────────────────────────
    // 【骨架占位】本类属于功能模块实现类，业务逻辑已全部剥离，仅保留类名作为架构占位。
    // 类的原有职责见上方 Javadoc；字段、方法与实现细节请依据 docs/ 需求与接口文档重新实现。
    // ─────────────────────────────────────────────────────────────────────────────
}
