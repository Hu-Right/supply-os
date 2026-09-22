# crm_service_catalog — 增值服务目录表（表结构设计）

> 权威口径以 `src/lib/db/migrations/*` 累计效果 + `src/lib/repos/*` 实际读写为准；发现与代码不符，以代码为准并回写本文档。
> 本文档描述该表**当前设计结构**；已由迁移 092 在本地库实建（阶段一·旁路），生产在部署时由 runner 执行。

---

## 1. 表名与用途

- **表名**：`crm_service_catalog`
- **引擎/字符集/排序规则**：`InnoDB` / `utf8mb4` / `utf8mb4_0900_ai_ci`
- **表注释（DB 内 `COMMENT` 原文）**：`增值服务目录表：非订阅制服务（按次/按项目/按合同购买）的品名、计价形态、标准价与成交后额度充值规则`
- **用途**：**非订阅制产品**的统一目录，承载价格体系文档三类 SKU：
  05 章专业增值服务（AI 单标解析、技术支持、调研、陪跑、人工标书…）、06 章 1对1 顾问三级体系、07 章 API 数据授权四档。
  与主套餐（`crm_plan_catalog`）分表的原因：服务是**按次/按项目/按合同购买**，不产生周期订阅与矩阵权益。
- **关系**：被 `crm_service_orders` 按 `service_code` 引用；`grant_benefit_code` 外键关联 `crm_benefit_catalog`。

## 2. 字段清单

| 字段 | 数据类型 | 可空 | 默认值 | 约束/说明 |
|---|---|---|---|---|
| `service_code` | `VARCHAR(64)` | 否 | — | **主键**，服务稳定机器码（如 `svc_ai_tender_analysis`） |
| `category` | `ENUM('pro_service','advisory','api_license')` | 否 | — | 三类：专业增值服务 / 顾问服务 / API 数据授权 |
| `name_zh` | `VARCHAR(120)` | 否 | — | 中文名（"AI单标解析"） |
| `name_en` | `VARCHAR(120)` | 否 | — | 官网英文名（价格体系文档 05 章"官网英文名"列） |
| `price_mode` | `ENUM('per_unit','per_time','per_year','token','project','quote','contact')` | 否 | — | **计价形态**（见第 4 节），决定 `standard_price` 是否有值与订单如何定价 |
| `standard_price` | `DECIMAL(10,2)` | 是 | NULL | 标准价；`price_mode IN ('token','project','quote','contact')` 时为 NULL（算力计费与另议不冒充价格） |
| `price_from` | `TINYINT(1)` | 否 | `0` | `standard_price` 是否为"起"价（¥26,800/项目**起**；1=展示必须带"起"字，防一口价误读） |
| `currency` | `VARCHAR(10)` | 否 | `'CNY'` | 币种 |
| `grant_benefit_code` | `VARCHAR(64)` | 是 | NULL | 成交后向 `crm_benefit_quotas` 充值的权益码（如买"技术支持年度包"充 `tech_support` 次数）；纯交付型服务为 NULL |
| `grant_quota` | `INT` | 是 | NULL | 单次成交充值的额度数量（与 `grant_benefit_code` 成对出现） |
| `grant_period` | `ENUM('none','monthly','yearly')` | 否 | `'none'` | 充值额度的周期口径（年度包=12 次按年；`grant_benefit_code` 非空时必填） |
| `validity_days` | `INT` | 是 | NULL | 服务有效期/交付窗口（咨询额度年内使用类）；NULL=按合同约定 |
| `sale_mode` | `ENUM('self','lead','contract')` | 否 | `'self'` | 自助下单 / 留资转化 / 合同成交（API 授权、大额陪跑不走自助支付） |
| `member_discount` | `ENUM('none','any_plan','unlimited_plus')` | 否 | `'none'` | 会员优惠资格：无 / 任意付费订阅 / UNLIMITED 及以上（价格文档"会员优惠"两格的口径位；具体折后价属服务层定价逻辑，目录只声明资格） |
| `deliverable_note_zh` | `VARCHAR(500)` | 是 | NULL | 标准交付口径（价格体系文档 05 章"标准交付口径"列原文） |
| `is_active` | `TINYINT(1)` | 否 | `1` | 上架标记 |
| `sort_order` | `INT` | 否 | `0` | 目录展示序 |
| `created_at` | `DATETIME` | 否 | `CURRENT_TIMESTAMP` | 创建时间 |
| `updated_at` | `DATETIME` | 是 | NULL `ON UPDATE CURRENT_TIMESTAMP` | 更新时间 |

**CHECK 约束**：
- `chk_price_by_mode`：`price_mode IN ('token','project','quote','contact') OR (standard_price IS NOT NULL AND standard_price > 0)`（可自助计价的形态必须有正价；`token` 按算力计费无标准价，与 `project/quote/contact` 同属可空价形态）。
  > 必须带 `IS NOT NULL`：MySQL 三值逻辑下 `NULL > 0` 结果是 UNKNOWN，CHECK 会**放行**——已实测验证该写法正确拒绝 NULL 与 0 两种情况。
- `chk_grant_pair`：`(grant_benefit_code IS NULL) = (grant_quota IS NULL)`（充值权益码与数量成对）。
- `chk_price_from`：`price_from = 0 OR standard_price IS NOT NULL`（“起”价必须有基准数）。
- `chk_grant_period`：`grant_benefit_code IS NULL OR grant_period <> 'none'`（充值额度必须声明周期口径）。

**建表语句**：不在本文档复制，唯一事实源为 [`src/lib/db/migrations/092-benefit-system-tables.ts`](../../src/lib/db/migrations/092-benefit-system-tables.ts) 内对应表的 DDL（含表级 `COMMENT` 与逐列注释）；本文档 §1 的表注释行与库内 `TABLE_COMMENT` 逐字一致，取值域与 CHECK 以 §2 清单为准。

## 3. 字段含义（业务作用）

- **`price_mode` 是本表灵魂**：docx 05 章 11 行服务的价格形态完全不同（/单、/次、/年、Token、/项目起、单独报价、联系销售），旧体系无法区分"可自助买"与"只能谈"。订单定价、官网展示后缀（"¥199/单"“¥26,800/项目起”）、支付链路开关全部由本列驱动。
- **`price_from`**："起"价是**展示与法务口径**而非数据缺省——单列布尔把它从"备注文字"提升为结构约束，防止前端把 ¥26,800 当固定价渲染。
- **`grant_*` 三列**：服务与权益体系的**唯一桥梁**——购买"国际公采咨询 ¥16,800/年（建议12次）"成交后，向额度账本充 12 次年度周期咨询额度；纯交付型（人工标书）无充值，置 NULL。这避免了"服务归服务、权益归权益"两套账。
- **`sale_mode`**：`lead`（留资）保留现有服务卡扫码路径；`contract` 用于 API 授权/大额陪跑——**授权类 SKU 只在本表登记目录，实际调用开通不在本项目实现**（开放平台边界）。
- **`member_discount`**：矩阵 `amount` 型权益（AI 单标解析会员价）声明"谁有资格优惠"，折扣数值由定价服务层按档计算——目录不存折扣率，防止矩阵与目录两处各存一份口径。

## 4. 枚举类型说明：`price_mode`

| 取值 | 含义 | 典型服务 |
|---|---|---|
| `per_unit` | 按单件（每标/每条） | AI 单标解析 ¥199/单 |
| `per_time` | 按次 | 投标技术支持 ¥500/次 |
| `per_year` | 按年包 | 技术支持年度包 ¥3,000/年、顾问服务两档 |
| `token` | 按算力消耗 | AI 标书辅助（`standard_price` 为 NULL，无标准价） |
| `project` | 按项目（起价） | 单标陪跑 ¥26,800/项目起 |
| `quote` | 按项目单独报价 | 专业人工标书、商务辅助 |
| `contact` | 联系销售 | API STARTER~ENTERPRISE（目录登记起价但成交走合同） |

> 注：`api_license` 三类枚举值与 `price_mode='contact'` 组合即"目录可标价、成交必合同"；`standard_price` 对 `contact` 允许为 NULL，"¥9,800 起"这类锚点价是否入目录为数据决策。

## 5. 索引与主键

| 索引名 | 列 | 类型 | 设计意图 |
|---|---|---|---|
| `PRIMARY` | `service_code` | 主键 | 目录码直查，订单按码 JOIN |
| `idx_cat_sort` | `(category, is_active, sort_order)` | 复合 | 官网第三/四屏分组渲染目录 |

## 6. 结构约定

- 全表 `utf8mb4` / `utf8mb4_0900_ai_ci`。
- 调价同套餐纪律：新版本行 + 旧行下架，**不原地改已成交服务的 `standard_price`**（订单表有快照列兜底展示）。
- 服务下架不删行；历史订单引用完整性优先。

---

*最后更新：2026-09-22（表名由 `crm_services_neo2026` 正式化为 `crm_service_catalog`，与订单表 `crm_service_orders` 成对；补表级 COMMENT 与逐列注释；`chk_price_by_mode` 补 `IS NOT NULL` 以封住三值逻辑漏洞；已本地实建并过约束活性验证。本轮录入 docx 05/06/07 章 15 条服务，并为 `svc_ai_bid_writing`（Token 计费无标准价）将 `token` 加入 CHECK 豁免名单；06 章三行与 05 章同价同名，不重复建 SKU）*
