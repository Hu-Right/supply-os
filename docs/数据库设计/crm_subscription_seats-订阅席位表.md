# crm_subscription_seats — 订阅席位表（表结构设计）

> 权威口径以 `src/lib/db/migrations/*` 累计效果 + `src/lib/repos/*` 实际读写为准；发现与代码不符，以代码为准并回写本文档。
> 本文档描述该表**当前设计结构**；已由迁移 092 在本地库实建（阶段一·旁路），生产在部署时由 runner 执行。

---

## 1. 表名与用途

- **表名**：`crm_subscription_seats`
- **引擎/字符集/排序规则**：`InnoDB` / `utf8mb4` / `utf8mb4_0900_ai_ci`
- **表注释（DB 内 `COMMENT` 原文）**：`订阅席位表：记录一条订阅下各席位的使用人，用于多账号团队的成员归属与席位上限校验（成员与主账号走同一门控链）`
- **用途**：团队席位的**成员关系事实**——BUSINESS(3)/ADVISOR(5)/ENTERPRISE(自定义) 档"多账号"的落地点。
  一行 = 某订阅下的一个席位占用人。owner 也占一行（`is_owner=1`），使"席位数=行数"恒成立，计数无特判。
- **关系**：引用 `crm_plan_subscriptions`；`crm_benefit_quotas.seat_user_id` 按成员 id 软关联本表。

## 2. 字段清单

| 字段 | 数据类型 | 可空 | 默认值 | 约束/说明 |
|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | 否 | AUTO_INCREMENT | 主键 |
| `subscription_id` | `BIGINT UNSIGNED` | 否 | — | FK → `crm_plan_subscriptions.id` |
| `member_user_id` | `BIGINT UNSIGNED` | 否 | — | 席位的实际使用账号，关联 `crm_users.id` |
| `is_owner` | `TINYINT(1)` | 否 | `0` | 是否订阅主账号行（每订阅恰一行，服务层事务保证） |
| `status` | `ENUM('active','removed')` | 否 | `'active'` | 席位状态；移除不删行（额度消耗归属需可追溯） |
| `joined_at` | `DATETIME` | 否 | `CURRENT_TIMESTAMP` | 占用席位时间 |
| `removed_at` | `DATETIME` | 是 | NULL | 移出时间（`status='removed'` 时非空，服务层联动） |
| `created_at` | `DATETIME` | 否 | `CURRENT_TIMESTAMP` | 创建时间 |
| `updated_at` | `DATETIME` | 是 | NULL `ON UPDATE CURRENT_TIMESTAMP` | 更新时间 |

**约束**：
- `uk_sub_member`：`UNIQUE (subscription_id, member_user_id)` —— 同一账号在同一订阅内只占一个席位。
- **不建“一人一团队”唯一键**：结构允许一个账号同时出现在多个订阅的席位中（如代理/集团场景）；若产品定稿“一个账号同时只属于一个生效团队”，由服务层校验，不在结构上锁死。
- 席位上限校验：`COUNT(active 行) <= subscription.seat_limit`（`seat_limit=-1` 跳过）——**并发占用**用订阅行 `FOR UPDATE` 串行化，本表不做触发器。

**建表语句**：不在本文档复制，唯一事实源为 [`src/lib/db/migrations/092-benefit-system-tables.ts`](../../src/lib/db/migrations/092-benefit-system-tables.ts) 内对应表的 DDL（含表级 `COMMENT` 与逐列注释）；本文档 §1 的表注释行与库内 `TABLE_COMMENT` 逐字一致，取值域与 CHECK 以 §2 清单为准。

## 3. 字段含义（业务作用）

- **owner 占行**：个人档（seat_limit=1）同样一行一 owner，全体系计数口径统一；不存在"个人档没有席位行"的分叉。
- **`status='removed'` 留行**：席位成员在占用期间的额度消耗（`crm_benefit_quotas` `scope='seat'` 行）需要归属可查，移出只封状态不删数据。
- **成员权益解析**：成员访问时 `member_user_id → 本表 active 行 → subscription → plan_code → 矩阵`，与 owner 走完全同一条门控链，**没有成员专属分支**（避免旧体系"单用户单权益"假设被打破后各处再打补丁）。

## 4. 枚举类型说明：`status`

| 取值 | 业务含义 |
|---|---|
| `active` | 占用席位，可消费订阅权益 |
| `removed` | 已移出，门控判定视同无席位；历史消耗归属仍在本行 |

## 5. 索引与主键

| 索引名 | 列 | 类型 | 设计意图 |
|---|---|---|---|
| `PRIMARY` | `id` | 主键 | 行定位 |
| `uk_sub_member` | `(subscription_id, member_user_id)` | 唯一 | 防重复占席 + "某订阅席位清单"前缀扫描 |
| `idx_member` | `(member_user_id, status)` | 复合 | 成员门控主路径："我属于哪个生效团队" |
| `idx_sub_status` | `(subscription_id, status)` | 复合 | 席位计数 vs `seat_limit` 校验 |

## 6. 结构约定

- 全表 `utf8mb4` / `utf8mb4_0900_ai_ci`；`member_user_id` 与 `crm_users.id` 列类型严格一致。
- 席位管理动作（邀请/移出）属前台成员自助流程；**管理端批量操作不在本项目范围**（项目边界决策：Supply OS 不承载管理员功能）。
- 订阅 `refunded/expired` 时，本表 active 行由服务层同事务置 `removed`（联动口径，不做级联外键删除）。

---

*最后更新：2026-09-22（表名由 `crm_subscription_seats_neo2026` 去掉年份后缀正式化为 `crm_subscription_seats`，补表级 COMMENT 与逐列注释；已本地实建。一期若不启用多账号，本表保持空表不写入）*
