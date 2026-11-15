# CLAUDE.md

本文件为 Claude Code 在本仓库工作时提供上下文指引，内容与 [AGENTS.md](AGENTS.md) 保持一致。

## 仓库形态（务必先读）

本仓库是 **「界面可运行 + 后端留骨架」** 的工程：

- **后端**：Controller/Service 等实现类只保留类名与 Javadoc（带「骨架占位」注释），业务实现已剥离；
  实体/DTO/VO/枚举/接口/Mapper/XML/Prompt/DDL 完整保留 —— 它们是可编译的契约层。
  在骨架类中补全实现时，**不要**删除数据契约类，**不要**改动包名 `com.citemind.rag`。
- **前端**：完整实现 + 内置 Mock（`src/mock/`）。新增/修改接口时，必须同步更新 Mock 路由表，
  保持 `VITE_USE_MOCK=true/false` 两种模式行为一致。

## 常用命令

```bash
# 后端（需要 JDK 21）
cd CiteMind-backend
./mvnw clean compile          # 编译（209 个源文件应 BUILD SUCCESS）
./mvnw spring-boot:run        # 启动（local profile，零中间件可启动，端口 10001）

# 前端
cd CiteMind-frontend
npm install
npm run dev                   # 演示模式（Mock 默认开启），http://localhost:5173
npm run type-check            # vue-tsc 类型检查（提交前必须通过）
```

## 关键约定

- **响应结构**：所有 Controller 返回 `ApiResponse<T>`（success/data/message）；例外清单见 docs/02-接口文档.md §0.3。
- **数据访问**：MyBatis-Plus `BaseMapper` + `LambdaQueryWrapper`；复杂 SQL（含 FOR UPDATE）放
  `src/main/resources/mappers/**/*.xml`；枚举按 name() 字符串存储。
- **错误语义**：BusinessException → HTTP 200 + success=false；Forbidden/Unauthorized → 403/401；
  不要用 4xx 表达纯业务校验失败。
- **权限**：群组是数据隔离边界；跨群组访问必须在服务层校验成员关系。
- **文档同步**：改接口 → 先更新 docs/02-接口文档.md 与 docs/04-前后端联调规范.md，再动代码（契约先行）。
- **敏感信息**：密钥只进 `.env`（已 gitignore）；`application-local.yml` 与 `deploy/*.env.example` 只放占位值。

## 项目文档索引

- docs/01-需求规格说明书.md（需求 + 人天估算）
- docs/02-接口文档.md（47 个接口）
- docs/03-数据库设计文档.md（18 张表）
- docs/04-前后端联调规范.md（契约/认证/SSE/Mock 切换/联调 DoD）
