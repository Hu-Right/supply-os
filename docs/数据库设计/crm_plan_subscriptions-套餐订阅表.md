# crm_plan_subscriptions — 套餐订阅表（表结构设计）

> 权威口径以 `src/lib/db/migrations/*` 累计效果 + `src/lib/repos/*` 实际读写为准；发现与代码不符，以代码为准并回写本文档。
> 本文档描述该表**当前设计结构**；已由迁移 092 在本地库实建（阶段一·旁路），生产在部署时由 runner 执行。

---

## 1. 表名与用途

- **表名**：`crm_plan_subscriptions`
- **引擎/字符集/排序规则**：`InnoDB` / `utf8mb4` / `utf8mb4_0900_ai_ci`
- **表注释（DB 内 `COMMENT` 原文）**：`套餐订阅表：记录用户对套餐的每一次购买事实（归属人、成交订单号、实付与席位快照、有效期与状态、升级链）`
- **用途**：用户对六档主套餐的**一次购买事实**（订阅行）。权益内容不落本表——本表只回答"谁、买了哪档、按什么价、有效期多长、几个席位"，
  权益值一律按 `plan_code` 回查矩阵。
- **关系**：引用 `crm_plan_catalog`；被 `crm_benefit_quotas`（额度）、`crm_subscription_seats`（席位）引用。

## 2. 字段清单

| 字段 | 数据类型 | 可空 | 默认值 | 约束/说明 |
|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | 否 | AUTO_INCREMENT | 主键 |
| `owner_user_id` | `BIGINT UNSIGNED` | 否 | — | 订阅归属人（企业档=主账号），关联 `crm_users.id`；不设 NULL（旧表 `user_id NULL + user_key` 双轨制废除） |
| `plan_code` | `VARCHAR(64)` | 否 | — | FK → `crm_plan_catalog.plan_code`（版本化套餐行，码即口径） |
| `source_order_no` | `VARCHAR(80)` | 否 | — | 成交订单号，**非空硬约束**（旧体系退款靠启发式回退的 P1 遗留不再复现；对账唯一锚点） |
| `price_paid` | `DECIMAL(10,2)` | 否 | — | 实付金额快照（升级差价场景 ≠ 套餐标价） |
| `currency` | `VARCHAR(10)` | 否 | `'CNY'` | 币种快照 |
| `seat_limit` | `INT` | 否 | `1` | 本单席位上限快照（购买时从套餐复制；`-1`=合同自定义，实际数以席位表为准） |
| `status` | `ENUM('active','expired','cancelled','refunded')` | 否 | `'active'` | 订阅状态 |
| `started_at` | `DATETIME` | 否 | `CURRENT_TIMESTAMP` | 生效时间 |
| `expires_at` | `DATETIME` | 是 | NULL | 到期时间；NULL=永久（仅结构预留，六档均年付） |
| `replaced_by_id` | `BIGINT UNSIGNED` | 是 | NULL | 升级链：本单被哪一单替代（旧表 `is_upgraded` 布尔位升级为可追溯指针） |
| `created_at` | `DATETIME` | 否 | `CURRENT_TIMESTAMP` | 创建时间 |
| `updated_at` | `DATETIME` | 是 | NULL `ON UPDATE CURRENT_TIMESTAMP` | 更新时间 |

**约束**：
- `chk_validity`：`expires_at IS NULL OR expires_at > started_at`。
- 服务层唯一性纪律：**同一 `owner_user_id` 同一时刻至多一条 `status='active'`**（升级=旧单置 replaced 链 + 新单生效，同事务完成）；不开 DB 唯一索引（历史行 status 可变，用事务内 `SELECT … FOR UPDATE` 保证）。
- **free 行不可订阅**：`plan_code='free'`（普通用户权益档）禁止建订阅行——无成交就无 `source_order_no`，本表天然容不下它；普通用户的权益解析走 `requires_subscription=0` + 矩阵 free 列（见权益目录表文档）。

**建表语句**：不在本文档复制，唯一事实源为 [`src/lib/db/migrations/092-benefit-system-tables.ts`](../../src/lib/db/migrations/092-benefit-system-tables.ts) 内对应表的 DDL（含表级 `COMMENT` 与逐列注释）；本文档 §1 的表注释行与库内 `TABLE_COMMENT` 逐字一致，取值域与 CHECK 以 §2 清单为准。

## 3. 字段含义（业务作用）

- **`owner_user_id` 非空单轨**：身份解析在写入前完成，本表不承载"匿名订阅"——旧表 `user_key VARCHAR(190)` 兜底轨废除。
- **`source_order_no NOT NULL`**：每笔订阅必须可回溯到订单；商务渠道成交（contact 档）也必须先建合同订单再开订阅，不允许“后台直接送一条订阅”造成无源权益。
- **`price_paid` 快照**：升级补差（补 ¥36,800-¥8,800 之类）场景下实付≠标价，本列是财务口径；套餐价演变不影响历史行。
- **`seat_limit` 快照**：套餐后续调席位不追溯已成交订阅；席位表行数校验以本快照为准，而非实时读套餐。
- **`replaced_by_id`**：升级替代从布尔位变成**外键指针**——哪一单承接了本单权益可 JOIN 直查，额度结转（如有）沿指针核对。

## 4. 枚举类型说明：`status`

| 取值 | 业务含义 | 进入条件 |
|---|---|---|
| `active` | 生效中，权益门控唯一认可的状态 | 支付成功建单 |
| `expired` | 到期自然终止 | 定时任务/惰性判定置位 |
| `cancelled` | 未成交前人工取消 | 商务/客服流程 |
| `refunded` | 已退款终止 | 订单退款联动，额度同步冻结 |

## 5. 索引与主键

| 索引名 | 列 | 类型 | 设计意图 |
|---|---|---|---|
| `PRIMARY` | `id` | 主键 | 额度/席位表按 `subscription_id` 引用 |
| `idx_owner_status` | `(owner_user_id, status, expires_at)` | 复合 | "当前有效订阅"点查（门控主路径） |
| `idx_plan` | `plan_code` | 普通 | 档位人数统计、矩阵回查 |
| `idx_source_order` | `source_order_no` | 普通 | 订单反查订阅 |

## 6. 结构约定

- 全表 `utf8mb4` / `utf8mb4_0900_ai_ci`；`owner_user_id` 与 `crm_users.id` 列类型严格一致。
- 本表**只 INSERT + 状态列 UPDATE**，业务列（价/席位/档）永不原地改；改配=退旧单建新单沿 `replaced_by_id` 链。
- 结构变更走影子表蓝绿（ADR 0003）。

---

*最后更新：2026-09-22（表名由 `crm_subscriptions_neo2026` 正式化为 `crm_plan_subscriptions`，文档标题同步为「套餐订阅表」，补表级 COMMENT 与逐列注释；已本地实建并验证 source_order_no 非空硬约束）*
