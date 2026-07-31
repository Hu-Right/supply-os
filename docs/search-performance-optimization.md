# 公采搜索性能优化方案

> 基于生产库（192.168.1.2/crm）实测数据，2026-08-01 诊断

## 一、当前实现机制与技术架构

### 请求链路（`GET /api/notices`）

```
用户搜索 → 内存缓存命中？→ 是 → 直接返回（TTL 60s，上限 200 条）
                         → 否 ↓
  ① buildNoticeUnspscFilter()  — 类目过滤（额外 1 次 SQL 查 crm_unspsc_codes）
  ② COUNT(DISTINCT n.id)       — 全量计数（含全部 JOIN + WHERE）
  ③ SELECT DISTINCT ... LIMIT  — 分页数据（含全部 JOIN + WHERE + ORDER BY）
  ④ 页级 is_featured 标注      — 对当页 ≤30 条回查三路精选判定
  ⑤ 页级 documents 计数        — 对当页 ≤30 条查文件数
  ⑥ 写搜索日志                 — 异步 INSERT crm_user_search_log
```

### 核心文件

| 文件 | 职责 |
|---|---|
| `server/routes/notices/search.routes.ts` | 搜索/统计/推荐路由（485 行） |
| `server/services/unspsc.ts` | UNSPSC 类目过滤构建器 |
| `server/services/notices.ts` | FEATURED_NOTICE_EXISTS 精选判定常量 |
| `server/services/recommend.ts` | 推荐评分/MMR 重排 |
| `server/db/schema.ts` | 表结构与索引定义 |

### 生产库表规模

| 表 | 行数 | 数据 | 索引 |
|---|---|---|---|
| crm_bid_notices | 99,088 | 407 MB | 54.5 MB |
| crm_bid_notice_unspsc_codes | 312,531 | 41.6 MB | 127 MB |
| crm_notice_amount_cache | 108,890 | 6.5 MB | 5 MB |
| crm_notice_translations | 57,118 | 9.5 MB | 4 MB |
| crm_bid_opportunities | 3,053 | 396.6 MB | 1 MB |

### 现有索引（crm_bid_notices）

```
PRIMARY (UNIQUE): id
uk_notice_tenant (UNIQUE): notice_id, tenant_id
uq_notice_source (UNIQUE): notice_id, source_channel
idx_is_expired: is_expired
idx_deadline_ts: deadline_ts
idx_bid_notices_active_deadline_id: is_expired, deadline_ts, id
idx_bid_notices_expired_create_id: is_expired, create_time, id
（共 14 个索引）
```

---

## 二、性能瓶颈根因诊断

### 生产实测计时

| 查询类型 | 耗时 | 扫描行数 |
|---|---|---|
| 关键词搜索（LIMIT 9） | **387ms** | 50,223 |
| 关键词搜索（COUNT） | **2,871ms** | 50,223（全量） |
| 精选过滤（COUNT） | **3,162ms** | 50,223 + 子查询 |
| 纯活跃计数（无搜索） | **411ms** | 50,223 |

**一次带关键词的搜索请求 ≈ COUNT(2.9s) + LIMIT(0.4s) + 标注(2×) ≈ 3.5-4s**

### 瓶颈 #1：COUNT(DISTINCT n.id) 全量扫描（占总耗时 80%）

**位置**：`search.routes.ts` L155-158

```sql
SELECT COUNT(DISTINCT n.id) AS total
FROM crm_bid_notices n [JOIN...] WHERE [全部条件]
```

COUNT 必须扫完所有匹配行才能返回，无法 LIMIT 提前终止。带关键词时 2.9s，是 LIMIT 查询（0.4s）的 **7 倍**。

### 瓶颈 #2：LIKE '%keyword%' 前缀通配符（无法走索引）

**位置**：`search.routes.ts` L106

```sql
n.title LIKE '%medical%' OR n.description LIKE '%medical%'
OR qzh.title_tr LIKE '%medical%' OR qen.title_tr LIKE '%medical%' ...
```

8 个 `LIKE '%...%'` 条件，任何 B-tree 索引都无法加速。EXPLAIN 确认：主表走 `idx_is_expired` 扫 50,223 行后逐行 LIKE 过滤。

### 瓶颈 #3：FEATURED_NOTICE_EXISTS 三路子查询

**位置**：`notices.ts` L97-103

```sql
n.converted_opp_id IN (SELECT o1.id FROM crm_bid_opportunities o1 WHERE ...)
OR n.notice_id IN (SELECT o2.source_notice_id FROM ...)
OR n.reference IN (SELECT o3.reference FROM ...)
```

EXPLAIN 显示：子查询 o1 和 o3 走 ALL（全表扫描 2,721 行），缺少 `(is_qualified, status, audit_status)` 和 `(reference)` 索引。三路 OR 阻止半连接优化。

### 瓶颈 #4：deadline_ts 表达式破坏索引

**位置**：`search.routes.ts` L91-92

```sql
IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts) >= UNIX_TIMESTAMP(NOW())
```

函数包裹列 → 索引 `idx_deadline_ts` 完全失效。

### 瓶颈 #5：页级 N+1 查询

**位置**：`search.routes.ts` L174-192

每页额外 2 次 SQL（精选标注 + 文件计数），叠加在 3s 主查询上。

### 瓶颈 #6：内存缓存命中率低

TTL 仅 60s、上限 200 条。翻页/换关键词/换筛选 → 缓存 miss → 重新全量查询。

---

## 三、优化策略与实施方案

### 策略 F：缓存层增强（改动最小，立即生效）

**修改文件**：`search.routes.ts` L21-23

```typescript
// 当前
const NOTICE_SEARCH_CACHE_TTL = 60 * 1000;    // 60s
const NOTICE_SEARCH_CACHE_MAX = 200;

// 优化
const NOTICE_SEARCH_CACHE_TTL = 5 * 60 * 1000; // 5 分钟
const NOTICE_SEARCH_CACHE_MAX = 500;
```

COUNT 结果单独缓存（与分页数据解耦），翻页时复用。

### 策略 A：COUNT 异步化 / 估算化

**修改文件**：`search.routes.ts` L155-158

- 首页返回精确 COUNT，后续翻页复用首页 total（缓存 5 分钟）
- 无搜索条件时用 stats 缓存的 active 数（已有 10 分钟缓存）
- 可选：COUNT 超时 2s 时返回估算值（`EXPLAIN` 的 rows 估算）

### 策略 C：deadline_ts 归一化生成列

**修改文件**：`schema.ts` + 全部 `deadlineSecExpr` 引用（约 8 处）

```sql
ALTER TABLE crm_bid_notices
  ADD COLUMN deadline_sec BIGINT GENERATED ALWAYS AS (
    IF(deadline_ts > 100000000000, FLOOR(deadline_ts / 1000), deadline_ts)
  ) STORED,
  ADD INDEX idx_deadline_sec (deadline_sec);
```

所有查询中 `IF(n.deadline_ts > ...)` 替换为 `n.deadline_sec`。

### 策略 B：MySQL FULLTEXT 索引替代 LIKE

**修改文件**：`schema.ts`（建索引）+ `search.routes.ts` L101-108（查询改写）

```sql
ALTER TABLE crm_bid_notices
  ADD FULLTEXT INDEX ft_notice_title_desc (title, description) WITH PARSER ngram;
ALTER TABLE crm_notice_translations
  ADD FULLTEXT INDEX ft_tr_title_desc (title_tr, description_tr) WITH PARSER ngram;
```

搜索改为：
```sql
WHERE MATCH(n.title, n.description) AGAINST(? IN BOOLEAN MODE)
   OR MATCH(qzh.title_tr, qzh.description_tr) AGAINST(? IN BOOLEAN MODE)
```

注意：ngram parser 支持中日韩分词，`ngram_token_size=2`。需 MySQL 5.7.6+。

### 策略 D：精选判定预计算

**修改文件**：`schema.ts` + `notices.ts` + `search.routes.ts` + 新建定时任务

在 `crm_bid_notices` 上加 `is_featured TINYINT DEFAULT 0` 列 + 索引，由定时任务维护。搜索时 `WHERE n.is_featured = 1` 走索引。

### 策略 E：翻译搜索降级为可选

**修改文件**：`search.routes.ts` L101-108

- 默认只搜 `n.title` + `n.reference`
- 用户勾选"搜索译文"时才 JOIN 翻译表
- 或：将翻译标题冗余到主表 `title_zh` / `title_en` 列

---

## 四、预期性能提升

| 优化组合 | 搜索耗时（预估） | 提升倍数 |
|---|---|---|
| 当前基线 | ~3,500ms | — |
| F（缓存增强）+ A（COUNT 缓存） | ~500ms（命中）/ ~2,500ms（miss） | 缓存命中 7× |
| + B（FULLTEXT） | ~200ms（miss） | 17× |
| + C（deadline_sec 生成列） | ~150ms | 23× |
| + D（is_featured 预计算） | ~100ms | 35× |
| 全部命中缓存 | <5ms | 700× |

**推荐实施顺序**：F → A → C → B → D → E（按收益/成本比排序）

---

## 五、修改文件清单

| 文件 | 修改内容 | 对应策略 |
|---|---|---|
| `server/routes/notices/search.routes.ts` | COUNT 缓存、FULLTEXT 查询改写、deadline_sec 替换、缓存 TTL | A/B/C/E/F |
| `server/db/schema.ts` | FULLTEXT 索引、deadline_sec 生成列、is_featured 列+索引 | B/C/D |
| `server/services/notices.ts` | FEATURED_NOTICE_EXISTS 替换为 is_featured 列查询 | D |
| `server/services/autoTranslate.ts` | deadlineSecExpr 替换为 deadline_sec | C |
| `server/routes/opportunities.routes.ts` | deadlineSecExpr 替换 | C |
| `server/routes/notices/detail.routes.ts` | deadlineSecExpr 替换（如有） | C |

---

## 附录：EXPLAIN 诊断原始数据

### 关键词搜索

```
table | type          | key              | rows  | Extra
n     | ref_or_null   | idx_is_expired   | 50223 | Using index condition; Using where; Using temporary
qzh   | eq_ref        | uk_notice_lang   | 1     | Using index condition; Using where; Distinct
qen   | eq_ref        | uk_notice_lang   | 1     | Using where; Using index; Distinct
```

### 精选过滤

```
table | type   | key                 | rows  | Extra
n     | ref_or_null | idx_is_expired  | 50223 | Using index condition; Using where
o3    | ALL    | null                | 2721  | Using where
o2    | range  | idx_source_notice   | 5760  | Using index condition; Using where; Using MRR
o1    | ALL    | null                | 2721  | Using where
```
