# 20261111 买家中文化批次（离线引擎 + 噪声治理，全程无外部 LLM）

## 目标

清掉 `notice_public` 中「有买家名、但没有中文名」的缺口。批次开始时实测 **20,246 行 / 11,296 组**，
其中 100% 是 `buyer_id IS NULL`（实体未建档），不是译名质量问题。

## 一、译名（批次 1）

| 组件 | 文件 | 作用 |
|---|---|---|
| 音节音译 | `translit.mjs` | 拉丁/西里尔 → 汉字（声母+元音表、韵尾判定、C+l/r 复辅音、常见词尾） |
| 主引擎 | `engine.mjs` | 清洗（HTML 实体/登记码/层级串）→ 噪声判定 → 语种识别 → 结构翻译 → 纯度校验 |
| 越南语 | `engine.mjs` 内 `VN_ORG`/`VN_CHUNK`/`VN_SYL` | 汉越音 + 语序改写（`Công ty Điện lực Bắc Ninh` → 北宁电力公司） |
| 多语词典 | `engine.mjs` 内 `GLOSS`/`EXTRA_WORDS`/`CYR_GLOSS` | 英/法/西/意/葡/马来/挪/保/俄/乌 的部委、领域、设施、企业后缀 |
| 人工译名 | `manual.tsv`（136 条）、`manual-2.tsv`（199 条） | 高频机构、国际组织、希腊/罗马尼亚/挪威/越南专名 |

## 二、噪声治理（批次 2）

**发现**：源站正文被 LLM/机翻污染后，整句话被写进 agency 字段并被当成机构建档，例如
`The Bible is a book of scriptures`、`The local authority is a blessing.`、`以下是欧洲国家列表`。
批次 1 曾把这批假名也翻成中文（"圣经是一本经文之书"）。

**处置**：`src/lib/services/agency/placeholder.ts` 新增 `isSentenceNoise`（2026-11-11 口径），
写侧判定后 `buyerName` 落 NULL，服务表显示「采购方未提供」。规则高精度优先：

- 句首族：`The following / The Bible / The first is / The name of / The number of …`
- 句子形态：`^(the|a|an) …` + be 动词；长度 > 60 且含 be 动词
- 站点导航文本、同片段重复 ≥5 次、超长（>300）
- **豁免**：法定名壳 `COMMUNALNÉ PIDPRIEMSTVO "…"`（引号内是真名）与登记码前缀 `RO 361684 - …`

判定结果：**1,208 个名字 / 3,566 行**（其中 3,064 行是批次 1 误译的假机构），已按 id 重建清空。
单测：`tests/unit/lib/data/agency-i18n/placeholder.test.ts`。

## 三、落库

| 动作 | 数量 |
|---|---|
| 新建 `buyer` 实体 | 10,780 + 203 = **10,983** |
| 复用既有实体（投影陈旧） | 41 |
| 写 `buyer_alias` | 10,979（source=`crawl-zh-20261111` / `…b`） |
| `buyer_candidate` 置 `created` | 10,922 |
| 重建 `notice_public` | 19,450 + 3,588 + 565 + 22 行 |
| 清空噪声行买家字段 | 3,528 行 |

## 四、结果（2026-11-11 终态）

- `buyer` active 实体 **98,827**，`name_zh` 缺失 **0**、含外文字母 **0**；
- `notice_public` 有买家名 829,169 行，`buyer_name_cn` **829,167 行 = 99.9998%**；
- 中文名含拉丁字母 **0**、零汉字 **0**；快照与实体名漂移 **3 行**；
- `verify-buyer-name-zh.ts` 三面巡检通过；`check-buyer-ssot.ts` B1~B5 通过；`tsc --noEmit` 通过。

**残留 2 行**：`Ministry of Education`（notice 的 `country_code` 为空），库内同名实体分属 AF/WS/无国别三处，
`resolveBuyerEntity` 按「歧义不猜」返回 null —— 属正确行为，需补齐公告国别后才能解析。

## 五、回滚

`rollback-buyer-zh.sql`：按 `source` 删除本批别名，再删除已无别名的新建实体。
注意：回滚不会把 `notice_public.buyer_name_cn` 还原为空，需按受影响 `notice_pk` 重跑构建器。

## 六、质量说明

- 越南语（2,074 组）走汉越音，接近正式译名（`Bệnh viện Đa khoa tỉnh Bắc Ninh` → 北宁省综合医院）；
- 欧美小机构（结构翻译 8,500+ 组）为「领域词直译 + 专名音译」，可读但不等同人工定名；
- 长尾专名音译存在近似误差；名称长度分布：≤12 字 52%、13–20 字 27%、21–30 字 14%、>30 字 7%。

## c 子批次（同日补刀：候选池积压 1,796 条）

- 输入：`buyer_candidate` pending 1,796 条（批次 a/b 未晋升的池子，基本不在线上未解析行里，属后台积压）。
- 人工定名 **202** 条（`manual-c.tsv`，含拉黑 81：导航噪声/过程标签/多国泛名/同站垃圾句）；
  尾部引擎晋升 **785** 条（occ<20 结构/越语翻译，过糊名过滤器：总长≤16 且剥机构后缀后专名≤14）；
  其余保持 pending（头部高频未定名 20 / 拒答 / 纯音译 / 糊名 329）。
- 落库：新建实体 282、复用 704（`name_zh` 只填空缺不覆盖）、别名 1,036（source=`crawl-zh-20261111c`）、候选晋升 987。
- 结果：pending 1,796 → **809**；`notice_public` 无中文 **8 → 2**（剩 2 行 = "Ministry of Education" 多国同名泛名，按口径留原名）。
- 门禁：`verify-buyer-name-zh`（纯中文，0 外文字母）+ `check-buyer-ssot`（B1~B4）通过。
- 回滚：`rollback-c.sql`（候选恢复 pending / 删本批别名 / 删本批新建实体；重建服务表需按 notice_pk 重跑构建器）。
