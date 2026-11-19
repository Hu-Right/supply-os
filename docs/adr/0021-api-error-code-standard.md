# ADR-0021：API 错误码体系规范（RFC 9457 兼容超集 + 稳定字符串错误标识）

- 状态：已接受（2026-11-19）
- 关联：ADR-0012（云库列口径）、ADR-0015（RFQ 重构引入 44xxx 段）
- 涉及仓库：`supply-os`（全量 API 面）

## 1. 背景

存量 111 个 5 位数字错误码（`src/shared/constants/api.ts`）经三轮治本（2026-10-12 Phase A / 10-22 auth 治本 / 10-27 service 治本）后裸数字已清零，但体系仍是按批次打补丁堆叠：

- **同义双码并存**：40000/40022（参数校验）、40006/40404（公告不存在）、40001/40042（未登录）——调用方无所适从；
- **一码两用**：40013（账号异常）被内容锁定场景复用，前端靠 hot-patch（error-map 拦截 detail.coreLocked）纠偏；
- **拼写不一**：`coreLocked`/`core_locked` 两种 extra 拼写并存，前端需同时判两种；
- **HTTP 语义系统性偏离**：401 全站仅 1 个发射点（密码错误被定成 403，为绕开 api-client 对 401 盲触发 token 刷新的客户端缺陷）；
- **三处手工同步**：api.ts 常量 → error-map CODE_MAP → errors.json×7，加码漏一处即静默回落；5 个码无 i18n 覆盖；
- **无稳定字符串错误标识**：数字码历史上多次撞值，前端只能靠数字映射。

## 2. 决策

### 2.1 HTTP 状态码判据表（RFC 9110/7235 口径，全码对照）

| status | 判据 | 本项目应用 |
|---|---|---|
| 400 | 请求无法理解（语法/参数/字段格式） | invalid_params、invalid_code、rfq_reason_required |
| 401 | 认证缺失**或认证失败**（含凭据错误） | auth_required、account_issue（密码错误，403→401 修正）、refresh_token 四态、api_key_invalid/expired、payment_user_plan_required |
| 402 | 需付费 | free_limit_reached、paid_quota_required |
| 403 | 已认证但无权/状态禁止 | access_forbidden、vip_only、out_of_category、content_locked、account_disabled、password_reset_required、rfq_authorization_required、api_key_suspended |
| 404 | 资源不存在 | 全部 *_not_found / _missing（含 chat_session_missing 40057） |
| 409 | 与资源当前状态冲突 | claim 系列、绑定冲突、rfq_state_invalid/version_conflict/publish_blocked、pool_full、keyword_group_duplicate、chat_session_closed、schedule_capacity_exceeded |
| 410 | 永久移除 | endpoint_retired |
| 413 | 体积超限 | proxy_response_too_large |
| 429 | 频率超限 | rate_limited、too_many_attempts、api_quota_exceeded |
| 500 | 未预期服务端错误 | internal_error、payment_qr_code_missing |
| 502 | 上游返回无效 | ai_call_failed、ai_bad_format、sms/email_send_failed |
| 503 | 依赖暂不可用 | translation/payment/training 不可用、sms/email_not_configured |

**401 刷新豁免前置**：account_issue 回归 401 的前提是 api-client 增加 AUTH_ENDPOINTS 豁免清单（login/register/reset-password/bind 等端点的 401 不触发 token 刷新，直接抛出）——修客户端缺陷而不是扭曲状态码。

### 2.2 错误响应契约（RFC 9457 兼容超集）

4xx/5xx 响应统一为：

```json
{
  "code": 40042,
  "message": "请先登录",
  "error": { "type": "auth_required", "code": 40042, "status": 401, "kind": "auth" },
  "detail": { "coreLocked": true }
}
```

- `error.type`（snake_case，与 EC_ 常量名一一对应）是**稳定错误标识主键**：前端/测试/文档以 type 为机器判据，数字码为兼容层不重排；
- `error.kind` 为 11 枚举语义分类（system/network/auth/forbidden/vipGate/industryWall/quota/payment/business/ai/unknown）；
- `detail` 收编全部结构化附加数据（原 extra 顶层展开废弃；camelCase 统一，`core_locked` 蛇形拦截）；
- `message` 仅人读；i18n 由前端按 catalog 的 i18nKey 查 errors.json；
- 2xx 裸载荷不变。

### 2.3 码段规划与取号规则

新增数字码按语义段取号：400xx 参数校验 / 401xx 认证 / 403xx 授权 / 404xx 资源 / 409xx 冲突 / 410xx 配额与废弃 / 411xx 账号联系 / 412xx 内容会话 / 413xx AI / 42xxx 限流 / 44xxx RFQ / 50xxx 服务端。**新码必须先在 catalog（`src/shared/errors/catalog.ts`，单一事实源）登记 {code, type, status, kind, i18nKey} 才允许抛出。**

### 2.4 同义码合并（deprecated 机制）

| deprecated 码 | 指向 | 理由 |
|---|---|---|
| invalid_request 40022 | invalid_params 40000 | 同义，取覆盖面大的 |
| user_required 40001 | auth_required 40042 | 同义，取语义正确的 |
| notice_not_found 40006 | notice_not_found 40404 | 同义，归 404 语义段 |

旧码保留常量导出 + catalog `deprecatedAliasOf` 指向，CI 拦截新调用；存量响应的旧码由前端双登记兼容。

### 2.5 40013 双用拆解

`account_issue`(40013) 回归本义（凭据错误，401）；「内容已锁定」场景全部改用 `content_locked`(41201, 403)；error-map 的 detail.coreLocked hot-patch 随之删除。

## 3. 门禁

`scripts/gates/check-error-codes.mjs`（lint/CI）：裸数字错误码拦截、EC_ 必须登记 catalog、catalog↔error-map↔errors.json 三处一致、status 与判据表一致、蛇形 `core_locked` 拦截。

## 4. 后果

- 前端/存量测试对 `code/message` 的读取零破坏（兼容超集）；
- 新错误接入从「改 4 处」收敛为「catalog 登记一处 + 消费端按需」；
- 数字码撞值风险被 type 主键兜底（type 冲突由 catalog 单测拦截）。
