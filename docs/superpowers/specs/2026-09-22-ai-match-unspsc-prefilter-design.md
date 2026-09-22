# AI 匹配粗筛升级：UNSPSC 层级匹配优先 + 词项兜底 设计文档

- 日期：2026-09-22
- 关联：`2026-09-18-外贸员供应商资源库与AI智能匹配设计.md`（本文落实其"性能优化"一节中"基于 UNSPSC 行业匹配度粗筛"的未兑现承诺）
- 影响面：仅 `lib/services/ai-match`（pre-filter + index 编排），API 契约 / 缓存 / 前端零改动

## 背景与问题

现粗筛（`pre-filter.ts`）只有"行业/产品/认证词项与公告文本的重叠度"打分：

1. 词项重叠是自由文本子串匹配，信号弱且有误命中；
2. 项目已有全平台统一的 UNSPSC 层级匹配口径（`search-orchestrator`：取最深命中层级，L4/L5 强于 L2/L3，L1 过宽不计），但粗筛完全未用；
3. LLM 为 BYOK（用户自付），候选以谁进入精评直接决定用户花钱花得值不值。

## 数据实况（2026-09-22 只读探测）

| 事实 | 数值 | 设计含义 |
|------|------|----------|
| `crm_supplier_unspsc_interests` | 1886 行，`code_id` 空值 0；level5=1619 / level4=266 / level1=1 | 供应商侧可全量走字典 id 链回溯 |
| 公告桥接 `crm_bid_notice_unspsc_codes` | 317,997 / 473,056 ≈ 67% 公告有码 | 公告侧信号可靠；无码公告自然回落词项 |
| 资源库供应商有兴趣码 | 3 / 5 | 覆盖率不足以支撑"纯 UNSPSC"，兜底必须保留 |
| 桥接表键 | `notice_id VARCHAR(100)`＝外部编号，**非** `crm_bid_notices.id` | 查询必须经 `JOIN crm_bid_notices n ON n.notice_id = b.notice_id WHERE n.id = ?` |
| 字典 `crm_unspsc_codes` | `id / level / parent_id` 链完整 | 兴趣码行 JOIN 4 级 parent 即得各级祖先 id |

## 方案：分档跳档（非加权求和）

```
排序总分 = unspscTier × 1000 + termScore
unspscTier = 供应商各级祖先 id 集 与公告各级 id 集 的最深命中层级（5..2 优先；L1 不计），不命中 = 0
termScore  = 现行词项重叠分（权重不动）
```

三种情形（同一公式的自然结果，无分支特判）：

| 供应商情况 | 效果 |
|-----------|------|
| 有码且与公告命中（L2~L5 任一层级） | 命中越深档越高，档差 1000 分词项无法翻盘 → 层级匹配主导 |
| 有码但完全不命中（跨行业） | tier=0，回落词项竞争（避免"有码行业不对"压过"无码行业对口"） |
| 无码（手动新建/pending 等） | tier=0，纯词项 + 同分按资源库添加顺序（现状行为） |

## 实现分解

### 1. `pre-filter.ts`（保持纯函数）

- `PreFilterSupplier` 增可选 `supplier_id`；新增入参 `unspsc?: { noticeLevels: Map<number, Set<string>>; supplierLevels: Map<number, Map<number, Set<string>>> }`（层级 2..5，值均为字典 id 字符串）；
- 新增纯函数 `unspscTier(...)`；`preFilterSuppliers` 打分改为 `tier×1000 + termScore`；
- 不传 `unspsc` 时行为与现在完全一致（向后兼容，既有 8 项测试不动）。

### 2. `unspsc-levels.ts`（新文件，数据加载）

- `loadUnspscMatchData(pool, noticeId, supplierIds)`：两条只读 SQL——
  - 公告：`crm_bid_notice_unspsc_codes` JOIN `crm_bid_notices`（经 `notice_id` 字符串列）取 `level2_id..level5_id` 集；
  - 供应商：`crm_supplier_unspsc_interests` JOIN 字典自身 + 4 级 parent，按每节点自身 `level` 归入各层 id 集；
- **失败兜底**：任一查询异常 → `console.warn` + 返回空映射 → 粗筛整体退化为纯词项（排序优化信号缺失不致命，绝不因它打断匹配主流程）。

### 3. `index.ts` 编排接入

- **仅在 `poolProfiles.length > PRE_FILTER_LIMIT` 需要粗筛时**才调用 loader——小库零新增开销，且不改变既有服务测试的 `pool.query` mock 调用序列（fail-safe 保证旧用例自然通过）；
- self 不参与粗筛的行为不变；缓存键、`match_results` 列、API 契约、前端均不动。

### 4. 缓存与前端确认（不改动）

- 缓存键已是 `(user_id, notice_id)`（`findMatch`/`upsertMatch`），交付要求天然满足；
- `AiEvaluationPanel` 已是多供应商排行（self 置顶 + 按分排序 + evaluated/poolSize 披露），粗筛改序对它透明。

## 测试计划

- **RED→GREEN（纯函数）**：命中跳档（L5 压 L3 压 L2）、有码不命中回落、无码纯词项、混排稳定性、未传 unspsc 向后兼容；
- **loader**：正常聚合、查询异常退化、公告无桥接行空集；
- **编排回归**：既有 `ai-match.test.ts` 14 项全绿（含"LED 粗筛"用例——loader 查询在 mock 缺省下返回 undefined，走 fail-safe 退化路径）；新增"5 家有码时按层级优先入选"编排用例。

## 已否决的替代方案

- 纯 UNSPSC 取代词项：供应商码覆盖有限（探测 3/5），大量回落场景下等于放弃粗筛；
- 线性加权和 `α×UNSPSC + β×词项`：系数无依据，词项分可能翻越层级档；
- 引入 `unspsc/tree-cache` 全树缓存：单用户 ≤50 候选 + 单公告，两条 IN 查询开销可忽略，不值得引缓存。
