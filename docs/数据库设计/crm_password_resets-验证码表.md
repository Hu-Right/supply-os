# crm_password_resets — 验证码表（表结构设计）

> 权威口径以 `src/lib/db/migrations/*` 的累计效果 + `src/lib/repos/*` 的实际读写为准；发现与代码不符，以代码为准并回写本文档。
> 本文档描述该表**当前结构**。

---

## 1. 表名与用途

- **表名**：`crm_password_resets`
- **引擎/字符集/排序规则**：`InnoDB` / `utf8mb4` / `utf8mb4_0900_ai_ci`
- **核心业务场景**：承载**所有"一次性验证码"的生命周期**——创建、查询、核销、失败重试计数。实际是**多态验证码表**，通过 `code_type` 区分场景，覆盖：
  - 手机号注册（`registration`）
  - 找回密码（手机 `phone_reset` / 邮箱 `email_reset`）
  - 手机号绑定/换绑/解绑（`phone_bind` / `phone_rebind` / `phone_unbind`）
  - 邮箱绑定/解绑（`email_bind` / `email_unbind`）
- **安全约定**：`code` 列存储的是验证码的 **SHA-256 哈希**（`hashVerificationCode`，加盐前缀 `verify_code:`），**绝不存明文**；明文仅用于发送短信/邮件。
- **生命周期**：验证码短生命周期（有效期由 `VERIFICATION_CODE_EXPIRES_MS` 控制，约 10 分钟），过期行由清理逻辑处理。

## 2. 字段清单

| 字段 | 数据类型 | 可空 | 默认值 | 约束/说明 |
|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | 否 | AUTO_INCREMENT | 主键 |
| `user_id` | `BIGINT UNSIGNED` | 是 | NULL | 关联 `crm_users.id`；注册场景建号后回填 |
| `phone` | `VARCHAR(20)` | 是 | NULL | 手机号（手机类场景的投递目标兼查询锚点） |
| `code` | `VARCHAR(128)` | 否 | — | 验证码 **SHA-256 哈希**（不存明文） |
| `code_type` | `VARCHAR(20)` | 否 | —（无默认，必须显式传入） | 场景区分枚举（见第 4 节） |
| `expires_at` | `DATETIME` | 否 | — | 过期时间点 |
| `used` | `TINYINT(1)` | 否 | `0` | 是否已核销：0=未用，1=已用 |
| `attempts` | `INT` | 否 | `0` | 验证失败尝试次数（达上限由服务层拒绝） |
| `ip` | `VARCHAR(45)` | 是 | NULL | 发码请求 IP（审计留痕，兼容 IPv6 长度） |
| `email_sent` | `TINYINT(1)` | 否 | `0` | 邮件发送是否成功（诊断埋点） |
| `email_error` | `VARCHAR(500)` | 是 | NULL | 邮件发送失败原因（诊断埋点） |
| `sms_sent` | `TINYINT(1)` | 否 | `0` | 短信发送是否成功（诊断埋点） |
| `sms_error` | `VARCHAR(500)` | 是 | NULL | 短信发送失败原因（诊断埋点） |
| `created_at` | `DATETIME` | 否 | `CURRENT_TIMESTAMP` | 创建时间（取"最新有效码"时用于排序） |

## 3. 字段含义（业务作用）

- **`id`**：验证码行主键；核销/累加尝试/回填 user_id 均按 `id` 定位。
- **`user_id`**：账号维度的归属锚点。登录态场景（找回密码、绑定/换绑）发码时已知用户，直接写入；**注册场景发码时账号尚不存在**，`user_id` 先留 NULL，注册成功后由 `auth-register` 回填，建立"码 ↔ 账号"审计关联。
- **`phone`**：手机类场景的**投递目标兼查询锚点**（注册、手机找回、手机绑定）。服务层按 `phone + code_type` 查最新有效码。
- **`code`**：验证码哈希，核销时与用户输入重新计算比对；不存明文。
- **`code_type`**：区分同一联系方式下的不同业务场景，避免跨场景串用验证码（枚举见第 4 节）。
- **`expires_at`**：过期时间；查询条件恒含 `expires_at > NOW()`。
- **`used`**：一次性标记；核销置 1，查询恒含 `used = 0`。发新码前会作废旧码（`invalidateUnusedCodes`）。
- **`attempts`**：防暴力猜测；每次比对失败 `+1`，注册场景达 5 次即拒绝并要求重新获取。
- **`ip`**：发码来源 IP，安全审计留痕。
- **`email_sent` / `email_error` / `sms_sent` / `sms_error`**：投递结果诊断埋点，由 `markEmailSent` / `markSmsSent` 写入；接口返回的 `email_sent` / `sms_sent` 是请求内内存计算值。
- **`created_at`**：配合 `ORDER BY created_at DESC LIMIT 1` 取"最新一条有效码"。

## 4. 枚举类型说明：`code_type`

`code_type` 为 `VARCHAR(20)`，取值由业务代码约定（非数据库 ENUM 类型）。完整取值：

| 取值 | 业务含义 | 触发来源 | 渠道 |
|---|---|---|---|
| `registration` | 账号注册验证码 | `send-register-sms-code` | 手机 |
| `phone_reset` | 手机找回密码 | `forgot-password`（短信）；`send-phone-code` scene=`reset` | 手机 |
| `email_reset` | 邮箱找回密码 | `forgot-password`（邮件） | 邮箱 |
| `phone_bind` | 绑定手机号 | `send-phone-code` scene=`bind` | 手机 |
| `phone_rebind` | 换绑手机号 | `send-phone-code` scene=`rebind` | 手机 |
| `phone_unbind` | 解绑手机号 | `send-phone-code` scene=`unbind` | 手机 |
| `email_bind` | 绑定邮箱 | `send-email-code` scene=`bind`（`bind-email` 核销） | 邮箱 |
| `email_unbind` | 解绑邮箱 | `send-email-code` scene=`unbind` | 邮箱 |

> 命名规律：手机类为 `phone_<scene>`（scene ∈ bind/rebind/unbind/reset），邮箱类为 `email_<scene>`（scene ∈ bind/unbind），注册为 `registration`。
> `code_type` 无列默认值，所有写入方（`createResetCode`）必须显式传入上表之一；历史遗留的 `password_reset` 枚举值已废弃，不再作为取值或默认值。

## 5. 索引与主键

| 索引名 | 列 | 类型 | 设计意图 |
|---|---|---|---|
| `PRIMARY` | `id` | 主键 | 行定位（核销/累加/回填） |
| `idx_user_id` | `user_id` | 普通 | 登录态场景按 user_id 查询/失效 |
| `idx_code_type_lookup` | `(user_id, code_type, used, expires_at, created_at)` | 复合 | 登录态按 `user_id + code_type` 过滤并排序取最新有效码 |
| `idx_phone_lookup` | `(phone, code_type, used, expires_at, created_at)` | 复合 | 注册/手机类按 `phone + code_type` 过滤并排序取最新有效码 |

> 查询恒含 `used = 0 AND expires_at > NOW()`，并按 `created_at DESC LIMIT 1` 取最新码，故上述复合索引覆盖两类主查询锚点（`user_id` 与 `phone`）。

## 6. 结构约定

- 全表统一 `utf8mb4` / `utf8mb4_0900_ai_ci`，与 `crm_users` 等 JOIN 表口径一致，避免 `Illegal mix of collations`。
- 建表/变更遵循 `docs/数据库设计/数据库字符集与排序规则统一规范.md`；结构变更走 `docs/adr/0003-shadow-table-blue-green-migration.md` 的影子表蓝绿切换（两阶段·人工闸口）。

---

*最后更新：2026-09-22（按当前精简结构整理：14 列、无 `user_key`；索引以 `user_id`/`phone` 双锚点重建；`code_type` 去除历史遗留默认值 `password_reset`，存量脏数据已清洗为 `registration`）*
