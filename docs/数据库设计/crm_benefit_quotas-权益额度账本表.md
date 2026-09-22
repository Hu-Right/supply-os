# crm_benefit_quotas — 权益额度账本表（表结构设计）

> 权威口径以 `src/lib/db/migrations/*` 累计效果 + `src/lib/repos/*` 实际读写为准；发现与代码不符，以代码为准并回写本文档。
> 本文档描述该表**当前设计结构**；已由迁移 092 在本地库实建（阶段一·旁路），生产在部署时由 runner 执行。

---

## 1. 表名与用途

- **表名**：`crm_benefit_quotas`
- **引擎/字符集/排序规则**：`InnoDB` / `utf8mb4` / `utf8mb4_0900_ai_ci`
- **表注释（DB 内 `COMMENT` 原文）**：`权益额度账本表：按（订阅 × 用户 × 权益 × 周期）记录可消耗额度的总量与已用量，是全库唯一的额度扣减落点`
- **用途**：一切**可消耗计量权益**的余额账本——标讯查看条数、AI 单标解析配额、专家咨询次数、技术支持次数等。
  取代旧体系 `crm_user_entitlements`（单一 unlock 额度）的职能并泛化到**多权益计量**；
  消耗路径收敛为本表唯一记账口径（延续 unlock-quota 单口径纪律：禁止任何旁路手写扣减 SQL）。
- **关系**：挂在订阅（可再精确到席位）之下；`benefit_code` 仅允许权益目录中 `is_consumable=1` 的权益。

## 2. 字段清单

| 字段 | 数据类型 | 可空 | 默认值 | 约束/说明 |
|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | 否 | AUTO_INCREMENT | 主键 |
| `subscription_id` | `BIGINT UNSIGNED` | 是 | NULL | FK → `crm_plan_subscriptions.id`（额度随订阅生灭）；**NULL=普通用户池**（`requires_subscription=0` 的计量权益，如免费标讯额度） |
| `seat_user_id` | `BIGINT UNSIGNED` | 否 | — | 额度持有用户：订阅级共享池记 `owner_user_id`；席位独立额度记席位成员 id |
| `scope` | `ENUM('subscription','seat')` | 否 | `'subscription'` | 额度池归属层级：整订阅共享 / 单席位独立 |
| `benefit_code` | `VARCHAR(64)` | 否 | — | FK → `crm_benefit_catalog.benefit_code`（须 `is_consumable=1`，服务层校验） |
| `quota_total` | `INT` | 否 | — | 总额度；**`-1`=显式不限**（不限行不记消耗，`quota_used` 恒 0） |
| `quota_used` | `INT` | 否 | `0` | 已用（`quota_total=-1` 时恒 0，仅作结构对称） |
| `period` | `ENUM('none','monthly','yearly')` | 否 | `'none'` | 周期口径：价格体系文档"每月1次顾问咨询/建议12次/年"这类**周期性配额**的显式表达 |
| `period_starts_at` | `DATETIME` | 否 | `CURRENT_TIMESTAMP` | 当前周期起点（重置时推进） |
| `status` | `ENUM('active','exhausted','frozen','expired')` | 否 | `'active'` | 账本状态 |
| `created_at` | `DATETIME` | 否 | `CURRENT_TIMESTAMP` | 创建时间 |
| `updated_at` | `DATETIME` | 是 | NULL `ON UPDATE CURRENT_TIMESTAMP` | 更新时间 |

**约束**：
- `uk_pool`：`UNIQUE (subscription_pool_key, seat_user_id, benefit_code, period_starts_at)`，其中 `subscription_pool_key BIGINT GENERATED ALWAYS AS (IFNULL(subscription_id, 0)) STORED` —— 一个池一个周期只有一行，重置=推进 `period_starts_at` 开新行（**周期用量不 UPDATE 归零，留行可对账**；生成列是为了让普通用户池的 NULL 也能参与唯一约束）。
- `chk_usage`：`quota_used BETWEEN 0 AND GREATEST(quota_total, 0)`（`-1` 不限行天然通过：`GREATEST(-1,0)=0` 且 used 恒 0）。
- 扣减并发控制：服务层事务内 `SELECT … FOR UPDATE` 锁行后 `UPDATE … SET quota_used = quota_used + :n WHERE id = :id AND quota_total > 0 AND quota_used + :n <= quota_total`，以影响行数判定成败；`quota_total = -1`（不限）在入口短路放行、**不进入扣减语句**（与 `chk_usage` 恒 used=0 口径一致）。

**建表语句**：不在本文档复制，唯一事实源为 [`src/lib/db/migrations/092-benefit-system-tables.ts`](../../src/lib/db/migrations/092-benefit-system-tables.ts) 内对应表的 DDL（含表级 `COMMENT` 与逐列注释）；本文档 §1 的表注释行与库内 `TABLE_COMMENT` 逐字一致，取值域与 CHECK 以 §2 清单为准。

## 3. 字段含义（业务作用）

- **`scope` + `seat_user_id`**：价格体系文档未写“3 账号是共享额度还是各自额度”——结构对两种口径都成立：共享池开 `scope='subscription'`（`seat_user_id` 记 owner），独立额度按席位开 `scope='seat'` 行。裁决为数据/服务层决策，不改表。
- **普通用户池（`subscription_id NULL`）**：免费档=普通用户权益的计量落点——旧体系免费用量靠解锁流水 `COUNT(*)` 终身累计（不可周期重置、不可多权益化），新体系统一成账本行：`subscription_id=NULL + benefit_code=免费额度权益 + period`（如 monthly 月度重置），与付费池走**同一套扣减函数**，无平行实现。
- **`benefit_code` 泛化计量**：旧体系只有"解锁"一种额度；本表按权益码分池——`notice_view`（标讯条数）、`ai_tender_analysis`（AI 单）、`expert_consult`（咨询次数）、`tech_support`（支持次数）各自独立记账，互不挪用。
- **`quota_total = -1`**：矩阵格为"不限"时物化的直传行；消费路径先判 `-1` 短路放行，不写 `quota_used`。展示层"不限"文案由该值直出，**不再从大数字反推**。
- **幂等发放只抬不降，但 `-1` 必须优先于比较结果**：同一 `uk_pool` 重发时只允许 `quota_total` 变大、绝不重置 `quota_used`（否则续费/重放回调会把已花完的额度洗回满格）。但表达式不能写成 `GREATEST(quota_total, :new)`——`GREATEST(100, -1)` 等于 100，同周期重发"不限"时会被旧的正数额度顶掉（用户付了不限量却只拿到小池）。正确写法：`IF(:new = -1 OR quota_total = -1, -1, GREATEST(quota_total, :new))`。要清零用量只能推进 `period_starts_at` 开新周期行。
- **`period`**：矩阵里"配额/优惠"（AI 单标解析 ADVISOR 格）与 06 章"月度 1 次咨询"的落点——周期配额是**账本属性**，不是权益矩阵值；矩阵格声明"有配额"，本表声明"配额多少、何时重置"。
- **`status='frozen'`**：订阅退款/违规冻结时批量置位，消费判定恒含 `status='active'`。退款路径的"冻池 + 订阅置 `refunded`"**必须同一事务**（见订单表文档 §7 对 `refunded` 的同样要求），不得拆成两个依赖调用方顺序的写入。

## 4. 枚举类型说明：`status`

| 取值 | 业务含义 |
|---|---|
| `active` | 可消费 |
| `exhausted` | 本周期用尽（周期行到点开新行，不复活旧行） |
| `frozen` | 订阅退款/风控冻结，禁止消费 |
| `expired` | 随订阅到期终止 |

## 5. 索引与主键

| 索引名 | 列 | 类型 | 设计意图 |
|---|---|---|---|
| `PRIMARY` | `id` | 主键 | 扣减 `FOR UPDATE` 锁定点查 |
| `uk_pool` | `(subscription_pool_key, seat_user_id, benefit_code, period_starts_at)` | 唯一 | 一池一周期一行 + 惰性建行幂等（`subscription_pool_key` 是生成列，非 `subscription_id` 本身） |
| `idx_consume` | `(seat_user_id, benefit_code, status, period_starts_at)` | 复合 | 消费主查询："该用户该权益当前周期可消费行" |
| `idx_subscription` | `(subscription_id, status)` | 复合 | 订阅生灭时批量开池/冻结 |

## 6. 结构约定

- 全表 `utf8mb4` / `utf8mb4_0900_ai_ci`。
- **本表是全库唯一的额度扣减落点**：新增任何计量型权益只加字典行 + 矩阵格，禁止为新场景另建平行额度表或旁路 UPDATE。
- 懒物化允许（首次消费时按矩阵值开池行），但 `uk_pool` 保证并发下幂等，物化口径由服务层统一封装。

---

*最后更新：2026-09-22（表名由 `crm_quotas_neo2026` 正式化为 `crm_benefit_quotas`，补表级 COMMENT 与逐列注释；已本地实建，并验证普通用户池 NULL 参入唯一约束、chk_usage 拒超额、不限行不记消耗）*
