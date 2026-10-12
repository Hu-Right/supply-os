# 9. 段归属表 crm_commodity_group_segments 退役：段→大类改由骨架树推导

日期: 2026-10-11
状态: 已接受

## 结论

段归属表 `crm_commodity_group_segments`（58 行 `unspsc_prefix` → `group_code`）**从库中删除**。至此**库里不再有任何大类维表**，「段 → 32 类」的映射由骨架树自身承载：

1. **常量** `src/lib/services/commodity/groups.ts`（唯一事实源）；
2. **骨架树** `crm_commodity_backbone`：L1 32 行、且**每一行都冗余带 `group_code`**（DDL 原注：冗余到每一层，筛选与权益墙免递归查父）。段（2 位）的落点 = 该段任一 L4 类行的 `group_code` 所对应的 L1 行。

落刀沿用 ADR-0006/0008 的三段式：**RENAME → 导出 58 行可回灌 SQL → 校验行数 → DROP**。

## 判据：这张表不携带独立信息（落刀前实测，`temp/probe-seg-derivable.ts`）

| 口径 | 段数 |
| --- | --- |
| A 常量 | 58 |
| B 库内本表 | 58 |
| C1 树反推（用 L4 行冗余 `group_code`） | 58 |
| C2 树反推（走 L4→L3→L2→L1 祖先链，不信冗余列） | 58 |

- **三方逐段全等：58 段，不一致 0**；
- **反推唯一性：0 段跨多大类**（两条独立路径结论一致）；
- 骨架 L1 自带 32 个去重码，与常量一一对应 ⇒ **删表后码域不丢**；
- 库内侧零引用：视图 0 / 触发器 0 / 存储过程 0 / 外键 0；形状 58 行 / 58 前缀 / 32 码。

注意这里的判据与 ADR-0008 的父表**不同**：父表是「零运行时读者」，而本表有 3 处读者（骨架索引装载、`tree.ts` 的段级解码、`daily-sync` 白名单）。它能删是因为**读者可以零成本改走树**，而不是因为没人读。

「能推导」这个前提不是推测，而是**已有的门禁不变量**：BB4 断言「类行的段所属大类 == 自身 `group_code` == 祖先 L1 的 `group_code`」。删表把这条不变量从「两处存 + 对账」变成「一处存 + 断言」。

顺带补一条前人没量到的检查：`temp/probe58-backbone-map.mjs` 用 `MIN(l1.group_code)` 取值，会把「一段跨多大类」的退化**掩盖成一个看起来正常的数**；本次改用 `COUNT(DISTINCT …)` 逐段量唯一性。

## 代价与能力边界（明确不解决的）

- **「段」在库里不再是一等公民**。骨架 L1~L3 的 `unspsc_prefix` 恒为 NULL（实测），段只隐式存在于 L4 前缀里：58 这个数从**声明量**变成**派生量**（`COUNT(DISTINCT LEFT(unspsc_prefix,2))`）。CG5 与 `daily-sync` 的白名单都改用它。
- **CG5 的对照物换了**：从「库内表」换成「树反推」。强度没有下降——常量仍是唯一事实源，BB4 本来就在比树与常量，两处合起来覆盖「常量 ↔ 树 ↔ 段前缀」三向；每条段前缀仍被逐一钉死。
- **新增两条抛错**（不再有「取一个值算了」的余地）：同一段推出两个 L1、同一个大类码出现两个 L1 行。两者在健康库里都被 BB4/BB5 挡住，一旦出现即停线而不是静默挂错类。
- **爬虫白名单的取数源换了**：`daily-sync.cjs` 的段级粗码改由 L4 前缀推导，join 条件与旧 SQL 等价（同 `group_code` 且启用的 L1）。下一次改白名单的人必须知道：**段的权威在骨架树**。
- **回灌 ≠ 回到可用状态**：导出文件保持正名建表，回灌后 CG7 立即变红；回灌是回滚演练，演练完要重新退役。
- 库外读者不在仓库视野内、副本落 `runtime/`（gitignore、无异地备份）——免责同 ADR-0006。
- **ADR-0008 记的那条遗留就此关闭**：`segment_code`（`UGT-C-*`，无读者、来源已随旧树消失）随表一起消失，不再需要单独做一次列级变更。

## 被否决的替代方案

- **保留表当「段的显式声明」**：58 行换来的是一处必须与常量逐字对账、且已被证明零独立信息的地方；「58 段」这个事实由 CG5 的派生断言 + BB3 的段唯一性断言同样守住。
- **改成「常量直接生成映射、不读库」**：这正是现在的做法（内存推导），但那样就没有任何库内校验；所以保留 CG5 对**树反推**的比对作为机器证明。
- **保留表、运行时改走树**：等于留一个必须跟着骨架重排走的表——重排一次就要重灌一次，而它对读端零增量信息。
- **连骨架的 `unspsc_prefix` 列一起删**：段/族/类三级前缀是筛选与派生的实际键（BB7/BB10 依赖），删列等于删掉换算能力，不做。

## 生效与失效条件

**生效（2026-10-11 实测）**：库里以 `crm_commodity_group` 开头的表一个都不在场；`db/schema/baseline.sql` 重导后 **95 张表**；`check:commodity-groups --db` 打印「树反推段归属 58 段 / 骨架 L1 大类码 32 个 / 大类维表族 已退役」且 CG1~CG7 全绿；`check:backbone --db` 的 BB1~BB13 全绿（含「可反推 族 559 / 段 58」）；vitest 214 文件 / 1990 用例全绿；运行中应用四个接口（骨架级联 ×2、热门品类、首页 SSR）全部 200。

**失效**：任何人重新建出两张表中的任一张（正名或 `_retired_*` 变体），CG7 直接红；任何 `src/**` 或 `scripts/tools/**` 里的 SQL 读它们，CG6 直接红（无库环境也能拦，CI 与本机同一道闸）。

## 影响面清单

| 位置 | 改动 |
| --- | --- |
| `src/lib/services/commodity/backbone-path.ts` | 删掉段归属 SQL；新增 `deriveSegmentRows()`：从**已载入的**骨架行内存推导段→L1（含上述两条抛错），整树仍只查一条 SQL |
| `src/lib/services/commodity/tree.ts` | 段级解码改为「L4 类行 → 同 `group_code` 的 L1」单条自连接，不再查维表 |
| `scripts/tools/daily-sync.cjs` | 段级粗码白名单改由 L4 前缀推导（join 条件与旧 SQL 等价） |
| `scripts/gates/check-commodity-groups.ts` | CG5 换基础（常量 ↔ 树反推，两方向 + 唯一性 + L1 码域）；CG6 正则扩到整个 `crm_commodity_group*` 族；CG7 覆盖两表及其退役名 |
| `scripts/gates/check-commodity-backbone.ts` | BB4 的参照物去掉库内表、只对常量；BB8 自检样本换成 `crm_notice_search` |
| 单测 3 个 | `backbone-cache`（整树一条查询、段推导退化必须抛错）、`tree`（断言改走骨架且不许碰维表族）、`wide-row-loaders`（fixture 补 `group_code`） |
| ops 脚本 | 新增 `commodity-group-segments-retire.ts`（预检含**反推闭合**证明）；`commodity-groups-seed.ts` **删除**；`commodity-groups-ddl.ts` 不再建表；`commodity-backbone-build/ddl`、`commodity-groups-v2-*`、`user-prefs-group-code-backfill` 改源或标注 |
| `db/schema/baseline.sql` | 重导（96 → 95 张表） |

`docs/superpowers/**` 与 `品目大类-v2-32类划分方案.md` 的时点记录不改写。
