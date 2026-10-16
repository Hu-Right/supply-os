# ADR-0010：公告×品目节点码倒排表（crm_notice_backbone_nodes）

**日期**：2026-10-11（2026-10-12 更新状态：表已建、已全量灌完，读侧第一站已切）
**状态**：已采纳并已落地（写入方 `90bbdc54`、读侧 recommend `bd0bd863`、结构基线 `138c589d`）
**相关**：ADR-0002（宽表单一写入者）、ADR-0007（派生列由构建方算）、`docs/superpowers/specs/2026-10-11-notice-backbone-attachment-design.md`

## 结论

新建一张纯派生的倒排表 `crm_notice_backbone_nodes(notice_id BIGINT UNSIGNED, node VARCHAR(16))`，
主键 `(notice_id, node)`、索引 `idx_node(node, notice_id)`，内容就是宽表
`crm_notice_search.backbone_path` 那一条逗号串的行化镜像（一行一个节点码，含全部祖先）。
唯一写入方 `src/lib/services/search-sync/notice-nodes.ts`，写入时机挂在宽表的三个既有收口点
（`upsertWideRows` / `purgeNoticeSearch` / `reconcileGhostRows`），门禁 BB14 断言镜像关系。

读侧目标形状（推荐召回、首页热门、检索 MySQL 兜底、行业墙）：按节点码 `IN` 走 `idx_node`
的 range，再按主键回主表，一趟 JOIN 同时出候选集与加权分。

## 理由（全部实测，2026-10-11，同一台库同一轮交错跑）

| 写法 | 候选召回 | 完整主查询 | EXPLAIN |
| --- | --- | --- | --- |
| 宽表 `backbone_path` 上 OR 若干 `FIND_IN_SET` | 2.4s / 3.8s / 1.4s | 5.2s / 9.8s | `type=ALL`，每次扫 677,629 行 |
| 同形制倒排表按码 `IN` + 一次 JOIN | 0.09s / 0.05s / 0.04s | 0.68s / 0.85s | `range` 覆盖索引 → 主表 `eq_ref` |

（探针110 / 探针111 / 探针112；倒排那一列的替身是现成的公告↔旧码桥表，
767k 行、`(code, notice_id)` 有覆盖索引 —— 键换成节点码后形状一模一样。）

`FIND_IN_SET` 是「对列值做函数」，任何索引都帮不上；这不是调参能救的，是关系形状错了。
多值塞进一列（逗号串）在写入侧省了一张表，在读取侧就把每次「按码找公告」变成整列扫。

规模（探针107，SQL 数逗号与应用侧拆 token 两条路对拍一致）：353,875 条公告 →
**1,508,793 行**（均值 4.3，最大 5,279），全库只用到 13,265 个不同节点码。

## 被否决的方案

- **只靠缓存 / 重建宽表**：宽表已经有 `backbone_path`，重建多少次都不会让 `FIND_IN_SET` 用得上索引。
- **把节点码写进公告↔旧码桥表**（767k 行，比新表小一半）：那张表由爬虫侧拥有，
  我们的同步去加列/写行就是第二个写入方，直接撞 ADR-0002 那条红线（历史上两处各写一份已经
  实测产出 8,367 行描述错值）。
- **链顶口径（只存最深落点，不存祖先）**：行数能省一半，但会破坏「祖先全存」这条既有不变量
  ——交集最深层 == 逐对 sharedDepth 最大、`rootNodes` 压集不改并集，这两条断言都靠它。
- **`level` 冗余列**：层级由码长唯一决定（`backboneNodeLevel`），存一列就是造第二个事实源。

## 两条被实测推翻的假设（记下来免得再踩）

1. **「这台库 buffer pool 只有 128 MB，索引必须压字节」→ 错**。真值是 2 GB
   （`@@global.innodb_buffer_pool_size = 2,147,483,648`；`Innodb_buffer_pool_pages_total`
   131,072 × 16 KB 页也算出 2 GB）。当时 `SHOW VARIABLES` 里那个 134,217,728 是
   `innodb_buffer_pool_chunk_size`，读错了行。据此提过的「node 列用 ascii」作废。
2. **「码值列就该上 `utf8mb4_bin`」→ 在本库会埋雷**。`crm_commodity_backbone.code`、
   `crm_notice_search.backbone_path`、公告↔旧码桥表的 `code`、
   `crm_user_interest_codes.code` 实测全部是 `utf8mb4_0900_ai_ci`（探针115）。排序规则不一致时
   MySQL 要么报 Illegal mix of collations，要么把其中一侧转成另一侧的字符集 —— 转列就是函数作用在
   列上，索引静默失效。所以 `node` 跟表默认走，不做例外。
   代价：`_ai_ci` 不区分大小写，而本表只由代码写入（值来自 `backbone-path` 纯函数），
   写入侧造不出小写变体；BB14 的逐集合对拍再兜一道。

## 落地清单（顺序不能颠倒；括号里是 2026-10-12 的实测状态）

1. `npx tsx scripts/ops/commodity-notice-nodes-ddl.ts --preflight` → 人工看过再 `--apply --yes`（生产 DDL）
   —— **已做**：`--preflight` 复核过形制（列类型/主键/`idx_node`/排序规则）后才 `--apply`
2. `npx tsx scripts/ops/commodity-notice-nodes-backfill.ts --dry` → `--apply --yes`（1,508,793 行，
   按游标分块、先删后插、可 `--from-id` 续跑）—— **已做**：443 块 / 353,875 公告 / 357s / miss 0；
   随后 `--only-changed` 差量重灌过一次 4,029 条公告（起因见「实测发现」第 4 条）
3. `npx tsx scripts/gates/check-commodity-backbone.ts --db` → BB14 从 WARN 转绿（行数闭合 + 抽样 300 条逐集合对拍差异 0）
   —— **已转绿**：最新一轮两侧 1,542,269 行 / 359,815 公告一致，非法 token 0、前缀不对 0
4. 读侧切索引 JOIN（必须在 1~3 之后，否则读一张空表会把推荐和热门静默打成空结果）
   —— **只完成第一站**：recommend 召回已切（`bd0bd863`）；
   首页热门、检索 MySQL 兜底、行业墙仍未换（时延见「实测发现」第 2 条）
5. 部署带 `notice-nodes` 写入方的代码（表缺失时该模块自动降级、只警告一次，所以第 1 步没做也不会坏）
   —— **未做**：生产实例还没带运行期写入方，部署前新公告只能靠定时跑 `--only-changed` 补

补：这张表的 DDL 已重导入结构基线 `db/schema/baseline.sql`（95 → 96 张表，提交 `138c589d`），
CI 的 e2e job 因此能把它一起建出来；建表/灌数脚本本身仍在 `scripts/ops/`（忽略区），不进仓库。

注：`scripts/ops/` 与 `docs/数据库设计/` 都在 `.gitignore` 里（只有 `docs/adr/` 入库），
所以建表/灌数脚本只存在于执行机上 —— 这份 ADR 是把「为什么要这张表、按什么顺序上」钉进仓库的地方。

## 落地后的四条实测发现（2026-10-11 至 10-12，表已建、已全量灌完）

1. **打分不能一起换成倒排表**。收窄候选用 `cand.node IN (…)` 没问题，但加权命中必须继续读
   公告自己的完整路径列：`cand` 只包含谓词集（按 `rootNodes` 压到最浅覆盖集）那些行，被压掉的
   深层落点不在行里，`MAX(cand.node = 深层码)` 永远是 0。写错了的实况：三个真实用户首页前 5 条
   的 `reco_score` 只剩 1~2 个不同值、兴趣分占归一分母约 0.4%（探针117），排序退化成人人只看
   截止时间；改回列值打分后同一批用户变成 3~5 个不同值（0.807901 / 0.795 / 0.682016 …）。
2. **下一项：把主查询拆两步**。端到端冷路径实测 1.9s / 7.2s / 2.4s（探针117），瓶颈已不在召回
   （纯打分查询 148ms / 619ms / 184ms），而在主查询对全部候选组（最多 8,843 组）每行都跑商机
   描述子查询 + `GROUP_CONCAT` + 译文 JOIN，而 `LIMIT 20` 只留 20 行。拆成「先算分取 40 个 id、
   再只补给这 40 行重字段」同轮交错实测 186ms / 690ms / 256ms，而单趟形状是 501ms / 2,984ms /
   1,078ms（探针118）—— 差 2.7~4.3 倍，下一步就动这里。拆完再把首页热门（3.3s）、检索 MySQL
   兜底（738ms）、行业墙一起换过来。
3. **部署前桥表不会自己长**。运行期写入方（`search-sync/notice-nodes.ts`）已入库但生产实例还没带
   它，新公告只能靠定时跑 `--only-changed` 补；本次实测两边一起长了 33,476 行 / 5,940 条公告，
   镜像关系跟得上，但那是重跑脚本的功劳不是自动的。
4. **上游列会被活进程写坏，而指纹不自愈 —— 根因未定位**。建表前一轮门禁 BB1~BB13 全绿，
   建表后重跑突然 BB7 报 5,840 条「挂了码而 `backbone_path` 为空」、BB10 差异 309/1,298。
   这就是 ADR-0007 记过的失效模式：构建侧骨架索引没载入成功就写 NULL，而源指纹不含该列 ⇒
   后续同指纹直接跳过写入，坏值不自愈。处置（历史动作；`commodity-backbone-path-backfill.ts` 与桥表均已随后退役删除，现由落点表派生 `backbone_path`）：`commodity-backbone-path-backfill.ts --apply --yes
   --only-changed` 扫 607,999 行修回 4,247 行（miss 0），然后桥表 `--only-changed` 只重灌受影响的
   4,029 条公告 / 23,884 行（同值跳过 235,971），BB7/BB10/BB14 重新全绿。
   **必须说清：本次没拿到那个进程的日志，也没把它停掉** —— 本机只确认存在一个在跑宽表同步的应用
   进程（监听 3000），「谁在写 NULL」这一条仍属待查，不能当成已定位。兜底手段只有两道：
   BB7（空值零容忍）+ BB10（同口径重算对拍），所以任何时候 `check:backbone --db` 红都必须先查
   这张表的上游，而不是先怀疑镜像。
