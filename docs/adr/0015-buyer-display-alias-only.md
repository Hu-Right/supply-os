# ADR-0015 买家名中文展示只认别名表登记名

日期：2026-10-29
状态：已采纳

## 背景

公告卡片与详情页用响应字段 `agencyI18n` 展示买家的中文名，前端取值链是 `notice.agencyI18n || notice.buyerName`。2026-10 之前这条链上叠加了三类问题：

1. **两条链两种结果**：列表走 `search-orchestrator/format.enrichAgencyI18n`（别名表 → 分类下拉命中 → 机构类型推断 → 国家终兜底），详情走 `agency/resolve.resolveAgencyDisplay`（别名表 → 头名模式）。同一条公告列表是中文、详情是英文，而详情页先铺列表缓存再覆盖，结果是卡片的中文名盖住详情的真名。
2. **聚合类别名占据买家字段的位置**：`buyer_group`（`crm_agency_classifications`）的语义是"按国家 + 机构类型聚合"，与"具体是谁"无关。它作为兜底层混进展示后，`Conseil Départemental de la Charente`（法国·地方政府）显示为「法国各机构」——一个类别名冒充了买家名。
3. **机械拼接的头名**：`translateByPattern` 取机构类型后缀的头名拼中文尾，产出 `PHILIPPINE RECLAMATION管理局`、`NATIONAL PRIVACY委员会` 这类自造名。

同期由真库探针另抓到一个显示层硬 bug：处理“缩写形态”的正则（`CONS` / `CIS…` / `CONDERG` / `INST` 四类前缀，改了 3 处规则）同时带 `/i` 又缺词尾边界，把外语全名的前缀当缩写吃掉，`Conseil Départemental de la Charente` 显示成「eil Départemental de la Charente联合体」（取样 300 行内 6 例）。

用户裁定（2026-10-29）：买家名要求**绝对准确**，宁可显示原文，也不接受类别名或自造名冒充。

## 决策

**买家中文展示的唯一来源 = `agency_aliases` 表里登记过的译名**（判定式：`resolveAgencyDisplay().i18nFrom === "alias"` 且 `i18n.zh` 含汉字）。列表、详情、预览共用同一条链、同一个口径。

- 表内无登记中文名时**不下发译名**：详情在 `locale` 分支显式下发 `agency_i18n = ""`（即使该行已有匹配），否则与列表缓存 `{...preview, ...detail}` 合并时会残留上一次下发的名字——前端回退真实 `buyerName`。
- **聚合与派生层不得流入买家展示**：`classifyAgencyType`、下拉缓存命中（`readGroupHit/readTypeHit`）、`countryZhOf` 终兜底、`translateByPattern` 合成名，全部不再作为 `agencyI18n` 下发。
- `buyer_group` 的**聚合语义保留**：仍用于筛选、分组计数与"按国家/类型聚合"的视图，只是不得写进买家名字段。
- **归一化（canonical）不受本决定约束**：canonical 仍按原分层（表 → 模式 → 兜底）供数据侧使用；本次只收紧"展示"。
- 为让口径可被测试钉住，`AgencyDisplay` 新增 `i18nFrom: "alias" | "pattern" | null` 标记译名来源。

## 取证

全部来自只读探针 `runtime/probe-c-registry.ts`（真库；`START TRANSACTION READ ONLY` + `max_execution_time=15000` + 结束 `ROLLBACK`，对生产库零写入）。取样 = `notice_public` 按主键倒序近 3000 行的 `buyer_name`：

| 指标 | 实测 |
| --- | --- |
| 表登记中文名（会下发） | 10 行 / 0.3%（集中在少数机构，按行重复） |
| 模式合成头名（本决定撤掉） | 320 行 / 10.7% |
| 无中文译名（`agencyI18n` 不下发） | 2670 行 |
| 残缺名（前缀被吃） | 修复前 6 例 / 300 行 → 修复后 **0 例** / 3000 行 |
| 头部机构登记覆盖 | 近 20000 行按公告量 top **60 个机构名中 19 个已有登记中文名（约 32%）** |

（本表只说 `agencyI18n` 一个字段；**买家列在页面上实际显示什么另有一层优先项**，见下面「订正」。）

最后一行是本决定最重要的量级信息：**随机长尾几乎无登记名（0.3%），但公告量头部覆盖已达 32%**——`SYSTEM FOR AWARD MANAGEMENT`(1374 条)、`MoF-KR`(300)、`KIO`(144)、`Úrad pre verejné obstarávanie`(115)、`MoE`(101)、`ADB`(36) 等都有；缺的是头部里剩下那 41 个（含 `Namport – Namibian Ports Authority`、`SOUTH WEST REGIONAL HEALTH AUTHORITY`、`Ministry of Land, Infrastructure, Transport and Tourism` 等）。补齐头部的收益远大于补长尾。

### 但头部那 41 个不能直接刷：结构约束（`runtime/probe-alias-dims.ts` 实测）

`agency_aliases` 共 1558 行，列为 `id / canonical / alias / created_at / name_i18n / normalized_alias / is_active / source_ref`，唯一约束是 `uk_normalized_alias (normalized_alias)`——**没有国家/实体维度**，实测同名多条登记为 0 组。后果：

- `Ministry of Health` / `Ministry of Finance` / `Ministry of Defense` / `Ministry of Education and Training` / `Forestry Agency` 这类**通用名（头部待补 41 个里占 15 个）在当前结构下登记不了**：登记一条就让全球各国的同名部门共用一个中文名，且 canonical 会把不同实体并成一个（污染归一化层，比显示不准更严）。实测这五个通用名**均未登记**，与结构约束一致。
- 因此本决定的供数范围是：**只补国别无关的专有名**（`SYSTEM FOR AWARD MANAGEMENT`、`Namport — Namibian Ports Authority`、`Verkehrsbetriebe Burgenland GmbH` 这一类）；通用名要么维持现状（显示原文），要么先给表加国家维度（结构变更，需显式放行，不在本 ADR 范围内）。

## 订正（同日取证）：页面买家列的第一优先源是 `buyer_translation`，不在本 ADR 覆盖面内

写上面那节时只看了 `agencyI18n` 一条链，结论下高了。同日按只读探针补取证（`runtime/probe-buyer-translation.mjs`）发现：

- 前端卡片（`NoticeCard.tsx:111`）与详情页（`NoticeDetail/index.tsx:146`）读的是 **`buyerNameCn || buyerName`**，`agencyI18n` 只在解锁块（`NoticeUnlockedDetails.tsx:97`）里仍是第一优先。
- `buyerNameCn` = `notice_public.buyer_name_cn` 列，由 `notice-public/build.ts` 从 **`buyer_translation`**（`buyer_name` → `buyer_name_zh`，`status = 'translated'`）装载。
- 实测：`buyer_translation` **6603 行**（全量 status=translated）；近 20000 条公告中 **52.7% 有 `buyer_name_cn`**（其中 49.2% 含汉字）；头部 30 个机构里命中 **24 个**（大过 `agency_aliases` 的 19 个）。

⇒ 所以本 ADR 的「只认登记名」只约束 `agencyI18n` 一个字段；**买家列的实际观感主要由 `buyer_translation` 决定**，上面那个 0.3% 不是用户看到的比例。

同一探针采到的质量证据（说明这张表也有与本文上面对抗的同一类风险）：

- `Ministry of Health → 卫生部`、`Ministry of Defense → 防卫省`、`MoE → 教育省`：**无国家限定的通用名已在全局共用**（同一个键服务所有国家）——正是本文上面论证“登记不了”的那类。
- `Hiroshima → 广岛`：地名当机构名翻译。
- `buyer_name = "The Bible does not say that the Bible is a book of prophecy."` 被整句译成中文：源头 `buyer_name` 里混进了公告正文句子（头部清单里 `The Commission shall adopt delegated acts in accordance w...` 占 18 条同一病根），翻译管线未做过滤。

**未决（需产品裁定，本 ADR 不擅自处理）**：为了防止“不准”而撤掉了模式合成名，但第一优先源仍是一张**无人复核的机器翻译表**，且通用名跨国共用的问题在它身上已经发生。二者是同一类风险、口径尚未对齐：要么给 `buyer_translation` 参加工/复核闸门（并清掉脏 `buyer_name`），要么把它也降到登记名之下。选定前不得新增第三条链。

## 后果

- **`agencyI18n` 这一路约 99.7% 的行为空**（注意：这不等于页面一定显示外文，见下方订正）。这是"绝对准确"的代价，不是漏改：旧的"卡片不露外文原文"目标被本决定**主动放弃**。要把这一路占比拉上去，唯一途径是往 `agency_aliases` 补人工核验的登记名。头部待补清单由探针【附加 4】产出（近 20000 行按公告量 top 60，tab 分隔：公告量\t原名\t当前来源），`runtime/` 与 `temp/` 均不入库，需现跑：`node --env-file=.env --import tsx runtime/probe-c-registry.ts`。
- 供数必须**逐条人工判读**录入，不得脚本批量灌（项目既有纪律），不得臆造译名。且受上述结构约束：**带国家歧义的通用名不得录入**，否则一条登记会跨国有害地作数。
- 详情/预览的同步预热改为只等别名表快照（`ensureAgencyDisplayWarmup`），**不再等聚合下拉缓存**：`getNoticeAgencies` 首次冷缓存实测 20s+（同族的 search 编排调用已改为 fire-and-forget），留在详情请求里会让新实例的首条详情撞请求超时。
- 前端取值链现状（2026-10-29 实读代码）：卡片与详情页是 `buyerNameCn || buyerName`，解锁块仍是 `agencyI18n || buyerName`。本 ADR 把 `agencyI18n` 的语义由"精确名优先"收敛为"只有精确名"；两个读取点不同源（详见上方订正节）。
- 派生的附带修复：详情载荷的 `agency_i18n` 现在恒存在（无匹配时为 `""`），消除解锁合并的残留态；同时摘掉无人消费的死字段 `platformName`（全仓无读取点），并由集成测试钉住"详情载荷顶层不得出现含下划线的键"。
- 相关提交：`5f201b4d`（残缺名根因）、`cb3e5eb3`（详情同源接线）、`7954b6da`（译名来源标记 + 详情只认表登记名）、`fa9d8f09`（买家展示全面撤桶，本决定全链落位）、`d32bc6b2`（测试断言对齐）。
