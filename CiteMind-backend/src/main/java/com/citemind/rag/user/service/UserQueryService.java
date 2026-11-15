package com.citemind.rag.user.service;

import com.citemind.rag.common.exception.BusinessException;
import com.citemind.rag.user.mapper.UserMapper;
import com.citemind.rag.user.model.entity.User;
import com.citemind.rag.user.model.vo.AdminUserItemResponse;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 用户查询服务，提供对 users 表的通用查询。
 */
@Service
public class UserQueryService {
    // ─────────────────────────────────────────────────────────────────────────────
    // 【骨架占位】本类属于功能模块实现类，业务逻辑已全部剥离，仅保留类名作为架构占位。
    // 类的原有职责见上方 Javadoc；字段、方法与实现细节请依据 docs/ 需求与接口文档重新实现。
    // ─────────────────────────────────────────────────────────────────────────────

    // ─────────────────────────────────────────────────────────────────────────────
    // 【数据契约保留】以下嵌套 record/enum 是该模块对外的数据结构（接口契约的一部分），
    // 作为类型定义原样保留；其填充与消费逻辑已随业务实现一并剥离，待重新实现。
    // ─────────────────────────────────────────────────────────────────────────────

    public record UserRecord(
            Long userId,
            String userCode,
            String displayName,
            com.citemind.rag.common.enums.SystemRole systemRole,
            com.citemind.rag.common.enums.UserStatus status,
            boolean mustChangePassword
    ) {}
}
