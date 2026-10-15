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
 */

export const NOTICES_TABLE = "crm_bid_notices";
export const SHADOW_TABLE = `${NOTICES_TABLE}__new`;
/** 旧表位前缀（ADR-0003 命名）。⚠️ 现网另有一张上一批留下的 `crm_bid_notices_old2_20261015`
 *  （58 列 / 精确 645,521 行，与现表行数一致，命名不合本约定）——它不匹配本前缀，
 *  因此阶段二的「找唯一旧表位」不会被它干扰；但它在场内占 714 MB，属待清理项。 */
export const OLD_TABLE_PREFIX = `${NOTICES_TABLE}__old_`;

/** 回填分批行数（同 notices 历史轮口径：避免单条大事务、长时锁与 undo 膨胀） */
export const BACKFILL_BATCH = 5000;

/**
 * 批次一 · 可直删（云端零读写、不牵任何索引与指纹表达式）
 *
 * 判据（三条同时成立才进本批）：
 *   ① src/ + scripts/ + tests/ 全域词边界 snake 与 camel 双查，**本表读取点 0 处**
 *      （命中的都是兄弟表同名列、注释、或 opp 轮的删列清单——逐条见 notices-slim-scan 输出）；
 *   ② 不在 17 个索引的任何一列里（probe233/231 索引清单核对）；
 *   ③ 不出现在宽表源指纹 WIDE_FP_EXPR 里（⇒ 切换后不触发全量重灌）。
 */
export const BATCH_1_COLUMNS = ["thresholds", "ai_products", "response_count"];

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
};

/**
 * 批次二 · 先摘读取点才能删（本批只登记，不动库）
 *
 * is_converted 的问题不是「没人读」，而是「读了不用却已经透出」：
 *   findDetail / findDetailPublished 的 SELECT 清单里有它，而 normalizeNoticeDetailPayload
 *   用 `...notice` 把整行原样铺开 → /api/notices/[id]/detail 响应里带着它；
 *   但 src/features 全域（含 .tsx）对 is_converted 零消费。
 * 且它可由 converted_opp_id 推导，实测两列已不自洽 38 行（谁维护的？外部同步写 is_converted，
 * 商机转换写 converted_opp_id，两条路径没有交叉校验）。
 * PREREQ：① 从两处 SELECT 清单摘掉该列并确认响应契约无消费方；② 38 行差异出对账清单；
 * ③ 与 intelligence-daily 确认它的公告转换流程是否读 is_converted（本仓不可见，不能臆断）。
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
 */
export const BATCH_3_COLUMNS = ["category_l1_id", "category_l2_id"];

/**
 * 批次四 · 商机镜像列（opp 轮已明确约定「单独一轮处理」）
 *
 * is_qualified 在本表是 8,492 行=1 的镜像位，但 23 处代码引用全部打在
 * crm_bid_opportunities 上（别名 o/opp），本表这份零读取。删它的前提是三方核对：
 * 内网 CRM 是这份镜像的写入方，intelligence-daily 是否读不可见。
 * 同族待议还有 is_converted（批次二）与 converted_opp_id（在用，保留）。
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

/** 本表的应用侧可写列（切换窗口的差异检测必须比这些，因为它们变更**不**推进 update_time）。 */
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

/** 从 baseline.sql 文本里取本表当前列名（唯一事实源，不手拄） */
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
 */
export function retiredFrom(baselineText) {
  const present = new Set(baselineNoticeColumns(baselineText));
  const all = Object.values(BATCHES).flatMap((b) => b.columns);
  return all.filter((c) => !present.has(c));
}

/** 批次注册表：阶段一/二脚本按 `--batch=N` 取列集，一次切换只带走一批。 */
export const BATCHES = {
  1: { columns: BATCH_1_COLUMNS, title: "零读写三列（thresholds / ai_products / response_count）", prereq: [] },
  2: { columns: BATCH_2_COLUMNS, title: "is_converted（读了不用＋透出无消费）", prereq: ["摘 SELECT 读取点", "38 行差异对账", "三方核对兄弟系统"] },
  3: { columns: BATCH_3_COLUMNS, title: "旧字典分类列 B2（含指纹表达式改造与全量重灌）", prereq: ["改 WIDE_FP_EXPR", "摘 wideSyncSelect/buildWideRow", "同步 3 个单测", "门禁白名单收缩", "预留重灌窗口"] },
  4: { columns: BATCH_4_COLUMNS, title: "is_qualified 镜像列", prereq: ["三方核对内网写入方与兄弟系统读取", "注：ai-summary/index.ts 与 notice-context.ts 的两处命中是拼接 SQL 里的商机侧 o.is_qualified（同一条字面量含 crm_bid_notices 子查询），属判据偏保守的误报——清障方式是人工豁免确认，不是改代码"] },
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

/** 本批要删的索引（批次一为空：三列都不在任何索引里）。 */
export function dropIndexesOf() {
  return [];
}
