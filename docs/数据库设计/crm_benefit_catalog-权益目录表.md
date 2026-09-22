# crm_benefit_catalog — 权益目录表（表结构设计）

> 权威口径以 `src/lib/db/migrations/*` 累计效果 + `src/lib/repos/*` 实际读写为准；发现与代码不符，以代码为准并回写本文档。
> 本文档描述该表**当前设计结构**；已由迁移 092 在本地库实建（阶段一·旁路），生产在部署时由 runner 执行。

---

## 1. 表名与用途

- **表名**：`crm_benefit_catalog`
- **引擎/字符集/排序规则**：`InnoDB` / `utf8mb4` / `utf8mb4_0900_ai_ci`
- **表注释（DB 内 `COMMENT` 原文）**：`权益目录表：定义系统内每一种权益的名称、取值类型与层级含义，是套餐权益矩阵和额度账本的前置字典`
- **用途**：全库权益的**字典与值类型声明**。官网矩阵（价格体系文档 02 章）的每一"行"对应本表一行；
  它回答"系统里存在哪些权益、每个权益的取值是什么类型、各档位数字代表什么业务含义"。
- **关系**：被 `crm_plan_benefits`（矩阵）按 `benefit_code` 主从引用；`crm_benefit_quotas` 的 `benefit_code` 仅对 `is_consumable=1` 的权益开放。

## 2. 字段清单

| 字段 | 数据类型 | 可空 | 默认值 | 约束/说明 |
|---|---|---|---|---|
| `benefit_code` | `VARCHAR(64)` | 否 | — | **主键**，权益稳定机器码（如 `notice_view`、`ai_match`），一经上线不可改语义 |
| `name_zh` | `VARCHAR(120)` | 否 | — | 中文名（官网矩阵行名，如"收藏/监控"） |
| `group_code` | `ENUM('notice','search','ai','enterprise','service','delivery')` | 否 | — | 分组：标讯/搜索/AI/企业/服务/交付（对应矩阵行分区） |
| `value_kind` | `ENUM('bool','enum','quota','amount')` | 否 | — | 该权益在矩阵格里的值类型（见第 4 节） |
| `level_dict` | `JSON` | 是 | NULL | 仅 `value_kind='enum'` 时必填：`{"0":"无","1":"基础",...}` 逐级业务含义，**机器可读的行内图例** |
| `is_consumable` | `TINYINT(1)` | 否 | `0` | 是否可在 `crm_benefit_quotas` 开立额度账本（1=可消耗计量，如标讯条数、AI 单数、咨询次数） |
| `requires_subscription` | `TINYINT(1)` | 否 | `1` | 1=需有效订阅才享有；0=**普通用户（无订阅）即享有**——免费档=普通用户权益的结构锚点（见第 3 节） |
| `gate_key` | `VARCHAR(64)` | 是 | NULL | 服务层门控读取键（代码中以常量引用，避免散落字符串）；纯展示行（如"官网按钮"）为 NULL |
| `sort_order` | `INT` | 否 | `0` | 矩阵行序（与 docx 02 章行序一致，前端直接按此渲染） |
| `is_active` | `TINYINT(1)` | 否 | `1` | 下架标记；下架不删行（矩阵历史格引用完整性） |
| `created_at` | `DATETIME` | 否 | `CURRENT_TIMESTAMP` | 创建时间 |
| `updated_at` | `DATETIME` | 是 | NULL `ON UPDATE CURRENT_TIMESTAMP` | 更新时间 |

**CHECK 约束**：
- `chk_enum_dict`：`value_kind <> 'enum' OR level_dict IS NOT NULL`（枚举型必须带层级字典，防止数字含义漂移）。

**建表语句**：不在本文档复制，唯一事实源为 [`src/lib/db/migrations/092-benefit-system-tables.ts`](../../src/lib/db/migrations/092-benefit-system-tables.ts) 内对应表的 DDL（含表级 `COMMENT` 与逐列注释）；本文档 §1 的表注释行与库内 `TABLE_COMMENT` 逐字一致，取值域与 CHECK 以 §2 清单为准。

## 3. 字段含义（业务作用）

- **`benefit_code`**：主键即机器码，矩阵表、额度表、服务层常量三处共用的唯一锚点。
- **`value_kind`**：决定矩阵表哪个值列有值（四列互斥，由矩阵表 CHECK 保证）：
  `bool`→`value_level∈{0,1}`；`enum`→`value_level` 按 `level_dict` 解释；`quota`→`value_num`；`amount`→`value_amount`。
- **`level_dict`**：把"1=基础、3=企业级"这类行专属语义**内联进行定义**，任何读矩阵的调用方（前端对比表、后端闸门、BI）不需要再查代码注释即可解释一个整数。
- **`is_consumable`**：区分“权限型权益”（看/不看，走矩阵即时判定）与“计量型权益”（有额度账本，走扣减），两者门控路径完全不同，禁止混用。
- **`requires_subscription=0`（普通用户权益）**：已定稿——免费档即普通用户身份自带的权益，**不为全体用户创建订阅行**：门控解析“无有效订阅”时落到 `plan_code='free'` 矩阵列，但仅对 `requires_subscription=0` 的权益取该列值，其余权益一律按 `0(无)` 处理（服务层规则，不新增矩阵结构）。官网不展示 free 列（docx 无第 0 档），仅后台矩阵编辑器可见。
- **`sort_order`**：官网矩阵行序即产品叙事顺序，结构层承载排序，避免前端再维护一份行序映射。
- **待补：六语展示键**（未定稿）：本表目前只有 `name_zh`，而旧对比表行名走 `t(i18nKey)` 取六语文案；
  若要保留六语能力需补 `name_i18n_key VARCHAR(64) NULL`（空则用 `name_zh` 兜底）。本轮未加，属待裁决项。

## 4. 值类型（`value_kind`）枚举说明

| 取值 | 矩阵落值列 | 取值域 | 典型权益 |
|---|---|---|---|
| `bool` | `value_level` | `0/1` | 全球标讯搜索、专属顾问、API接口 |
| `enum` | `value_level` | `0..4` 严格递增，逐级含义见 `level_dict` | 高级关键词搜索、AI智能匹配、提醒服务、联合投标资源匹配、专家人工咨询 |
| `quota` | `value_num` | 正整数=条数/单数；`-1`=不限 | 标讯额度、AI单标解析配额 |
| `amount` | `value_amount` | `0.00`=包含/免费；正数=会员价 | AI单标解析单价 |

## 5. 索引与主键

| 索引名 | 列 | 类型 | 设计意图 |
|---|---|---|---|
| `PRIMARY` | `benefit_code` | 主键 | 字典天然主键；矩阵/额度按码 JOIN，无代理 id |
| `idx_group_sort` | `(group_code, sort_order)` | 复合 | 前端按分组渲染矩阵 |

## 6. 结构约定

- 全表 `utf8mb4` / `utf8mb4_0900_ai_ci`，与 `crm_users` 等 JOIN 表一致，避免 `Illegal mix of collations`。
- 本表**只增行不改语义**：某权益要改值类型 = 旧行 `is_active=0` + 新码上架（矩阵历史格仍指向旧码可查史）。
- 不建外键指向矩阵（依赖方向反转：矩阵引用字典），孤儿码由服务层启动期校验兜底。

---

*最后更新：2026-09-22（表名由 `crm_benefits_neo2026` 正式化为 `crm_benefit_catalog`，补表级 COMMENT 与逐列注释；已本地实建并过 23 项约束活性验证）*
