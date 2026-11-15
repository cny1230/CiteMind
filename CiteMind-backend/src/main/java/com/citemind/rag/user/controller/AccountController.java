package com.citemind.rag.user.controller;

import com.citemind.rag.auth.CurrentUserService;
import com.citemind.rag.common.api.ApiResponse;
import com.citemind.rag.common.log.OperationLog;
import com.citemind.rag.user.model.dto.ChangePasswordRequest;
import com.citemind.rag.user.service.AccountService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 个人账户控制器，提供修改密码等接口。
 */
@OperationLog
@RestController
@RequestMapping("/api/account")
public class AccountController {
    // ─────────────────────────────────────────────────────────────────────────────
    // 【骨架占位】本类属于功能模块实现类，业务逻辑已全部剥离，仅保留类名作为架构占位。
    // 类的原有职责见上方 Javadoc；字段、方法与实现细节请依据 docs/ 需求与接口文档重新实现。
    // ─────────────────────────────────────────────────────────────────────────────
}
