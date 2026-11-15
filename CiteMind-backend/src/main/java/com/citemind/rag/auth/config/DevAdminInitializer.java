package com.citemind.rag.auth.config;

import com.citemind.rag.auth.service.PasswordHasher;
import com.citemind.rag.common.enums.SystemRole;
import com.citemind.rag.common.enums.UserStatus;
import com.citemind.rag.user.mapper.UserMapper;
import com.citemind.rag.user.model.entity.User;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 仅在 dev 环境确保一个可预测的管理员账号存在，避免本地调试还要额外手工开户。
 * <p>
 * 通过 {@code citemind.rag.dev-admin.*} 配置项自定义账号信息。
 */
@Slf4j
@Component
@Profile("dev")
public class DevAdminInitializer {
    // ─────────────────────────────────────────────────────────────────────────────
    // 【骨架占位】本类属于功能模块实现类，业务逻辑已全部剥离，仅保留类名作为架构占位。
    // 类的原有职责见上方 Javadoc；字段、方法与实现细节请依据 docs/ 需求与接口文档重新实现。
    // ─────────────────────────────────────────────────────────────────────────────
}
