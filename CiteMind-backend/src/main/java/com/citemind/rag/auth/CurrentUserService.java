package com.citemind.rag.auth;

import com.citemind.rag.common.security.AuthenticatedUser;
import com.citemind.rag.common.security.UserContext;
import com.citemind.rag.common.enums.SystemRole;
import com.citemind.rag.common.enums.UserStatus;
import com.citemind.rag.common.exception.BusinessException;
import com.citemind.rag.common.exception.ForbiddenException;
import com.citemind.rag.common.exception.UnauthorizedException;
import com.citemind.rag.user.service.UserQueryService;
import org.springframework.stereotype.Service;

/**
 * 当前用户服务，通过 {@link UserContext} 获取当前请求用户。
 * <p>
 * 依赖 JwtAuthenticationFilter 在请求进入时设置 {@link UserContext}。
 */
@Service
public class CurrentUserService {
    // ─────────────────────────────────────────────────────────────────────────────
    // 【骨架占位】本类属于功能模块实现类，业务逻辑已全部剥离，仅保留类名作为架构占位。
    // 类的原有职责见上方 Javadoc；字段、方法与实现细节请依据 docs/ 需求与接口文档重新实现。
    // ─────────────────────────────────────────────────────────────────────────────

    // ─────────────────────────────────────────────────────────────────────────────
    // 【数据契约保留】以下嵌套 record/enum 是该模块对外的数据结构（接口契约的一部分），
    // 作为类型定义原样保留；其填充与消费逻辑已随业务实现一并剥离，待重新实现。
    // ─────────────────────────────────────────────────────────────────────────────

    public record CurrentUser(
            Long userId,
            String userCode,
            String displayName,
            SystemRole systemRole,
            boolean mustChangePassword
    ) {
        public CurrentUser(Long userId, String userCode, String displayName) {
            this(userId, userCode, displayName, SystemRole.USER, false);
        }
    }
}
