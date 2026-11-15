package com.citemind.rag.group.service;

import com.citemind.rag.auth.CurrentUserService;
import com.citemind.rag.common.enums.GroupJoinRequestStatus;
import com.citemind.rag.common.enums.GroupRole;
import com.citemind.rag.common.exception.BusinessException;
import com.citemind.rag.group.mapper.GroupJoinRequestMapper;
import com.citemind.rag.group.model.dto.CreateJoinRequestRequest;
import com.citemind.rag.group.model.entity.Group;
import com.citemind.rag.group.model.entity.GroupJoinRequest;
import com.citemind.rag.group.model.vo.MyJoinRequestResponse;
import com.citemind.rag.group.model.vo.OwnerJoinRequestResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;

/**
 * 群组加入申请服务，提供申请提交、审批、查询等功能。
 */
@Slf4j
@Service
public class GroupJoinRequestService {
    // ─────────────────────────────────────────────────────────────────────────────
    // 【骨架占位】本类属于功能模块实现类，业务逻辑已全部剥离，仅保留类名作为架构占位。
    // 类的原有职责见上方 Javadoc；字段、方法与实现细节请依据 docs/ 需求与接口文档重新实现。
    // ─────────────────────────────────────────────────────────────────────────────
}
