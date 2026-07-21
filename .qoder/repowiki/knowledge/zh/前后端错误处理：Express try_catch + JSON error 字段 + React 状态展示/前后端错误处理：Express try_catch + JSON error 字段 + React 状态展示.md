---
kind: error_handling
name: 前后端错误处理：Express try/catch + JSON error 字段 + React 状态展示
category: error_handling
scope:
    - '**'
source_files:
    - server.ts
    - src/App.tsx
    - src/payment/PaymentService.ts
---

## 1. 整体方案概述

本仓库采用“前端 try/catch + 后端 Express try/catch”的轻量级错误处理模式，没有引入统一异常类、中间件或全局错误处理器。错误信息通过 HTTP 响应体中的 `error` 字符串字段向前端传递，再由 React 组件用本地 state 渲染到 UI。

- 后端：每个路由 handler 包裹 `try { ... } catch (err: any) { res.status(500).json({ error: err.message }) }`，参数校验失败直接返回 4xx + `{ error }`。
- 前端：对 `fetch` 调用使用 `try/catch`，将 `data.error` 或捕获到的 `Error.message` 写入 `authError` / `claimMessage` 等状态变量，在表单下方以文本形式展示。
- 支付模块：`PaymentService.getStrategy` 在找不到策略时抛出 `new Error(...)`，由上层 API handler 的 try/catch 转为 400/500 JSON 错误。

## 2. 关键文件与位置

- **server.ts**（Express 单进程入口）
  - 所有业务路由均使用 `try/catch` 包裹，未定义统一的错误中间件。
  - 参数校验失败直接 `res.status(400).json({ error: "..." })`；数据库/第三方调用异常统一走 `catch` 返回 500。
  - 认证相关：`/api/auth/login` 返回 401（账号密码错误）、403（账号停用）。
  - 权限/配额：`/api/notices/:id/unlock`、`/api/opportunities/:id/unlock` 返回 402（免费额度用完、付费额度不足）。
  - 支付回调 `/api/payment/notify/*` 内部 `catch` 仅记录日志并返回 `fail`，不抛错。
- **src/App.tsx**（React 主应用）
  - 登录/注册流程：`submitAuth` 中 `if (!res.ok) throw new Error(data.error || "...")`，再在 `catch(err: any)` 中设置 `setAuthError(err.message)`。
  - 供应商绑定申请：`submitSupplierClaim` 类似模式，错误写入 `claimMessage`。
  - 表单提交（展厅、供应商、咨询）：`try/catch` 后 `console.error(e)`，无用户可见错误提示。
  - AI 匹配：失败时回退为中文友好文案，而非透传原始错误。
- **src/payment/PaymentService.ts**
  - `getStrategy` 找不到 provider 时 `throw new Error("Unsupported payment provider: ${provider}")`。
  - `createOrder` 中对套餐不存在、金额为 0 等情况直接 `throw new Error("...")`，由 server.ts 的 `/api/payment/orders` 的 try/catch 转为 400 JSON。
  - `handleNotify` 验签失败返回 `{ success: false, message }`，由调用方决定 HTTP 状态码。

## 3. 架构与约定

| 层面 | 约定 | 证据 |
|------|------|------|
| 错误对象 | 使用原生 `Error` 实例，message 作为人类可读消息 | `PaymentService.getStrategy`、`createOrder` 多处 `throw new Error(...)` |
| 服务端传播 | 每个 handler 独立 try/catch，统一返回 `{ error: string }` JSON | server.ts 各路由 catch 块一致模式 |
| HTTP 状态码 | 400 参数错误、401 认证失败、402 配额不足、403 账号禁用、404 资源不存在、500 服务器异常 | login、unlock、user 查询等路由 |
| 前端消费 | `res.ok` 判断 + `data.error` 取错，再 `throw new Error(...)` 让外层 catch 拿到 message | App.tsx 登录、绑定申请逻辑 |
| 可观测性 | 部分路径 `console.warn` / `console.error` 打印错误，但无结构化日志框架 | BridgeSync 跳过记录、AI fallback 警告 |
| 幂等与补偿 | 支付回调 catch 仅返回 fail/success 文本，不重试；订单状态以 DB 为准 | `/api/payment/notify/alipay`、`/api/payment/notify/wechat` |

## 4. 开发者应遵循的规则

1. **新增路由一律包裹 try/catch**  
   参考现有 handler 风格：参数校验失败立即 `return res.status(400).json({ error: "..." })`；其他异常在 catch 中 `res.status(500).json({ error: err.message })`。

2. **业务错误优先返回具体语义化错误码**  
   如 `USER_REQUIRED`、`PLAN_NOT_FOUND`、`FREE_LIMIT_REACHED`、`NOTICE_LOCKED` 等，便于前端按码分支处理。

3. **不要吞掉错误**  
   避免空 `catch {}` 或仅 `console.error` 而不返回响应；至少返回 500 + `{ error }`，确保前端能感知失败。

4. **第三方调用失败要有降级**  
   参考 AI matchmake 的 Gemini 调用：API key 缺失或调用失败时回退到本地模板，保证接口始终成功返回。

5. **支付回调必须幂等且健壮**  
   验签失败、订单不存在等场景返回明确的 `success: false` 及原因，不抛未捕获异常。

6. **前端统一错误展示**  
   建议将 `authError` / `claimMessage` 的模式抽象为通用 toast 或 Alert 组件，避免散落各处。

7. **避免向客户端泄露堆栈**  
   当前 catch 块直接透传 `err.message`，若包含敏感信息需过滤；生产环境建议只返回固定错误码，详细日志落盘。
