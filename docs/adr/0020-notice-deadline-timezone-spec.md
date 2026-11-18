# ADR-0020：公告截止时间的时区口径与写法规范

- 状态：已接受（2026-11-18）
- 关联：`bid_opportunities.deadline_timezone`（原始层）、`notice_deadline`（语义层）、`notice_public`（服务表投影）
- 涉及仓库：`supply-os`
- 相关文档：[迁移 052](../src/lib/db/migrations/052-notice-public-timezone-source.ts)、[迁移 053](../src/lib/db/migrations/053-notice-timezone-column-comments.ts)

> 2026-11-18 定稿。适用于公告（notice）截止时间的**存储、解析与展示**三层。
> 任何新增来源/新增读取路径都必须遵守本文口径；代码侧唯一实现见文末「相关代码」。

## 1. 三层数据模型（先分清“原始 / 语义 / 服务表投影”）

| 层 | 表.列 | 类型 | 允许的写法 | 写入方 |
|---|---|---|---|---|
| 原始抓取层 | `bid_opportunities.deadline_timezone` | `varchar(200)` | **自由文本**，可能含页面时区注释（如「菲律宾时间（PHT，UTC+8）；北京时间（UTC+8）」） | 爬虫/商机侧 |
| 语义层 | `notice_deadline.deadline_timezone` | `varchar(64)` | **仅可计算令牌**：`GMT±HH:MM` / 裸 `UTC`·`GMT` / IANA `Area/City`；无令牌为 `NULL` | `notice-deadline/backfill.ts` |
| 语义层 | `notice_deadline.timezone_source` | `varchar(20)` | `explicit` / `assumed_utc` / `date` / `NULL` | 同上 |
| 服务表投影 | `notice_public.deadline_timezone` | `varchar(64)` | 同语义层令牌（`build.ts` 原样投影） | `notice-public/build.ts`（唯一写入者） |
| 服务表投影 | `notice_public.timezone_source` | `varchar(20)` | 同语义层枚举（冗余副本） | 同上 |

**关键区分**：原始层的自由文本**不可计算、禁止展示**；只有语义层的令牌能拿去把 UTC 时刻换算成「发标地当地时间」。

时间值本身统一为 **`deadline_ts`（UTC epoch 秒）**，服务表/语义层都不存本地时间字符串。

## 2. 时区令牌的合法写法（`parseDeadlineZone` 唯一解析器）

1. **显式偏移**：`GMT+08:00`、`GMT+0800`、`GMT+8`、`UTC-05:00`（小时 ≤ 14、分钟 ≤ 59）；
2. **裸零偏移**：`UTC`、`GMT`（等价 +00:00）；
3. **IANA 时区**：`Area/City` 形如 `Europe/Riga`、`America/New_York`，写库前用 `Intl` 做一次构造校验；
4. 其它一律视为**无令牌**（返回 `null`），包括带空格/中文/分号的自由文本、越界偏移、不存在的 IANA 名。

## 3. `timezone_source` 枚举语义（决定“怎么展示”，不是“选时区”）

| 值 | 含义 | 展示影响 |
|---|---|---|
| `explicit` | 源文本带可计算时区令牌 | 正常换算（列表按北京时间） |
| `assumed_utc` | 源只有墙上时分、无时区；ts 按 UTC 存 | **不做 +8**，按 UTC 还原原文墙上时间；详情标「原文当地时间」 |
| `date` | 源只有日期 | **只出日期**，不臆造 `00:00` |
| `NULL` | 未知/无 | 按默认口径（北京时间） |

配合 `deadline_state`（`known` / `unknown` / `placeholder` / `typo_suspect` / `framework_end` / `invalid`）与 `deadline_type`（`bid` / `framework_end` / `registration` / `award` / `info`）：只有 `known` 且 `effectiveTs` 非空才对外出时间；哨兵日期（2125-12-31 等）、年份笔误（`typo_suspect`）一律不出。

## 4. 展示规范（全站统一，2026-11-11 锁定）

- 一律按**北京时间**（`NOTICE_DISPLAY_TIME_ZONE = Asia/Shanghai`）换算；界面语言只影响标签，不影响数值；
- 格式唯一：有真实时刻 `YYYY-MM-DD HH:mm`，只有日期 `YYYY-MM-DD`；无值显示「未公布」；
- `assumed_utc` 且无令牌 → 按 UTC 还原墙上时间（不 +8）；`date` → 只日期；
- 详情页「当地 05:00（GMT-04:00）」仅在**可计算令牌且非 +08:00** 时显示；`assumed_utc` 显示「原文当地时间」；
- 导出/报告：默认北京时间并标「（北京时间）」，`assumed_utc` 标「（原文当地时间）」。

## 5. 写入链路（单一事实源）

```
bid_notices.deadline（源自由文本）/ deadline_ts
        │
        ▼  shared/utils/notice-datetime/source-date.ts（唯一识别器）
        ▼  services/notice-deadline/classify.ts（唯一分类器：state/type/effectiveTs/timezone/timezoneSource）
        ▼  services/notice-deadline/backfill.ts → notice_deadline
        ▼  services/notice-public/build.ts（服务表唯一写入者）→ notice_public
```

新增来源或修正规则时只改上述唯一实现；禁止在 SQL/前端另写一份时间解析。

## 6. 生产核查（2026-11-18）

- `notice_deadline`：1,004,319 行，带令牌 405,719 行，**非令牌写法 0 行**；
- `notice_public`：549,455 行，带令牌 181,980 行，**非令牌写法 0 行**；
- `timezone_source` 分布（服务表）：`NULL` 194,573 / `explicit` 181,997 / `assumed_utc` 111,254 / `date` 61,631；
- 令牌 Top：`GMT+00:00` 36,213、`GMT+02:00` 31,159、`GMT+03:00` 28,778。

> 存在 17 行 `explicit` 但令牌为空的边角数据（量极小，展示无影响：无令牌走默认北京时间分支）。

## 7. 相关代码与迁移

- 解析：`src/shared/utils/notice-datetime/{parse,format,timezone,source-date}.ts`
- 分类：`src/lib/services/notice-deadline/{classify,backfill}.ts`
- 投影：`src/lib/services/notice-public/build.ts`（`PUBLIC_COLS` 与 baseline 由 SSOT 门禁对齐）
- 展示：`src/shared/utils/noticeDisplay.ts`、`src/shared/utils/notice-datetime/format.ts`
- 迁移：`052-notice-public-timezone-source`（服务表冗余该列）、`053-notice-timezone-column-comments`（本规范写进列注释）
