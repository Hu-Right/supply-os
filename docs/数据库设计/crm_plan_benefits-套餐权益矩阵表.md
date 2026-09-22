# crm_plan_benefits — 套餐权益矩阵表（表结构设计）

> 权威口径以 `src/lib/db/migrations/*` 累计效果 + `src/lib/repos/*` 实际读写为准；发现与代码不符，以代码为准并回写本文档。
> 本文档描述该表**当前设计结构**；已由迁移 092 在本地库实建（阶段一·旁路），生产在部署时由 runner 执行。

---

## 1. 表名与用途

- **表名**：`crm_plan_benefits`
- **引擎/字符集/排序规则**：`InnoDB` / `utf8mb4` / `utf8mb4_0900_ai_ci`
- **表注释（DB 内 `COMMENT` 原文）**：`套餐权益矩阵表：按（套餐 × 权益）逐格存储精确取值，一行一格、无权益也显式存 0，是功能门控与官网对比表的唯一事实源`
- **用途**：官网六档对比矩阵（价格体系文档 02 章）的**逐格存储**——一行 = 一个（套餐, 权益）组合，格值精确唯一。
  本表是权益门控与前端对比表的**单一事实源**：后端闸门、官网卡片、BI 报表三处读同一格，禁止任何一侧再推导。
- **"1 就是 1"的落点**：矩阵不存在"按档位兜底默认值"——每个套餐对每个权益**必须显式有一格**，`—`（无）也是显式值 `0`，不是缺行。

## 2. 字段清单

| 字段 | 数据类型 | 可空 | 默认值 | 约束/说明 |
|---|---|---|---|---|
| `id` | `BIGINT UNSIGNED` | 否 | AUTO_INCREMENT | 主键 |
| `plan_code` | `VARCHAR(64)` | 否 | — | FK → `crm_plan_catalog.plan_code` |
| `benefit_code` | `VARCHAR(64)` | 否 | — | FK → `crm_benefit_catalog.benefit_code` |
| `value_level` | `INT` | 是 | NULL | 层级值：`bool` 型仅 `0/1`；`enum` 型 `0..4`（含义查字典 `level_dict`） |
| `value_num` | `INT` | 是 | NULL | 额度值（`quota` 型）：正整数=数量；`-1`=**显式不限**；`0`=该档**明确无额度**（如普通用户 0 条，属已裁决事实而非未配置） |
| `value_amount` | `DECIMAL(10,2)` | 是 | NULL | 金额值（`amount` 型）：`0.00`=包含/免费；正数=会员价 |
| `note_zh` | `VARCHAR(255)` | 是 | NULL | 格备注（如"批量下载按增值服务计费"，价格体系文档「不限权益边界」口径挂在对应格上） |
| `created_at` | `DATETIME` | 否 | `CURRENT_TIMESTAMP` | 创建时间 |
| `updated_at` | `DATETIME` | 是 | NULL `ON UPDATE CURRENT_TIMESTAMP` | 更新时间 |

**约束**：
- `uk_plan_benefit`：`UNIQUE (plan_code, benefit_code)` —— 一格一行，重复即错。
- `chk_one_value`：`(value_level IS NOT NULL) + (value_num IS NOT NULL) + (value_amount IS NOT NULL) = 1`
  —— **三个值列恰好一个非空**，矩阵格不允许"既无层级又无额度"的空格，也不允许双值歧义。
- 值列与 `value_kind` 的匹配（如 `quota` 型必须落 `value_num`）**由服务层写入前置校验**承担，不在本表建逐类型 CHECK（避免字典表变更联动矩阵表约束锁表）。

**建表语句**：不在本文档复制，唯一事实源为 [`src/lib/db/migrations/092-benefit-system-tables.ts`](../../src/lib/db/migrations/092-benefit-system-tables.ts) 内对应表的 DDL（含表级 `COMMENT` 与逐列注释）；本文档 §1 的表注释行与库内 `TABLE_COMMENT` 逐字一致，取值域与 CHECK 以 §2 清单为准。

## 3. 字段含义（业务作用）

- **三值列互斥**：`value_level`（权限/层级）、`value_num`（计量）、`value_amount`（价格）分别对应字典表 `value_kind` 的四种声明（`bool`/`enum` 共用 `value_level`）。读取方先看字典声明类型，再取对应列，**永不猜列**。
- **`value_num = -1`**：全库唯一的"不限"表达。任何消费逻辑（额度校验、前端展示"不限"）都只做一次等值判断；`-1` 参与算术前必须由服务层短路，禁止拿 `-1` 当数字累加。
- **`note_zh`**：「不限权益边界」这类**格级免责口径**的落点——边界说明属于那一格，不属于套餐行也不属于全局文案，前端锁定态提示直接渲染它。
- **完整性约束**：矩阵 = 套餐数 × 权益数的全笛卡尔积，缺格由服务层启动期校验（`COUNT(格) = COUNT(套餐)×COUNT(活跃权益)`）报错兜底，DB 不做触发器。
- **异常值一律渲染 `∅`，不得编文案**：两类存不一致在读取时止血——`enum` 型的 `value_level` 超出 `level_dict` 键集（字典里没这个层级的文档原文）、`amount` 型缺 `value_amount`（与 `chk_one_value` 矛盾）。旧实现分别回退成整数本身与 `Number(null)=0` → “包含”，等于把数据缺陷变成官网上一句看不出来的错话，且与同格 `enabled=false` 自相矛盾。两种情况均展示 `∅` + `note` 说明待补值；其中枚举止血**不影响门控**（层级 >0 是矩阵明说了的“该档有此权益”）。

## 4. 读取模式（结构决定的查询形状）

| 场景 | 读法 |
|---|---|
| 官网对比表/六卡 | `WHERE plan_code IN (六档) ORDER BY benefit_code 字典序` 一次取全矩阵 |
| 后端单格闸门 | `WHERE plan_code = :用户订阅档 AND benefit_code = :门控键`（走 `uk_plan_benefit` 唯一索引，点查） |
| 单调性审计 | 同一 `benefit_code` 六格 `value_level` 按商业层级升序校验（服务层定期跑，不在库内约束——"可配置/定制"类格允许合同例外） |

## 5. 索引与主键

| 索引名 | 列 | 类型 | 设计意图 |
|---|---|---|---|
| `PRIMARY` | `id` | 主键 | 代理主键（矩阵行可能被变更记录引用） |
| `uk_plan_benefit` | `(plan_code, benefit_code)` | 唯一 | 一格一行 + 闸门点查主路径 |
| `idx_benefit` | `(benefit_code, plan_code)` | 复合 | 按权益行跨档比对（单调性审计、行渲染） |

## 6. 结构约定

- 全表 `utf8mb4` / `utf8mb4_0900_ai_ci`，外键两侧列类型/排序规则严格一致。
- 改一格 = `UPDATE`（矩阵是**当前口径**表；历史口径随套餐版本行 `is_active=0` 整体封存，不做格级版本链）。
- 新权益上架 = 字典加行 + **为全部活跃套餐补齐显式格**（含 `value_level=0` 的"无"），一个事务内完成。

---

*最后更新：2026-09-22（表名由 `crm_plan_benefits_neo2026` 正式化为 `crm_plan_benefits`，外键约束名 `fk_pbn_*` → `fk_pb_*`，补表级 COMMENT 与逐列注释；已本地实建并验证 chk_one_value 真实生效）*
