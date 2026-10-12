# 8. 品目大类维表 crm_commodity_groups 退役：口径只剩常量 + 段归属表

日期: 2026-10-11
状态: 已接受

> **后续（同日）**：本 ADR 里两处表述已被 **ADR-0009** 收窄 —— 段归属表 `crm_commodity_group_segments`
> 随后也退役了，32 类口径此后只剩「常量 + 骨架树 `crm_commodity_backbone`（L1 行 + 逐行冗余的
> `group_code`）」。下文凡把该表当作口径承载者的句子，请按 ADR-0009 读；历史正文不改写。

## 结论

品目大类维表 `crm_commodity_groups`（32 行）**从库中删除**，32 类身份不再有库内维表。口径此后由两处承载：

1. **常量** `src/lib/services/commodity/groups.ts`（`code` / `nameZh` / `sort` / `prefixes` 的唯一事实源）；界面展示名走 locale 键 `commodityGroup_<code>`（六语言）；
2. **`crm_commodity_group_segments`**（58 行段→大类归属，运行时真正 join 的那张表）+ `crm_commodity_backbone` 的 L1 32 行（`group_code` 冗余到每一层）。

落刀按 ADR-0006 定下的三段式执行：**先 RENAME 成 `crm_commodity_groups_retired_20261011`（元数据操作、瞬时、可改回）→ 导出 32 行为行定向可回灌的 SQL → 校验导出行数与表内一致 → 才 DROP**。退役后的不变量沉淀为门禁 **CG6**（静态：`src/**` 与 `scripts/tools/**` 不得用 SQL 读本表，含改名后的退役名）与 **CG7**（`--db`：正名与 `_retired_*` 都不许在场），写在 `scripts/gates/check-commodity-groups.ts`。

## 为什么可以删（判定依据，逐条实测）

| 判据 | 实测 |
| --- | --- |
| 运行时零引用 | `src/**` 全量扫描无任何 SQL 读本表；32 类身份取自常量 |
| 骨架树 L1 不依赖它 | `crm_commodity_backbone` L1 32 行的 `code`/`name_zh`/`sort` 由**常量**写入（`scripts/ops/commodity-backbone-build.ts` 的 L1 段），不是读本表 |
| 库内侧零引用 | 视图 0 / 触发器 0 / 存储过程 0 / 外键 0（退役脚本落刀前实测） |
| 零孤儿 | `crm_commodity_group_segments.group_code`（58 行 / 32 码）全部能在本表找到 ⇒ 删父表不让任何段失去归属 |
| 内容可从常量完整重建 | 32 行 = 常量里的 `code`/`nameZh`/`sort` + `status=1` |

最后一条是**这次不走观察期的唯一理由**：内容可重算 ⇒「不可逆动作实际可逆」的成本接近零。这与旧树 `crm_commodity_nodes` 有本质差别（158,707 行 / 31.7 MB，且含 80 行 `gap_note` 不可重算），所以旧树需要改名后观察，本表不需要。

## 代价与能力边界（明确不解决的）

- **丢掉 `name_zh` ↔ 常量的逐字对账**（原 CG5 的那一段）。库侧此后没有中文名，运维要中文名就看常量或 `commodityGroup_<code>` 的 locale 文案。**32 类码域仍被证明**：段归属逐段双向比对 + `COUNT(DISTINCT group_code) = 32`，任何多出来的码都必须挂在某个段前缀上，而段前缀两个方向都已被钉死（CG5）。
- **`status` 的「停用而不删行」语义消失**。退役时 32 行全为 1，没有停用行需要保留。将来若真要「停用一个类」，得先在别处定义：常量里去掉该类 = 改口径，不等于停用。这是有意的——库内不再留两处能表达「类是否启用」。
- **库外读者不在视野内**。同事的临时查询、站外任务都不属于本仓库，CG6/CG7 只证明「仓库里没人读」与「库里没有」，不替库外读者叫（同 ADR-0006 的免责）。回灌依据落在 `runtime/commodity-groups-dump-<stamp>.sql`（被 `.gitignore` 排除、无异地备份；库里没了 + 磁盘坏了就是真没了）。
- **回灌 ≠ 回到可用状态**。导出文件保持正名建表，回灌后 CG7 立即变红——回灌是回滚演练，演练完必须重新退役，不能拿它当长期兜底。
- **未一并处理的已知遗留**：本表的兄弟列 `crm_commodity_group_segments.segment_code`（`UGT-C-*`）在 `src/**` 与跟踪脚本里**没有任何读者**，其唯一来源是已下线的旧树；现由「段归属重挂」脚本原样保留、永不改写。要不要连列一起收掉，是独立的一次列级变更，不在本 ADR 范围内。

## 被否决的替代方案

- **保留维表当「名称单一事实源」**：界面名已走 locale，库里的 `name_zh` 只服务运维导出与人工对账；为一条运维可读性保留一张必须与常量逐字对账的表，等于给「同一口径两处存」留后门。这个后门已有前科：15→32 重切时表注释与列注释里的「15 类」就漂过一次，靠 `commodity-groups-v2-sync.ts` 的 `ALTER … COMMENT` 才追平。
- **删表但保留 CG5 的中文名对账**：没有表就没有对账对象，这条断言只能跟着删（现改验码域）。
- **只改名、`_retired_*` 当终态**：就是 ADR-0006 否决过的「退役停留在口头」，且会让 CG5/CG7 长期挂在「在场才执行」的分支上，谁也说不清它们还守着什么。CG7 直接红正是这个方案的替代品。
- **把退役脚本纳入版本控制**：`scripts/ops/` 由 `check-gitignore-consistency.mjs` 在 lint/CI 强制不入库；沉淀进仓库的形式是**不变量（CG6/CG7）+ 本 ADR**，不是脚本本身（照抄 ADR-0006 的结论）。
- **连段归属表一起删**（58 个段前缀理论上也能从常量推）：段归属是运行时真正 join 的表（`backbone-path.ts` / `tree.ts` / `scripts/tools/daily-sync.cjs`），宽表 `group_codes`、偏好 `group_code`、权益墙判定的重算都依赖这条 join。删它等于把「段→大类」从可 join 的事实搬回代码，不做。
- **保留 `GET /api/commodity/groups` 作为删除前的替代**：该接口只存在于设计稿（M4 未落地），当前实现第一级 chip 直接用常量 + locale 渲染，删表不影响它。若将来真要这个接口，数据源是常量而不是库。

## 生效与失效条件

**生效（2026-10-11 实测）**：库里 `crm_commodity_groups` 与 `crm_commodity_groups_%` 都不在场；`db/schema/baseline.sql` 重导后为 **96 张表**；`npx tsx scripts/gates/check-commodity-groups.ts --db` 打印「大类表 已退役」且 CG1~CG4 + CG6 全绿；`npx tsx scripts/gates/check-commodity-backbone.ts --db` 的 BB1~BB13 全绿（BB8 的自检样本已从本表换成 `crm_commodity_group_segments`）。

**失效**：任何人重新建出本表（正名或 `_retired_*` 变体），CG7 直接红并打印收尾/回滚两条命令；任何 `src/**` 或 `scripts/tools/**` 里的 SQL 重新读本表，CG6 直接红（无库环境也能拦，CI 与本机同一道闸）。

## 影响面清单（本次一并改掉的东西）

| 位置 | 改动 |
| --- | --- |
| `scripts/gates/check-commodity-groups.ts` | CG5 去掉 `name_zh` 对账、改验「库内大类码域恰 32」；新增 CG6（静态零引用）与 CG7（`--db` 退役不变量） |
| `scripts/gates/check-commodity-backbone.ts` | BB8 自检的「非旧树」样本换成 `crm_commodity_group_segments` |
| `scripts/ops/commodity-groups-retire.ts` | **新增**：退役执行器（预检 → 导出 → 校验 → 改名 → 落刀；仅 `--apply --yes` 写库，幂等） |
| `scripts/ops/commodity-groups-ddl.ts` | 不再建本表；preflight 只认段归属表，段行数改为本表自证（旧树已下线） |
| `scripts/ops/commodity-groups-seed.ts` | 收窄为「段归属重挂」：不再灌本表、不再 INSERT 段行（`segment_code` 已无来源，缺行一律阻断），只重挂 `group_code` |
| `scripts/ops/commodity-backbone-ddl.ts` | 前置事实源核对改从段归属表取去重码；原树计数与缺名体检改为「在场才跑」 |
| `scripts/ops/commodity-backbone-build.ts` | L1 来源注释改为常量（代码本来就是这么做的） |
| `scripts/ops/commodity-groups-v2-sync.ts`、`commodity-groups-v2-impact.ts` | 标注为历史脚本（依赖本表与旧树，均已下线，重跑必错） |
| `db/schema/baseline.sql` | 重导（97 → 96 张表），本表 DDL 随之消失 |

时点记录（`docs/superpowers/plans/**`、`docs/superpowers/specs/**`、`品目大类-v2-32类划分方案.md`）不改写：它们记录的是当时的判断，不是当前口径。
