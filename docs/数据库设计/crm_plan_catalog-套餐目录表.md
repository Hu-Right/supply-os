# crm_plan_catalog — 套餐目录表（表结构设计）

> 权威口径以 `src/lib/db/migrations/*` 累计效果 + `src/lib/repos/*` 实际读写为准；发现与代码不符，以代码为准并回写本文档。
> 本文档描述该表**当前设计结构**；已由迁移 092 在本地库实建（阶段一·旁路），生产在部署时由 runner 执行。

---

## 1. 表名与用途

- **表名**：`crm_plan_catalog`
- **引擎/字符集/排序规则**：`InnoDB` / `utf8mb4` / `utf8mb4_0900_ai_ci`
- **表注释（DB 内 `COMMENT` 原文）**：`套餐目录表：官网在售各档套餐的商品属性（价格、计费周期、席位上限、销售层级、角标与按钮），不承载权益内容`
- **用途**：官网六档主套餐（价格体系文档 02 章 STARTER/PRO/UNLIMITED/BUSINESS/ADVISOR/ENTERPRISE）的**商品行**：
  价格、有效期、席位、销售层级与 CTA。权益内容不在本表——全部在矩阵表 `crm_plan_benefits`。
- **免费档（已定稿）**：免费档=普通用户权益，以 `price=0.00` 的 `plan_code='free'` 行存在（与旧体系 `plan_code='free'` 同位），
  作用是为普通用户提供**矩阵取值列**；**不进入官网六卡列表、不产生购买、不建订阅**（服务层按 `price>0` 过滤官网展示，
  并禁止对 free 行开单）；其权益行由字典表 `requires_subscription=0` 标记。
- **关系**：被矩阵表、订阅表按 `plan_code` 引用。

## 2. 字段清单

| 字段 | 数据类型 | 可空 | 默认值 | 约束/说明 |
|---|---|---|---|---|
| `plan_code` | `VARCHAR(64)` | 否 | — | **主键**，商品稳定机器码（如 `starter_129`），下架不复用 |
| `name_en` | `VARCHAR(40)` | 否 | — | 官网档名（STARTER/PRO/…，六语展示键由 i18n 侧 `plan_code` 映射） |
| `name_zh` | `VARCHAR(80)` | 否 | — | 中文名（体验版/专业版/无限版/企业智能版/企业顾问版/机构·API版） |
| `positioning_zh` | `VARCHAR(255)` | 否 | — | 核心定位一句话（矩阵"核心定位"行） |
| `price` | `DECIMAL(10,2)` | 否 | — | 官网价；`price_mode='free'` 时必为 `0.00`；`NULL` 不允许——**"联系销售"不是价格未知，见 `price_mode`** |
| `price_mode` | `ENUM('fixed','contact','free')` | 否 | `'fixed'` | `fixed`=明码标价可自助支付；`contact`=联系销售（ENTERPRISE 档，`price` 存 `0.00` 且**不得**用于展示/计费）；`free`=普通用户档（不售卖、不得建订阅，取代旧体系 free 行） |
| `price_incl_tax` | `TINYINT(1)` | 是 | NULL | 含税口径：1=含税/0=未税/NULL=未定（docx 09 章第 1 条裁决前恒 NULL，付款页强校验非 NULL 才允许开单） |
| `currency` | `VARCHAR(10)` | 否 | `'CNY'` | 币种 |
| `billing_period_days` | `INT` | 是 | NULL | 计费周期天数（365=年付；NULL=一次性/按合同交付） |
| `seat_limit` | `INT` | 否 | `1` | 席位上限；`-1`=自定义（ENTERPRISE 合同定）；**没有"建议"值，只有硬上限**（超席位加购走服务订购，不在订阅行内改数） |
| `commercial_tier` | `ENUM('L1','L2','L3','L4','L5','L6')` | 否 | — | 商业层级（docx 01 章六级梯度），报表与销售 SOP 归组键 |
| `cta_i18n_key` | `VARCHAR(64)` | 否 | — | 官网按钮键（"立即体验/立即升级/开通会员/企业入驻/预约顾问/获取方案"六语映射） |
| `badge` | `ENUM('none','most_popular','best_value','custom')` | 否 | `'none'` | 官网角标（docx 08 章：UNLIMITED=most_popular，ADVISOR=best_value，ENTERPRISE=custom） |
| `sort_order` | `INT` | 否 | `0` | 六卡横序（第一屏 Plans 顺序） |
| `is_active` | `TINYINT(1)` | 否 | `1` | 上架标记 |
| `created_at` | `DATETIME` | 否 | `CURRENT_TIMESTAMP` | 创建时间 |
| `updated_at` | `DATETIME` | 是 | NULL `ON UPDATE CURRENT_TIMESTAMP` | 更新时间 |

**CHECK 约束**：
- `chk_price_mode`：`price_mode <> 'fixed' OR price > 0`（明码档价格必须为正，杜绝 99999 式占位；`contact`/`free` 两种形态允许 0 价）。
- `chk_seat_limit`：`seat_limit = -1 OR seat_limit > 0`。

**建表语句**：不在本文档复制，唯一事实源为 [`src/lib/db/migrations/092-benefit-system-tables.ts`](../../src/lib/db/migrations/092-benefit-system-tables.ts) 内对应表的 DDL（含表级 `COMMENT` 与逐列注释）；本文档 §1 的表注释行与库内 `TABLE_COMMENT` 逐字一致，取值域与 CHECK 以 §2 清单为准。

## 3. 字段含义（业务作用）

- **`price_mode`**：把"联系销售"从"价格缺失"里剥出来——价格是确定的商务行为模式，而不是 NULL 造成的语义黑洞；计费链路对 `contact` 档一律拒单转商务。
- **`seat_limit`**：价格体系文档"建议账号数"在本设计中改为**硬上限**（1/1/1/3/5/-1 为数据问题不入结构）；`-1` 显式表达"合同自定义"，席位实际数由 `crm_subscription_seats` 行数校验。
- **`billing_period_days`**：周期订阅恒 365（本体系无月付）；`commercial_tier='L6'` 的 API 授权若以套餐形态存在，本列为 NULL、交付以合同为准。
- **`badge` / `cta_i18n_key`**：官网第一屏渲染所需字段全部结构化，前端零硬编码（旧体系 `getPlanTier` 硬编码串档的教训不复现）。
- **`commercial_tier`**：六级梯度是**商品属性**而非权益门控依据；门控永远读矩阵。

## 4. 枚举类型说明

| 字段 | 取值 | 业务含义 |
|---|---|---|
| `price_mode` | `fixed` / `contact` | 明码标价 / 商务报价（不进自助支付） |
| `commercial_tier` | `L1`..`L6` | 数据体验/个人专业/企业智能/企业顾问/项目服务/数据授权 |
| `badge` | `none` / `most_popular` / `best_value` / `custom` | 无角标 / 最受欢迎 / 企业推荐 / 定制方案 |

## 5. 索引与主键

| 索引名 | 列 | 类型 | 设计意图 |
|---|---|---|---|
| `PRIMARY` | `plan_code` | 主键 | 商品码直查；矩阵/订阅按码 JOIN |
| `idx_active_sort` | `(is_active, sort_order)` | 复合 | 官网六卡列表 |
| `idx_tier` | `commercial_tier` | 普通 | 层级归组报表 |

## 6. 结构约定

- 全表 `utf8mb4` / `utf8mb4_0900_ai_ci`。
- 价格调整 = 新版本行上架 + 旧行 `is_active=0`（订阅表按 `plan_code` 快照持旧价，历史订单可对账）；**禁止原地 UPDATE 已成交套餐的价格**。
- 结构变更走影子表蓝绿（ADR 0003）。

---

*最后更新：2026-09-22（表名由 `crm_plans_neo2026` 正式化为 `crm_plan_catalog`，文档标题同步为「套餐目录表」，补表级 COMMENT 与逐列注释；已本地实建。本轮为录入 docx 六档 + 普通用户档而新增 `price_mode='free'` 成员并放宽 `chk_price_mode`（否则 `free` 行 0 价会被约束拒），七档商品属性已直接写入表内）*
