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

**买家中文展示的唯一来源 = `crm_agency_aliases` 表里登记过的译名**（判定式：`resolveAgencyDisplay().i18nFrom === "alias"` 且 `i18n.zh` 含汉字）。列表、详情、预览共用同一条链、同一个口径。

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
| 无中文译名（显示真实原名） | 2670 行 |
| 残缺名（前缀被吃） | 修复前 6 例 / 300 行 → 修复后 **0 例** / 3000 行 |
| 头部机构登记覆盖 | 近 20000 行按公告量 top **60 个机构名中 19 个已有登记中文名（约 32%）** |

最后一行是本决定最重要的量级信息：**随机长尾几乎无登记名（0.3%），但公告量头部覆盖已达 32%**——`SYSTEM FOR AWARD MANAGEMENT`(1374 条)、`MoF-KR`(300)、`KIO`(144)、`Úrad pre verejné obstarávanie`(115)、`MoE`(101)、`ADB`(36) 等都有；缺的是头部里剩下那 41 个（含 `Namport – Namibian Ports Authority`、`SOUTH WEST REGIONAL HEALTH AUTHORITY`、`Ministry of Land, Infrastructure, Transport and Tourism` 等）。补齐头部的收益远大于补长尾。

## 后果

- **卡片与详情约 99.7% 的行显示外文原名**。这是"绝对准确"的代价，不是漏改：旧的"卡片不露外文原文"目标被本决定**主动放弃**。要把中文占比拉上去，唯一途径是往 `crm_agency_aliases` 补人工核验的登记名。头部待补清单由探针【附加 4】产出（近 20000 行按公告量 top 60，tab 分隔：公告量\t原名\t当前来源），`runtime/` 与 `temp/` 均不入库，需现跑：`node --env-file=.env --import tsx runtime/probe-c-registry.ts`。
- 供数必须**逐条人工判读**录入，不得脚本批量灌（项目既有纪律），不得臆造译名。
- 详情/预览的同步预热改为只等别名表快照（`ensureAgencyDisplayWarmup`），**不再等聚合下拉缓存**：`getNoticeAgencies` 首次冷缓存实测 20s+（同族的 search 编排调用已改为 fire-and-forget），留在详情请求里会让新实例的首条详情撞请求超时。
- 前端取值链 `agencyI18n || buyerName` 保持不变，其语义由"精确名优先"收敛为"只有精确名"。
- 派生的附带修复：详情载荷的 `agency_i18n` 现在恒存在（无匹配时为 `""`），消除解锁合并的残留态；同时摘掉无人消费的死字段 `platformName`（全仓无读取点），并由集成测试钉住"详情载荷顶层不得出现含下划线的键"。
- 相关提交：`5f201b4d`（残缺名根因）、`cb3e5eb3`（详情同源接线）、`7954b6da`（译名来源标记 + 详情只认表登记名）、`fa9d8f09`（买家展示全面撤桶，本决定全链落位）、`d32bc6b2`（测试断言对齐）。
