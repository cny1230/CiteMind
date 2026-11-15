package com.citemind.rag.metrics.controller;

import com.citemind.rag.auth.CurrentUserService;
import com.citemind.rag.common.api.ApiResponse;
import com.citemind.rag.common.log.OperationLog;
import com.citemind.rag.metrics.model.enums.StatsPeriod;
import com.citemind.rag.metrics.model.vo.MetricsOverviewVO;
import com.citemind.rag.metrics.model.vo.UsageRankItemVO;
import com.citemind.rag.metrics.model.vo.UsageStatsVO;
import com.citemind.rag.metrics.service.LlmUsageStatisticsService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@OperationLog
@RestController
@RequestMapping("/api/admin/metrics")
public class AdminMetricsController {
    // ─────────────────────────────────────────────────────────────────────────────
    // 【骨架占位】本类属于功能模块实现类，业务逻辑已全部剥离，仅保留类名作为架构占位。
    // 类的原有职责见上方 Javadoc；字段、方法与实现细节请依据 docs/ 需求与接口文档重新实现。
    // ─────────────────────────────────────────────────────────────────────────────
}
