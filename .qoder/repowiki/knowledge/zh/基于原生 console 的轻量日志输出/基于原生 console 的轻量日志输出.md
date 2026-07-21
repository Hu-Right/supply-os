---
kind: logging_system
name: 基于原生 console 的轻量日志输出
category: logging_system
scope:
    - '**'
source_files:
    - server.ts
    - src/App.tsx
    - src/main.tsx
    - src/PaymentModal.tsx
    - src/payment/MockProvider.ts
---

本仓库未引入任何第三方日志框架（如 pino、winston、morgan、debug 等），也未在 `package.json` 中声明相关依赖。后端 Express 服务与前端 React 应用均直接使用 Node/浏览器原生的 `console.log` / `console.warn` / `console.error` 进行日志输出，属于最轻量的内建日志方式。

**使用现状**
- 后端 (`server.ts`)：以 `[模块名]` 前缀区分上下文，例如 `[BridgeSync]`、`[Alipay Notify Error]`、`[Wechat Notify Error]`、`[Download]`；按语义选择 `log`/`warn`/`error` 级别。
- 前端 (`src/App.tsx`、`src/main.tsx`、`src/PaymentModal.tsx`、`src/payment/MockProvider.ts`)：同样使用 `console.error` 打印错误堆栈或业务异常，部分 mock 逻辑用 `console.log` 记录流程。

**架构与约定**
- 无集中式 logger 初始化文件，无日志级别配置开关，无结构化字段（JSON）输出。
- 日志仅输出到标准输出（stdout/stderr），由运行环境（Node 进程、容器 stdout）负责收集与落盘。
- 没有统一的错误捕获中间件将异常统一写入日志，错误散落在各 try/catch 块中直接 `console.error`。

**开发者应遵循的规则**
1. 如需新增日志，继续使用 `console.log/warn/error`，并沿用 `[模块名]` 前缀保持可读性。
2. 避免在生产环境保留大量 `console.log` 调试信息，必要时通过环境变量控制输出。
3. 由于缺乏结构化日志能力，当前方案不适合需要集中采集、检索、告警的生产级场景；若后续需要，可考虑引入 `pino` 或 `winston` 并抽取为共享 logger 模块。