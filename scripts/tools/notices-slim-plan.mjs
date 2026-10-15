/**
 * crm_bid_notices 精简清单 —— 唯一事实源
 *
 * 与兄弟表 crm_bid_opportunities 那一轮同构（见 scripts/tools/opp-slim-plan.mjs）：
 * 阶段一（建影子表改结构）与阶段二（补增量原子切换）都从本模块派生列集，
 * 不允许在脚本里各写一份清单。作业脚本：
 *   scripts/tools/notices-shadow-phase1.mjs        建 <表>__new + 改结构 + 分批回填 + 分片对账
 *   scripts/tools/notices-shadow-phase2-cutover.mjs 补增量 + 对账 + 原子 RENAME（可反切）
 * 取证脚本（判据可复跑）：
 *   scripts/tools/notices-slim-scan.mjs             静态引用全域扫描（snake+camel 双查）
 *   temp/probe231-notices-slim-evidence.mjs         现网逐列充实度/字节归因/索引实态
 *   temp/probe232-json-shape.mjs                    JSON 列「空壳 vs 真有内容」三分类
 *   temp/probe233-notices-field-check.mjs           落刀前现场核查（在场表/外键/触发器）
 *
 * 判据全部来自 2026-10-15 **云生产库**实测（645,521 行 / 55 列，id ∈ [423, 1786524111]）。
 * 库归属口径同 docs/adr/0012：列口径以云库为准，云端删列不需内网同意（内网列不会因此
 * 消失，只是不再流入云端）；但本表由 supply-os / intelligence-daily / daily-sync 三方共用，
 * 凡「兄弟系统可能在读」的列一律进 GUARDED，不得凭本仓零引用就判死。
 *
 * 分批改笔的理由：一次切换只带走「互不牵连」的一小批列，出问题时的回滚面与
 * 归因面都只有一批那么大。批次之间若有牵连（指纹表达式、索引、兄弟系统自愈），
 * 必须把牵连项写进该批的 PREREQ，未清障不得进入该批。
 *
 * ⚠️ 与并行作业的对账（2026-10-15，看到底才算数）：本表上同时有人在做精简，分两个阶段 observed：
 *   阶段一：一条 `ALTER TABLE crm_bid_notices DROP COLUMN category_l1_id, DROP COLUMN category_l2_id,
 *   DROP COLUMN response_count`（ALGORITHM=COPY，全程锁写），跑到 1042s 后从 processlist 消失。
 *   实测判定它**未落地即中止**（probe252：本表仍 55 列、三列全部在场、无 `#sql-*` 孤儿临时表、
 *   performance_schema.metadata_locks 对本表 0 条锁）。
 *   阶段二：同一作业改走影子表蓝绿重建（probe258/259 实拍）：`crm_bid_notices__new` 建于
 *   06:59:28Z，52 列，缺席列恰好是 [response_count, category_l1_id, category_l2_id]，
 *   正在用 `INSERT IGNORE INTO crm_bid_notices__new (id, notice_id, ...)` 回填（04 次采样：
 *   320,000 → 340,000 → 360,000 → 380,000 行，state=waiting for handler commit）。
 * ⇒ 结论与后续（已落地，非推测）：对方轮次于 07:12Z 切换完成，probe263 逐项核验通过：
 *   crm_bid_notices 现 52 列 / 精确 645,521 行（与切换前逐行相等）；与旧表位比只消失
 *   category_l1_id / category_l2_id / response_count 三列且无新增；3 个 FULLTEXT 齐全
 *   且 `ft_notices_search` 的 `WITH PARSER ngram` 未丢，三种 MATCH 签名逐个跑通；
 *   `deadline_sec` 仍是 STORED GENERATED（表达式未漂）。旧表位名为 `crm_bid_notices_retired_20261015`
 *   （命中 dump-schema-baseline 的 `/_retired_/` 排除，不会混进基线），它是本轮回滚物归对方处置。
 *   这三列因此**不再由本清单执行**，只靠 PARALLEL_DROPPED_COLUMNS 进防复活门禁；
 *   本作业批次一 = thresholds / ai_products（52 → 50）。
 *
 * 2026-10-15 落库终态（本仓三轮都已原子切换完毕，切换后现网逐项复验过）：
 *   批次一 52 → 50：thresholds / ai_products 消失；旧表位改名 `crm_bid_notices_retired_b1_20261015`（52 列）。
 *   批次二 50 → 49：is_converted 消失；`idx_bid_notices_converted_create_id` 已退役不在场，
 *     `idx_bid_notices_converted_opp` 按登记重建为单列 (converted_opp_id)；旧表位改名 `crm_bid_notices_retired_b2_20261015`（50 列）。
 *   批次四 49 → 48：is_qualified 消失（不挂索引、不进宽表指纹 ⇒ 本轮零索引连带、零重灌）；
 *     旧表位 `crm_bid_notices__old_20261015`（49 列，**当前唯一反滚物**）。
 *   三张旧位行数均精确 **645,521**（与切换前逐行相等），`deadline_sec` 仍 STORED GENERATED，
 *   3 个 FULLTEXT（含 ft_notices_search 的 `WITH PARSER ngram`）齐全，有效性计数 + 三种 MATCH 签名实跑通过，
 *   `EXPLAIN ... converted_opp_id` 仍走 `idx_bid_notices_converted_opp`（probe275）。
 *   批次二那 23 行 is_converted/converted_opp_id 不自洽随列一起退役，逐行留底在
 *   runtime/notices-b2-is-converted-diff-*.tsv；旧表位仍是唯一反滚物，未经人工确认不得 DROP。
 *
 * ⚠ 批次四阶段一抓到的一件库侧事实（它直接改了本文件的判据口径）：本表存在
 *   **不推进 `update_time` 的列改写**。`documents` 被外部管道把 194 行从 NULL 补成 JSON 数组，
 *   `update_time` 两边完全相等，而 `documents` 也不在 `APP_WRITABLE_COLUMNS` 里
 *   ⇒ 旧版阶段二 `--diff` 报「待补 0 行」，只有阶段一 [7/7] 的逐片列指纹对账在 60/323 片把它拦下
 *   （probe273 逐列定位为 documents×194）。因此：
 *     ① 差异检测与补增量改为**按全列行指纹驱动**（lib `findDirtyRows()`），水位列与可写列清单不再当完备性断言；
 *     ② 切换时先按指纹补写（194 行）→ 323 片一致 → 才 RENAME；切换后实测现网 documents 与本批旧位 0 行不一致
 *        （= 新内容进了生产，没被影子表的 NULL 顶掉）；
 *     ③ 对方在改前列旧值快照自留了一张 `crm_bid_notices_documents_bak_20261015`（4 列 / 194 行，
 *        CREATE_TIME 17:34:54+08:00，旧值全为 NULL）——那是**别人的在途迁移**，本作业未碰，
 *        且它已被 dump-schema-baseline 的 /_(?:bak|backup|old|copy)_?\d*$/ 排除（probe276/277 取证）。
 */

export const NOTICES_TABLE = "crm_bid_notices";
export const SHADOW_TABLE = `${NOTICES_TABLE}__new`;

/**
 * ⚠ 本表只能走影子表，不存在「直接 ALTER 删列」这条路（2026-10-15 现网实测）：
 *   ALTER TABLE crm_bid_notices DROP COLUMN ... 试 ALGORITHM=INSTANT 与 INPLACE 均被拒，
 *   原始报错同一句：`InnoDB presently supports one FULLTEXT index creation at a time`
 *   ——本表带 3 个 FULLTEXT 索引（ft_notices_search / ft_notices_en / ft_notices_desc），
 *   任何需要重建表的 ALTER 都得重建全文索引，而 InnoDB 一次只能建一个 ⇒ 只支持 COPY（全程锁写）。
 *   所以 ADR-0003 里「低风险纯增量可直接 ALTER」那条在本表不适用；历史三轮删列全部走影子表，
 *   不是保守，是被这条限制逼的。阶段一因此采用「先摘 FULLTEXT → 灌数据 → 逐个重建」的顺序。
 */
export const ONLINE_DDL_BLOCKED = true;
/** 旧表位前缀（ADR-0003 命名）。⚠️ 现场现有三个旧表位，都是本轮反滚物（probe275 实测）：
 *   `crm_bid_notices__old_20261015`（批次四的 49 列，当前占用命名位）、
 *   `crm_bid_notices_retired_b2_20261015`（批次二的 50 列）、
 *   `crm_bid_notices_retired_b1_20261015`（批次一的 52 列）。
 *   后两个是为了让下一批的 `--rollback` 只找一个旧表位而改名让位的（命中 dump 的 /_retired_/ 排除）；
 *   代价：`--batch=1/2 --rollback` 已不可用，反滚那两批需人工指定表名。
 *   早期在场、命名不合本约定的 `crm_bid_notices_old2_20261015`（58 列 / 714 MB）与并行轮旧位
 *   `crm_bid_notices_retired_20261015` 已由人工 DROP。 */
export const OLD_TABLE_PREFIX = `${NOTICES_TABLE}__old_`;

/** 回填分批行数（同 notices 历史轮口径：避免单条大事务、长时锁与 undo 膨胀） */
export const BACKFILL_BATCH = 5000;

/**
 * 批次一 · 可直删（云端零读写、不牵任何索引）—— 含已并入的原批次三两列
 *
 * 判据（三条同时成立才进本批）：
 *   ① src/ + scripts/ + tests/ 全域词边界 snake 与 camel 双查，**本表读写点 0 处**
 *      （可复跑：node scripts/tools/notices-slim-scan.mjs --assert-batch=1）；
 *   ② 不在 17 个索引的任何一列里（baseline.sql 索引清单逐条核对过）；
 *   ③ 不出现在宽表源指纹 WIDE_FP_EXPR 里（⇒ 切换后不触发全量重灌）。
 *
 * 注：原列 `response_count` 与原批次三两列已确认**归并行影子表轮次**（见文件头对账），
 * 登记在 PARALLEL_DROPPED_COLUMNS 里进防复活门禁，不进本批删列清单。
 */
export const BATCH_1_COLUMNS = ["thresholds", "ai_products"];

/** 批次一的逐列证据（写进清单文件本身，防止半年后无人知道当初凭什么删） */
export const BATCH_1_EVIDENCE = {
  thresholds:
    "零读取。代码命中只有两处噪声：featured.ts 的注释（说机会表那侧已删）、industry-gap-mine.mjs 的 summary.thresholds 局部对象。" +
    "现网 644,587 行 NULL / 933 行空壳 [] / 真有内容 1 行。与 crm_bid_opportunities.thresholds 是孪生列，那边 2026-10-12 已删。",
  ai_products:
    "零读取本表这份。bid-report 的 BoQ 章节读的是 row.ai_products，而 row 由 merge.ts 从 opp.ai_products 装配（商机表那份才是事实源）。" +
    "现网 920 行空壳 []|null / 真有内容 14 行。填充方（外置 AI worker）2026-09-17 停摆，见 docs/数据库设计/全表写入核对-20260930.md 问题⑦。",
  response_count:
    "零读写。前端「响应数」在 rfq/list 里直接硬编码 responses: 0，从不读这列。现网全表恒 0（列默认值）。",
  category_l1_id:
    "旧字典一级分类 ID（RFQ 用），现网**全库 0 行有值**；RFQ 已改落 category_code。代码引用由 bc77fe62 从指纹/构建层/单测三处同时摘除。",
  category_l2_id:
    "同上，二级；旧字典五级列已于 2ffa4c1a 走过一轮，这两列是最后一笔残留。",
};

/**
 * 由**并行影子表轮次**摘除的列（不经本仓阶段脚本，但同样是「本表已退役」）。
 * 必须留在登记簿上并进 retiredFrom()：否则重导 baseline 后，防复活门禁（NS1/NS2）对
 * `category_l1_id` 这类列就是空的——日后有人把它 ADD COLUMN 回来不会报错。
 * 不把它放进 BATCHES 的 columns 里，是为了让 --batch=1 不会去删已被别人删走的列（A1 会停线）。
 */
export const PARALLEL_DROPPED_COLUMNS = ["response_count", "category_l1_id", "category_l2_id"];

/**
 * 批次二 · is_converted（读了不用＋透出无消费）—— 本批**必须连带处理两个索引**
 *
 * is_converted 的问题不是「没人读」，而是「读了不用却已经透出」：
 *   findDetail / findDetailPublished 的 SELECT 清单里有它，而 normalizeNoticeDetailPayload
 *   用 `...notice` 把整行原样铺开 → /api/notices/[id]/detail 响应里带着它；
 *   但 src/features 全域（含 .tsx）对 is_converted 零消费（已逐文件核过，读取点已于
 *   2026-10-15 从两份 SELECT 清单摘除）。
 * 且它可由 converted_opp_id 推导。现网实测两列**不自洽 23 行**（21 行有真 opp_id 却没标转换、
 * 2 行标了转换但无真 opp_id；逐行留底 runtime/notices-b2-is-converted-diff-2026-10-15T08-03-07-278Z.tsv）。
 * 两列由两条路径各写各的（外部同步写 is_converted、商机转换写 converted_opp_id），没有交叉校验。
 * ⚠ 早期本清单记的是「38 行」，那个数错的：它把 converted_opp_id = 0 的 15 行当成「已转」
 *   （0 IS NOT NULL 为真），同时又被三值逻辑吃掉 2 行 NULL。判「已转」只认
 *   `converted_opp_id IS NOT NULL AND converted_opp_id > 0`，且必须带反向计数对账。
 *
 * ⚠ 与批次一的根本差别：is_converted **挂在两个索引的首列**（baseline 实测），而
 *   MySQL 对「删掉的列是复合索引一部分」会**隐式把索引改成剩下列**，名字不变、形状静默变。
 *   那种静默改变不可接受（半年后没人知道 idx_..._opp 为什么只剩一列），所以本批采
 *   「先显式 DROP 两个索引 → 再 DROP 列 → 再按意图 ADD 回一个」的次序，结果由本文件定死。
 *   两个索引均**无任何查询按名引用**（全域 grep FORCE/USE/IGNORE INDEX 与索引名，零命中）：
 *     · idx_bid_notices_converted_create_id (is_converted, create_time, id)
 *         → 首列没了以后就剩 (create_time, id)，而 InnoDB 二级索引本来隐含主键，
 *           与现有 idx_create_time(create_time) 等价冗余 ⇒ **直接退役不重建**。
 *     · idx_bid_notices_converted_opp (is_converted, converted_opp_id)
 *         → converted_opp_id **仍在用**（featured.ts 的 IN 子查询、detail/repo 多路取数），
 *           所以同名重建为单列索引，保住查询能力与名字口径。
 *
 * 跟系统影响：按用户 2026-10-15 指示，兄弟系统（intelligence-daily 等）是否读这列
 *   **不再作为本批前置**，该风险由用户裁定接受；本文件因此只保留本仓可自证的判据。
 *
 * 状态：**已落库**（50 → 49，2026-10-15 影子表切换）。本批的登记不得删——
 *   它是「当初为什么这么处置那两个索引」的唯一凭证，且已落库判据反过来验它形状对得上
 *   （tests/gates/notices-slim-index-plan.test.mjs）。
 */
export const BATCH_2_COLUMNS = ["is_converted"];

/**
 * 批次三 · 旧字典分类列摘除 = 已排队未执行的 B2（牵连项最重，单独一批）
 *
 * category_l1_id / category_l2_id 现网**全库 0 行有值**（写入侧已停：RFQ 改落 category_code），
 * 宽表 upsert 列清单也不含它们（wide-row-builder 注释「B1 起不再写旧列，列暂留 schema、无人读，
 * DROP 在 B2 走蓝绿」）。真正的工作量在三处牵连：
 *   ① WIDE_FP_EXPR 第 114-115 行仍把它们喂进指纹 → 摘列必须同批改表达式，
 *      而指纹表达式一改，645,521 行 sync_src_hash 全体错位 → 宽表全量重灌 +（线上）Meili 重建，
 *      需要先中内存/Swap 窗口（历史教训：Meili 重灌前必须扩容 Swap）；
 *   ② wideSyncSelect 仍 SELECT n.category_l1_id/l2_id、buildWideRow 仍组装该键（无消费方）；
 *   ③ 3 个单测断言 SQL/指纹串含该列名（wide-row-fp / wide-fingerprint / wide-row-platform-category），
 *      门禁 check-notice-classification-ssot.mjs 的白名单收缩要在 DROP 后一并做。
 * PREREQ：安排一次可重灌窗口 + 上述 ②③ 同批改动 + 门禁白名单收缩。
 *
 * 2026-10-15 收尾：本批**移交并行影子表轮次**（其实拍见文件头：对方 `__new` 形状里这三列已缺席）。
 * 列集置空有两个作用：① 误跑 --batch=3 会被阶段一/二的「无可删列」守卫挡下，不去做一轮
 * 空切换；② 这三列本体靠 PARALLEL_DROPPED_COLUMNS 进防复活门禁，不靠批次表。
 */
export const BATCH_3_COLUMNS = [];

/**
 * 批次四 · 商机镜像列（opp 轮已明确约定「单独一轮处理」）—— **已落库**（49 → 48）
 *
 * is_qualified 在本表是 8,492 行=1 的镜像位，但 23 处代码引用全部打在
 * crm_bid_opportunities 上（别名 o/opp），本表这份零读取。删它的前提是三方核对：
 * 内网 CRM 是这份镜像的写入方，intelligence-daily 是否读不可见 —— 该前置已按用户
 * 2026-10-15 裁定移出（风险由用户承担）。本批实际执行时只做了三条本仓可自证的实测：
 * 不挂任何索引（16 个索引逐条核过）、不进宽表源指纹（⇒ 零重灌）、src 零 `isQualified` 消费；
 * 两处商机侧误报走 NOTICE_REF_WAIVERS 人工豁免（不改判据也不删代码）。
 * 状态：**已落库**；本批登记与两条豁免均不得删——它们是「为何未改那两条 AI 链路 SQL」的唯一凭证。
 */
export const BATCH_4_COLUMNS = ["is_qualified"];

/**
 * 明确不动的列（防止后续误扩清单）。每条都注明「为什么不能凭本仓零引用就删」。
 */
export const GUARDED_COLUMNS = {
  update_time: "daily-sync / crawler-sync 的增量水位线列，删了断同步（阶段二的差异检测也依赖它）",
  notice_id: "唯一键 uq_notice_source，同步幂等与跨表反查的桥",
  id: "全系统公告身份（宽表 PK、落点表 notice_pk、翻译、解锁、意向全部指向它）",
  deadline_sec: "STORED 生成列 = 有效性唯一权威口径；且有 idx_deadline_sec（读放大主力）",
  is_active: "src 零读写，但兄弟系统 intelligence-daily 审计快照白名单在读；另挂在 idx_notices_reference 尾列（文档 §8）",
  rfq_reject_reason: "0 引用 0 行有值仍不可删：兄弟系统 rfq-review 有自愈 ADD COLUMN，删了会反复回来（文档 §8 已应验一次）",
  is_expired: "data-cleanup/engine.ts 拿它做 WHERE 判据；实测已失真（21,117 行过期未标 / 549 行误标）⇒ 属「先换判据」的改造，不是直删",
  industry: "在用（详情 SELECT + 行业维度查询）；品目归属另有落点表，但本列仍被消费",
  documents: "在用（宽表 documents_count、详情页附件、AI 摘要 extractAttachmentsText）",
  procurement_files: "在用（与 documents 合并算附件）",
  contacts: "在用（normalizeContactRows 合并展示）",
  external_links: "在用（FilesTab 外部链接）",
  key_contacts: "在用（前端与 contacts 合并），虽然 12,117 行是空壳 []",
  difficulty: "在用（NoticeCoreContent 门槛评级展示）",
  registration_level: "在用（QualificationTab 动态注册等级）",
  url: "在用（解锁详情原文链接 + 付费历史）",
  organization: "在用（机构名兜底链 agency ‖ agency_full ‖ organization）",
  description: "全文索引与正文主体，删无从谈起",
  // RFQ 功能族：现网 0 行有值 + entry_source 全库只有 'crawl'（distinct=1）⇒ 平台自助发布
  // 从未有过一条真实数据，但 create/submit/withdraw/list/detail 五个路由与前端向导都在读写。
  // 「空」不等于「死」：删这批等于砍掉 RFQ 功能，那是产品决策，不伪装成列清理。
  rfq_status: "RFQ 状态机 + PLATFORM_PUBLISHED_ONLY 可见性口径在用",
  user_id: "RFQ「我的发布」在用（idx_bid_notices_user_id）",
  category_code: "UGT 品目分类承接位，RFQ 大类筛选走它的前缀谓词",
  currency: "RFQ 预算币种（现网恒 CNY 是因为只有默认值，不是死列）",
  visibility: "RFQ 可见性（public/targeted）在用",
  budget_confidential: "RFQ 预算保密开关，前端 7 处消费",
};

/**
 * 本表的应用侧可写列。**⚠ 仅作诊断参考，不得当差异检测的完备性断言**：
 * 这份清单是手维护的，而 2026-10-15 实测到外部管道改写 `documents` 194 行既不推水位、也不在本清单里
 * ⇒ 拿它当判据会把真差异好成 0。补增量与切换前闸现在统一走全列行指纹（lib `findDirtyRows()`），
 * 本清单只用来回答「竞写的是哪些列、该不该进 APP 侧白名单」。
 */
export const APP_WRITABLE_COLUMNS = ["is_featured", "is_converted", "converted_opp_id", "rfq_status", "published_date"];

/**
 * 兄弟表 crm_bid_opportunities **仍在场**的同名列（2026-10-15 对 baseline 实测）。
 * 用途：判据分级——只有「兄弟表没有同名列」的退役列才能全域硬拦；
 * 有同名列的（如 ai_products / is_qualified）代码里出现该名字很可能是合法的商机侧引用，
 * 全域硬拦会误伤，所以只拦「同一条含 crm_bid_notices 的 SQL 字面量」。
 */
export const SIBLING_SAME_NAME_COLUMNS = ["ai_products", "is_qualified"];

/** 抽取源文本里的 SQL 字面量（反引号模板与引号串），用于判定「列名与本表 SQL 同属一条语句」。 */
export function extractSqlLiterals(text) {
  const out = [];
  const re = /`([\s\S]*?)`|"([^"\n]*)"|'([^'\n]*)'/g;
  let m;
  while ((m = re.exec(text))) {
    const body = m[1] ?? m[2] ?? m[3] ?? "";
    if (/\bselect\b|\binsert\b|\bupdate\b|\bfrom\b|\bset\b/i.test(body)) out.push(body);
  }
  return out;
}

/**
 * 在一份源文本里找出「引用了本表该列」的位置。两路取并集，缺一都会漏：
 *   ① 同一条含 crm_bid_notices 的 SQL 字面量里出现列名（详情类未加别名的 SELECT 清单）；
 *   ② 别名限定形式 n.<col> / crm_bid_notices.<col>（且本文件确实提及 crm_bid_notices）——
 *      构建层的 SQL 是多段拼接的（wideSyncSelect 不拼 FROM，表名在另一个常量里），
 *      只走① 会把 n.category_l1_id 这类真引用误判为「无引用」（实测踩过）。
 * @returns 命中片段数组（供人阅目）；空数组 = 无本表引用点
 */
export function noticeSqlRefs(text, col) {
  const out = [];
  const reCol = new RegExp(`(?<![A-Za-z0-9_])${col}(?![A-Za-z0-9_])`);
  // ① 同一条字面量
  for (const sql of extractSqlLiterals(text)) {
    if (/crm_bid_notices/i.test(sql) && reCol.test(sql)) out.push(sql.replace(/\s+/g, " ").slice(0, 120));
  }
  // ② 别名限定（只在提及本表的文件里生效，避免误伤其他表的 n. 别名）
  if (new RegExp(NOTICES_TABLE).test(text)) {
    // 注意：模板字面量里的正则必须双反斜杠，否则 JS 先吃掉转义（\b 退化成退格符），正则永不命中，
    // 会静默判成「无引用」——这种假阴性比误报危险得多（实测踩过）。
    const reAlias = new RegExp(`(?:\\bn\\.\\s*|${NOTICES_TABLE}\\.)${col}(?![A-Za-z0-9_])`, "g");
    const m = text.match(reAlias);
    if (m) out.push(...[...new Set(m)]);
  }
  return out;
}

/**
 * 人工豁免登记（判据偏保守造成的假阳性，逐条写明凭什么不是本表读写点）。
 *
 * 为什么是「登记豁免」而不是「放宽判据」：判据 ① 是「同一条含 crm_bid_notices 的 SQL
 * 字面量里出现列名」，而 AI 链路那两条 SQL 的子查询确实提及了本表
 * （`(SELECT notice_id FROM crm_bid_notices WHERE id = ?)`），但取的是商机侧的
 * `o.is_qualified`（FROM crm_bid_opportunities o）。若为了过闸把判据改成「列名必须带本表
 * 别名」，会连带放过真正的拼接 SQL 引用——那正是批次三当年静默漏检的形态。
 * 所以只豁免「这一文件的这一列」，别处写同样形态照旧拦（自测有专门用例守这一点）。
 *
 * ⚠ 豁免不随批次落库而删：列退役后这条字面量仍会被 NS1 见到，删了门禁当天就红。
 * 但它不得长存不监：扫描会报「已失效的豁免」（字段已不再命中），该删就删。
 */
export const NOTICE_REF_WAIVERS = [
  {
    file: "src/lib/services/ai/shared/notice-context.ts",
    col: "is_qualified",
    reason:
      "该字面量只有标量子查询提及 crm_bid_notices（取 notice_id 做匹配），取的是 crm_bid_opportunities o 的列（FROM crm_bid_opportunities o / AND (o.is_qualified = 1 ...)）。本仓已逐行看过。",
  },
  {
    file: "src/lib/services/ai-summary/index.ts",
    col: "is_qualified",
    reason:
      "同上 enrichFromOpportunity 路径：列只可能来自商机行（SELECT o.* FROM crm_bid_opportunities o），本表仅作为子查询参与匹配。",
  },
];

/** 取某列在某文件上的豁免（无则返回 undefined）。 */
export function waiverFor(file, col) {
  return NOTICE_REF_WAIVERS.find((w) => w.file === file && w.col === col);
}

/** 从 baseline.sql 文本里取本表当前列名（唯一事实源，不手拄）*/
export function baselineNoticeColumns(baselineText) {
  const start = baselineText.indexOf(`CREATE TABLE \`${NOTICES_TABLE}\` (`);
  if (start < 0) throw new Error(`baseline.sql 里找不到 ${NOTICES_TABLE}`);
  const block = baselineText.slice(start, baselineText.indexOf("\n) ENGINE=", start));
  return [...block.matchAll(/^  `([a-z0-9_]+)`/gm)].map((m) => m[1]);
}

/**
 * 已退役列 = 登记在册但已不在 baseline 本表结构里的批次列。
 * 这样防复活门禁的启用条件是自动的：切换前自动空转，切换（DROP 落库 + 重导 baseline）后自动上岗，
 * 不需要任何人手工维护「哪些批次已完成」那份状态（手写状态必漂）。
 * PARALLEL_DROPPED_COLUMNS 一并纳入：不经本仓阶段脚本退役的列，同样需要门禁。
 */
export function retiredFrom(baselineText) {
  const present = new Set(baselineNoticeColumns(baselineText));
  const all = [...Object.values(BATCHES).flatMap((b) => b.columns), ...PARALLEL_DROPPED_COLUMNS];
  return [...new Set(all.filter((c) => !present.has(c)))];
}

/** 批次注册表：阶段一/二脚本按 `--batch=N` 取列集，一次切换只带走一批。 */
export const BATCHES = {
  1: {
    columns: BATCH_1_COLUMNS,
    title: "零读写两列（thresholds / ai_products；response_count 已移交并行影子表轮）",
    prereq: ["并行作业的 crm_bid_notices__new 必须已消失（已切换或被清），否则表名撞车"],
  },
  2: {
    columns: BATCH_2_COLUMNS,
    title: "is_converted（读了不用＋透出无消费；连带退役/重建两个索引）—— 已落库",
    prereq: ["两份 SELECT 清单已摘除读取点（2026-10-15 已做）", "索引连带处置已登记在 BATCH_INDEX_PLAN[2] 并已现网复验", "23 行 is_converted/converted_opp_id 不自洽已出逐行留底（probe270，带反向计数对账）"],
  },
  3: { columns: BATCH_3_COLUMNS, title: "旧字典分类列（已移交并行影子表轮，不得在本仓执行）", prereq: ["列集已清空：跑它会因「无可删列」停线；列本体在 PARALLEL_DROPPED_COLUMNS 里登记"] },
  4: {
    columns: BATCH_4_COLUMNS,
    title: "is_qualified 镜像列（不挂索引、不进宽表指纹 ⇒ 零重灌债务）—— 已落库",
    prereq: [
      "三方核对内网写入方与兄弟系统读取：按用户 2026-10-15 指示不再作前置（风险由用户裁定接受）。",
      "两处商机侧误报已走 NOTICE_REF_WAIVERS 人工豁免登记（不是改判据，也不是删代码）。",
      "本表侧已实测：不挂任何索引（16 个索引逐条核过）、search-sync 全域零命中（不触发 64.5 万行重灌）、src 零 isQualified 消费。",
    ],
  },
};

/** 已授权执行的批次（阶段脚本会拒绝未登记的批次，防止顺手多删）。 */
export const ACTIVE_BATCH = Number(process.env.NOTICES_SLIM_BATCH ?? 1);

/** 取本批要删的列（含批次守卫）。 */
export function dropColumnsOf(batch = ACTIVE_BATCH) {
  const b = BATCHES[batch];
  if (!b) throw new Error(`未登记的批次 --batch=${batch}（可用：${Object.keys(BATCHES).join(", ")}）`);
  return b.columns;
}

/** 取删除后的保留列清单（顺序跟随原表，供 INSERT INTO __new (...) SELECT 拼接）。 */
export function keptColumns(allColumns, batch = ACTIVE_BATCH) {
  const drop = new Set(dropColumnsOf(batch));
  const guarded = new Set(Object.keys(GUARDED_COLUMNS));
  const clash = [...drop].filter((c) => guarded.has(c));
  if (clash.length) throw new Error(`受保护列不得进删列清单：${clash.join(", ")}`);
  return allColumns.filter((c) => !drop.has(c));
}

/** 本批要删的索引（批次一为空：三列都不在任何索引里；批次二非空，见 BATCH_INDEX_PLAN）。 */
export function dropIndexesOf(batch = ACTIVE_BATCH) {
  return indexPlanOf(batch).drop;
}

/**
 * 各批次对**非 FULLTEXT 索引**的连带处置计划。缺省为空 = 本批不得碰任何索引（阶段一 A3 硬拦）。
 * 为什么要把「删列带倒的索引」写成显式登记表而不是让 MySQL 本身去隐式调整：
 *   隐式调整会保留索引名但静默改列集，属于「名字没变、其实变了」的漂移，基线归档也看不出来。
 * add 里的定义会在阶段一末尾逐列比对，防止实除形状与登记不一致。
 */
export const BATCH_INDEX_PLAN = {
  2: {
    drop: ["idx_bid_notices_converted_create_id", "idx_bid_notices_converted_opp"],
    add: [{ name: "idx_bid_notices_converted_opp", cols: ["converted_opp_id"] }],
  },
};

/** 取本批索引处置计划（无登记则一律视为「不许碰索引」）。 */
export function indexPlanOf(batch = ACTIVE_BATCH) {
  return BATCH_INDEX_PLAN[batch] ?? { drop: [], add: [] };
}
