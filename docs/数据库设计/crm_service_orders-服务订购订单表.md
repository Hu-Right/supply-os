# crm_service_orders — 服务订购订单表（表结构设计）

> 权威口径以 `src/lib/db/migrations/*` 累计效果 + `src/lib/repos/*` 实际读写为准；发现与代码不符，以代码为准并回写本文档。
> 本文档描述该表**当前设计结构**；已由迁移 092 在本地库实建（阶段一·旁路），生产在部署时由 runner 执行。

---

## 1. 表名与用途

- **表名**：`crm_service_orders`
- **引擎/字符集/排序规则**：`InnoDB` / `utf8mb4` / `utf8mb4_0900_ai_ci`
- **表注释（DB 内 `COMMENT` 原文）**：`服务订购订单表：增值服务的下单与成交事实（数量、单价快照、状态机、合同编号、额度充值落点）；订阅类购买不走本表`
- **用途**：**增值服务与合同类 SKU 的订购/成交事实**（`crm_service_catalog` 目录项按量购买、项目制成交登记、留资转化记录）。
  主套餐订阅的支付订单沿用现有支付域表；本表成交后回写 `crm_plan_subscriptions.source_order_no` 的亦为该域订单号——**本表不承载订阅开单**，只承载"非订阅购买"。
- **关系**：引用 `crm_service_catalog`；`granted_subscription_id` 软指向额度充值落点订阅。

## 2. 字段清单

| 字段 | 数据类型 | 可空 | 默认值 | 约束/说明 |
|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | 否 | AUTO_INCREMENT | 主键 |
| `order_no` | `VARCHAR(80)` | 否 | — | UNIQUE，业务订单号（对外唯一标识） |
| `user_id` | `BIGINT UNSIGNED` | 否 | — | 下单账号，关联 `crm_users.id` |
| `service_code` | `VARCHAR(64)` | 否 | — | FK → `crm_service_catalog.service_code` |
| `quantity` | `INT` | 否 | `1` | 购买数量（`per_unit/per_time` 按件；`per_year` 恒 1） |
| `unit_price_snapshot` | `DECIMAL(10,2)` | 是 | NULL | 成交单价快照（目录调价不影响历史订单；`quote/contact` 形态为合同价） |
| `amount_total` | `DECIMAL(10,2)` | 否 | — | 订单总额 = 单价×数量（服务层计算写入，`contact` 未定前=0 且状态必为 `lead`） |
| `currency` | `VARCHAR(10)` | 否 | `'CNY'` | 币种快照 |
| `status` | `VARCHAR(20)` | 否 | 无默认，必须显式传入 | 订单状态机（见第 4 节）；取值域由 `chk_status_domain` 约束 |
| `sale_mode_snapshot` | `VARCHAR(20)` | 否 | 无默认，必须显式传入 | 下单时目录销售形态快照（域由 `chk_sale_mode_domain` 约束） |
| `granted_subscription_id` | `BIGINT UNSIGNED` | 是 | NULL | 额度充值落点订阅（服务带 `grant_benefit_code` 且买家有生效订阅时写入）；NULL=无充值或先购后订 |
| `contract_ref` | `VARCHAR(120)` | 是 | NULL | 合同编号（`contract` 形态必填，服务层校验）；docx"以合同为准"的回查锚点 |
| `paid_at` | `DATETIME` | 是 | NULL | 支付/成交时间 |
| `created_at` | `DATETIME` | 否 | `CURRENT_TIMESTAMP` | 创建时间 |
| `updated_at` | `DATETIME` | 是 | NULL `ON UPDATE CURRENT_TIMESTAMP` | 更新时间 |

**约束**：
- `chk_status_domain`：`status IN ('lead','pending','paid','cancelled','refunded')`。
- `chk_sale_mode_domain`：`sale_mode_snapshot IN ('self','lead','contract')`。
- `chk_quantity`：`quantity > 0`。
- `chk_grant_link`：`granted_subscription_id IS NULL OR status = 'paid'`（未成交不许充额度）。
- **为何不用 ENUM**（已实测确认的 MySQL 语义）：`NOT NULL ENUM` 且不写 DEFAULT 时，**隐式默认值就是首个枚举成员**，漏传不报错而是静默写入 `'lead'`——正是本表最不能接受的默误状态。改用 `VARCHAR + CHECK 取值域`：漏传直接报错（已验证：`Field 'status' doesn't have a default value`），非法值由 CHECK 拒绝。
- 支付流水（provider、trade_no、pay_url 等）不在本表——归支付域既有表，本表以 `order_no` 与之对账，**一单一支付记录**。

**建表语句**：不在本文档复制，唯一事实源为 [`src/lib/db/migrations/092-benefit-system-tables.ts`](../../src/lib/db/migrations/092-benefit-system-tables.ts) 内对应表的 DDL（含表级 `COMMENT` 与逐列注释）；本文档 §1 的表注释行与库内 `TABLE_COMMENT` 逐字一致，取值域与 CHECK 以 §2 清单为准。

> `granted_subscription_id` 不建外键：订阅表在另一写入域（支付回调开订阅），跨域引用以软链+对账任务保证，避免发布顺序互相锁死。

## 3. 字段含义（业务作用）

- **`status` 起点由 `sale_mode_snapshot` 决定**：`self`→`pending`（进支付）；`lead`→`lead`（留资即此态，无支付）；`contract`→`pending`（合同回签后置 `paid`）。状态机迁移全部在服务层，DB 以「无默认值 + 取值域 CHECK」双重卡住写入。
- **`unit_price_snapshot` 可空是刻意的**：`quote/contact` 形态在成交前确实无价，`paid` 时必填（服务层校验）——"可空"表达的是**流程阶段**，不是语义含糊。
- **`granted_subscription_id`**：解决"先买服务、后无订阅可挂额度"的时序——充值落点允许为空，待用户开订阅后由对账任务补挂；一旦写入即冻结归属。
- **`contract_ref`**：docx 09 章"以合同为准"（成功费、复杂项目专项报价、API 授权范围）全部收敛到这一个回查锚点，订单表不复制合同条款。

## 4. 枚举类型说明：`status`

| 取值 | 业务含义 | 允许的下一态 |
|---|---|---|
| `lead` | 留资/意向登记（未成价） | `pending`（转报价）/ `cancelled` |
| `pending` | 待支付 / 待合同回签 | `paid` / `cancelled` |
| `paid` | 已成交（含合同回签） | `refunded` |
| `cancelled` | 终止（未成交） | —（终态） |
| `refunded` | 已退款（联动冻结所充额度） | —（终态） |

## 5. 索引与主键

| 索引名 | 列 | 类型 | 设计意图 |
|---|---|---|---|
| `PRIMARY` | `id` | 主键 | 行定位 |
| `uk_order_no` | `order_no` | 唯一 | 对外单号；与支付域对账锚点 |
| `idx_user_status` | `(user_id, status, created_at)` | 复合 | 个人中心"我的服务订单"列表 |
| `idx_service` | `(service_code, status)` | 复合 | 服务维度成交统计、交付工作台取单 |

## 6. 结构约定

- 全表 `utf8mb4` / `utf8mb4_0900_ai_ci`。
- 本表只增不改金额：改价=作废重建订单（`cancelled` + 新单），留审计痕迹。
- `refunded` 与额度冻结（`crm_benefit_quotas.status='frozen'`）必须同事务联动，经统一服务函数执行，禁止旁路 UPDATE。

---

*最后更新：2026-09-22（表名由 `crm_payment_orders_neo2026` 正式化为 `crm_service_orders`，与所引用的 `crm_service_catalog` 命名口径对齐；补表级 COMMENT 与逐列注释，并在迁移 092 中补齐 `chk_quantity`/`chk_grant_link` 两条此前只写在字段清单、未落进建表语句的约束；本文档不再复制建表 DDL（与迁移文件双份必漂移），改为一行指向事实源；`status`/`sale_mode_snapshot` 由 ENUM 改为 VARCHAR+CHECK，原因见第 2 节；已本地实建并跑过 23 项约束活性验证）*
