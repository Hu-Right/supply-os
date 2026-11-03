# ADR-0016 机构身份归一唯一口径 = buyer 实体（退役 agency_aliases）

日期：2026-10-31
状态：已采纳

## 背景

机构（=买家=agency，本仓统一称「机构」，实体表列名沿用 `buyer`）此前有两套并行归一体系：

1. **旧体系 `agency_aliases`**：别名 → canonical + `name_i18n`，无国家/实体维度，`normalized_alias` 全局唯一。
2. **新体系 `buyer` / `buyer_alias` / `buyer_candidate`**（2026-10-30 建）：国家维实体（entity_key）+ 别名 + `name_zh` + 未命中候选队列，服务表 `notice_public` 以写时快照列投影（`buyer_id / buyer_name / buyer_name_cn / buyer_group`）。

两套并存期间，构建期先用旧表把原始名 canonical 化、再去匹配 `buyer_alias`，形成双重归一：
旧表 canonical 与 `buyer_alias.alias` 不逐字一致时实体失联；旧表还带进 `FRANCE → GIE…`、`SA → …`、
`BANK → IsDB` 这类通用短别名误合并。同时读侧展示链（`agencyI18n` / 机构下拉聚合 / 别名读时解析）
已于 2026-10-31（737df0b5）整体退役，旧表只剩「写侧 canonical 化」一个用途。

只保留一个口径的取舍依据（2026-10-31 真库只读画像，证据见 `temp/buyer-agency-profile.json`）：

| 维度 | buyer 实体体系 | agency_aliases |
|---|---|---|
| 规模 | 87,066 实体 / 98,326 别名 | 10,126 别名（无实体） |
| 中文名覆盖 | `name_zh` 99.94%；服务表 `buyer_name_cn` 92.80% | `name_i18n.zh` 50.5%；近期样本读时命中 13.9% |
| 国家维度 | 有（同名跨国不合并） | 无 |
| 未命中闭环 | `buyer_candidate` 队列 | 无 |
| 迁移成本 | — | 96.6% canonical 已是 buyer、95.2% alias 已在 buyer_alias、仅 208 条旧表独有中文名、17 条中文名冲突 |

## 决策

**保留 `buyer` 实体体系作为机构身份的唯一权威与唯一归一入口；`agency_aliases` 整表退役。**

- `buyer` / `buyer_alias` / `buyer_candidate` + `buyer.name_zh` 是机构主数据与中文名唯一落位。
- 服务表 `notice_public` 的 `buyer_*` 四列是**写时快照**（读路径零解析），由唯一写入者
  `notice-public/build.ts` 产出；读侧（列表/详情/预览/相似/收藏）只消费快照列，前端取值链
  `buyerNameCn || buyerName`。
- `agency_types` / `agency_type_rules` / `agency_type_assignments` **保留**：它们是
  `buyer_group` 的类型分类规则（不是竞争口径）。
- `agency/placeholder.ts` 的占位平台名/爬虫噪声名判定**保留**（写侧质量闸门）。
- 旧读链（`resolveAgencyDisplay`、`enrichAgencyI18n`、`/api/notices/agencies`、机构聚合缓存与预热）
  已退役，不再恢复。

## 实现（本次代码收敛）

| 落点 | 职责 |
|---|---|
| `src/lib/services/buyer/normalize.ts` | 全项目唯一归一键：NFKC + 控制字符/空白折叠 + trim + 大写。不做去重音/去标点（宁可漏合不可错合）。 |
| `src/lib/services/buyer/entity-index.ts` | 唯一读 `buyer_alias ⋈ buyer` 的入口：国家维精确命中 → 全局唯一实体回退 → 歧义不猜（同国同归一键映射多实体返回 null）。索引额外登记 `canonical_name` 本身。 |
| `src/lib/services/notice-normalize/notice-core.ts` | 只负责「挑原始列」（agency_full > agency → organization 首段）+ 剔除占位/噪声 + 国家解析 + 类型分类；**不再做别名 canonical 化**。 |
| `src/lib/services/notice-public/build.ts` | 原始名 → `resolveBuyerEntity` → `buyer_id / buyer_name(=canonical) / buyer_name_cn(=name_zh) / buyer_group(=实体组 ?? 类型分类)`。 |
| `src/lib/services/buyer/candidates.ts` | `buyer_candidate` 唯一写入入口；`occurrence_count` 改为「当前未匹配公告数」（旧实现按重建轮次累加，出现 41 万 > 总行数的假计数）；入口过滤 Error 5xx/URL/纯标点/纯数字噪声。 |
| `src/lib/services/buyer/refresh.ts` | 买家改名/合并/补中文名后的传播：按受影响 `notice_pk` 重建服务表投影 → `syncWideIds` 重算宽表 → 失效搜索缓存（Meili 由宽表级联）。 |
| `scripts/gates/check-buyer-ssot.ts` | 门禁 B1~B4：旧表不得回潮、buyer 三表 SQL 收口、构建器必须走 `resolveBuyerEntity` 且优先 agency_full、归一键唯一。 |

## 验证（2026-10-31 实施当日）

- `npm run typecheck` 通过；`npm run lint`（含新门禁 `check:buyer-ssot`）全绿；
- 单测 297 文件 / 2,579 用例通过；集成测试 24 文件 / 167 用例通过；
- 真库只读 dry-run（`temp/verify-buyer-ssot.ts` / `temp/verify-buyer-fulltable.ts`）：
  - 索引：98,326 条别名 + 87,066 个 active 实体 → 覆盖 116 个同国冲突键（歧义收敛后无静默错挂）；
  - 20k 近期样本：旧实体→新解析一致 19,006、旧实体→新不猜 0、旧未匹配→新可解 68；
  - 全表 727,948 行（buyer_name 非空）：一致 726,441、id 变化 56（均为 PH 同名重复实体，canonical 相同）、
    旧实体→新不猜 23（country 为 NULL 的歧义行）、旧未匹配→新可解 342。
  ⇒ 写侧切换不会误改既有实体归属；可直接安排一次全量/按买家重建投影（先 dry-run 再 --apply）。

## 中文名纯度（2026-10-31 追加，用户拍板「中文名就是纯中文」）

**标准**：`buyer.name_zh` 只允许汉字、数字与中文标点；**不允许任何外文字母/原文缩写**
（「中文（Eskom）」这种混排也不行，品牌/缩写必须译成中文或音译）。

落地：

- 判定与兜底：`src/lib/services/buyer/normalize.ts` 新增 `isPureChineseBuyerName` /
  `isTooGenericBuyerName`（拒绝「有限公司」这类只剩通用词的假名）/ `stripForeignSegments`（确定性剥外文）。
- 存量清洗（一次性）：`buyer.name_zh` 混排 **12,023 条** → 规则剥离 4,052 + DeepSeek 意译 7,930 +
  人工收尾 36 + 兜底 41（逐条校验纯度与“非通用词”）→ **0 条混排**。
- 服务表投影：`notice_public.buyer_name_cn` 一次性回填 **62,061 行**（此前 64,162 行含外文）；
  一次性显示字段修正走 SQL（与此前 `sync-all-buyer-zh` 同口径），此后买家变更仍只走
  `notice-public/build.ts` / `buyer/refresh` 唯一写入者链路。
- 顺带清掉 **56 个**“页面错误句/翻译幻觉”垃圾实体（`name_zh` 为空、canonical 是整句英文，如
  `The "City Clean" is a common public service announcement`）：状态置 `rejected`，
  201 行服务表买家字段清空（回到“买家未识别”诚实态）。
- 防回潮：门禁 `check-buyer-ssot` 新增 **B5**（tracked 台账 `buyer-name-zh-seed.tsv` 的 name_zh
  不得含拉丁字母）；`scripts/tools/verify-buyer-name-zh.ts` 巡检 buyer/服务表/台账三面；
  `buyer-name-zh-seed.ts` 加载器拒收非纯中文行。
- 结果：`buyer.name_zh` 87,010 条**全部纯中文**（0 外文）；服务表 `buyer_name_cn` 726,793 条
  （占“有买家名”行 **99.85%**）0 外文；台账 0 行混排。
- 长尾：1,062 条进入人工复核清单（规则剥离后名称偏简 / 兜底产出），不影响纯度但影响译名质量。

## 未匹配买家的展示兜底（2026-10-31 追加）

列表/详情仍有英文机构名的根因不是译名，而是**新爬到的公告买家没有实体/别名**（`buyer_id IS NULL`，
前端只能回退 `buyerName` 英文原名）。实测最新 200 行里 64 行如此（比利时/坦桑尼亚等新源批次）。

一次性补齐（`temp/resolve-unmatched.ts` / `temp/fix-last-unmatched.ts`，产物 `temp/unmatched-resolved.tsv`）：

- 未匹配 **866 组 / 1,121 行** → 噪声 24 组清空买家字段（显示“未提供”，不再显英文垃圾名）+
  复用已有实体 2 组 + 新建实体 **854 个**（机翻纯中文名，40 组长名称人工定名）；
- 同步写 `buyer_alias`（清洗名 + 原串双别名，保证下次重建命中同一实体）；
- `buyer_candidate` 对应候选置 `merged`（pending 2,998 → 1,357）；
- 结果：服务表“有买家名”行 **727,887 行全部有实体 + 纯中文名**（unmatched_named = 0），
  最新 200 行 0 行缺中文；`buyer` 新增 839 个实体（active 87,849）。
- 口径说明：这是一次性存量补齐（同 10-30 批次的人工判读 + 机翻混合流程），不是“自动建实体”的
  长期策略——新爬到的买家仍应先入候选队列、人工确认后再建档。

## 后果与遗留（必须继续推进）

1. **数据迁移**（一次性）：旧表独有 208 条中文名 + 17 条中文名冲突需人工落位 `buyer.name_zh`；
   有效别名按归属迁入 `buyer_alias`（补国家维度）；通用短别名（FRANCE/SA/BANK/UK/MoE…）**弃用不迁**。
   迁移完成并观察后再 `DROP TABLE agency_aliases`（先备份）。
2. **跨仓依赖**：`intelligence-daily` 仍有 3 处读 `agency_aliases`
   （`server/src/modules/announcement/agencyI18n.ts`、`server/src/modules/report/overview.ts`、
   `packages/contracts/src/report.ts`，用于来源机构分布/公告展示）。删表前必须改读 `buyer` 三表
   或 supply-os 服务表，否则 CRM 报表会破。
3. **投影回填**：服务表现有行按新口径重建一次（先 dry-run 看未匹配变化）；此后买家数据变更走
   `refreshBuyerProjection`，不再依赖 `--changed` 水位（水位看不见买家改名）。
4. **实体自身债务**（保留体系也要修，不能视而不见）：`entity_key` 无法用单一公式复现
   （最佳拟合仅 62.7%）；同国同名重复实体 39 组/78 行；同国同归一键映射多实体 194 组/451 行
   （新索引已选择「歧义不猜」兜住运行时，但需人工清理别名）。
5. 服务表 `notice_public.buyer_id` 缺索引；跨表按别名 `UPPER(TRIM())` 比对无表达式索引
   （实测 11.4s），批量运维/对账前补索引。

## 附：为什么不保留旧表

若保留 `agency_aliases` 为主口径，需要给它补国家维度、实体 id、中文名权威、候选队列与
98k 别名的迁移，并重灌已按 `buyer_id` 投影好的 92.8% 服务表行——成本远高于把旧表 208+17 条
人工收尾后删除。旧表的真实价值（人工核验译名）已被 `buyer.name_zh` 承接（37,659 条台账入库），
留下它只会让「双重归一」继续存在。

## 参考

- 读侧链退役提交：`737df0b5 refactor(search): 机构 i18n 读侧链整体退役`
- 历史决策：[ADR-0015](0015-buyer-display-alias-only.md)（已被本 ADR 取代）
- 数据画像：`temp/buyer-agency-profile.json`（2026-10-31 只读实测）
- 表结构：`db/schema/baseline.sql`（`buyer` / `buyer_alias` / `buyer_candidate`）
