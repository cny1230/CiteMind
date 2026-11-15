@echo off
REM ════════════════════════════════════════════════════════════════
REM CiteMind 一键启动（本地联调）：中间件 + 后端 + 前端
REM ────────────────────────────────────────────────────────────────
REM 用法：双击本文件，或在任意终端执行。三个组件各占一个独立窗口，
REM       关闭对应窗口即停止该组件。
REM 说明：数据库只需首次执行 sql/schema.sql 建表（已完成则跳过），
REM       容器配置了 restart: unless-stopped，Docker Desktop 在线时自动拉起。
REM ════════════════════════════════════════════════════════════════
setlocal
set "ROOT=%~dp0"

REM 本机未配置 JAVA_HOME 时兜底为 JDK 21（按需修改为自己的路径）
if "%JAVA_HOME%"=="" set "JAVA_HOME=C:\Users\chen\.jdks\jdk21.0.13_0"

echo [1/3] 启动中间件（PostgreSQL；ES/MinIO 需要时执行 docker compose up -d 不带服务名）...
start "CiteMind-Middleware" /D "%ROOT%deploy" cmd /k "docker compose up -d postgres"

echo [2/3] 启动后端（Spring Boot :10001，接口文档 /doc.html）...
start "CiteMind-Backend" /D "%ROOT%CiteMind-backend" cmd /k "mvnw.cmd spring-boot:run"

echo [3/3] 启动前端（Vite :5173，VITE_USE_MOCK=false 联调模式）...
start "CiteMind-Frontend" /D "%ROOT%CiteMind-frontend" cmd /k "npm run dev"

echo.
echo 全部窗口已拉起：
echo   中间件  : PostgreSQL localhost:5432   （健康检查随容器自动进行）
echo   后端    : http://localhost:10001     （接口文档 /doc.html）
echo   前端    : http://localhost:5173      （登录页将走真实后端）
echo.
echo 提示：首次联调请确认 CiteMind-frontend\.env 中 VITE_USE_MOCK=false
endlocal
