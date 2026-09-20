/**
 * 公告字段口径常量 —— 宽表 / SEO / 列表 / Meili 共用单一事实源
 * Notice Field Limits & Expression Single Source
 *
 * @module server/utils/notice-field-limits
 * @description 历史上「描述取自哪张表」「截断到多少」在 5 个文件里各写一份，
 *              导致 SEO 摘要、列表摘要、宽表主列、Meili 文档四者口径漂移（D13），
 *              并让对账与构建两条写入路径对同一列算出不同值（D4）。
 *              本模块把**表达式**与**长度**收敛为唯一出口：
 *              - 宽表构建（services/search-sync/wide-row-builder）
 *              - Meili 文档（services/meilisearch/sync）
 *              - SEO / 详情查询（repos/notices/notice-detail.repo）
 *              - 列表读取（services/search-orchestrator/detail-fetch）
 *              - 平台发布校验（features/rfq + services/notices/platform-rfq）
 *
 *              归属 utils 层原因：repos 与 services 都需依赖，放 services 会造成
 *              repos → services 反向依赖（违反 ARCHITECTURE.md 红线 1/4）。
 *              门禁 scripts/check-wide-table-ssot.mjs 禁止上述文件再出现裸长度字面量。
 */

/** 各字段最大长度（字符数），与列定义及既有行为对齐 */
export const WIDE_LIMITS = {
  /** 宽表/索引标题列 VARCHAR(1000) */
  title: 1000,
  /** 宽表/索引描述主列：TEXT 存储，实际使用上限 2000（性能与索引体积约束） */
  description: 2000,
  /** 未解锁预览摘要长度（SEO 详情页与搜索列表共用同一口径；严禁放宽，会被 SSR 泄给未付费用户与爬虫） */
  lockedTeaser: 300,
  /** 列表页非默认语言摘要长度 */
  i18nTeaser: 500,
  /** 机会表人工拆解中文摘要列 VARCHAR(500) */
  descriptionCn: 500,
  /** 机会表标段概览列 VARCHAR(200) */
  bidOverview: 200,
  /** 编号列 VARCHAR(200) */
  reference: 200,
  /** 外部公告编号列 VARCHAR(100) */
  noticeId: 100,
  /** 受援助国串列 VARCHAR(300) */
  beneficiary: 300,
  /** 宽表 UNSPSC/precise 各级 ID 串列 TEXT，实际使用上限 2000 */
  unspscList: 2000,
  /** 平台公告标题上下限（与 RfqWizard 前端校验同一常量，消除双口径） */
  rfqTitle: 50,
  rfqTitleMin: 10,
  /** 平台公告描述上下限（与宽表主列一致：写入即可完整被搜索，不留截断差） */
  rfqDescription: 2000,
  rfqDescriptionMin: 50,
} as const;

/**
 * 描述来源表达式：机会表（qualified/审核通过）优先，主表兜底。
 * 与 featured.ts 的合格机会谓词共用同一 opp 别名，确保「详情页展示的描述」与
 * 「宽表/索引里被搜到的描述」永远取自同一行，不再出现两路径互写。
 */
export function descSourceExpr(oppAlias = "opp", noticeAlias = "n"): string {
  return `COALESCE(${oppAlias}.description, ${noticeAlias}.description)`;
}

/** 默认别名（opp / n）下的描述来源表达式 */
export const DESC_SOURCE_EXPR = descSourceExpr();

/** 译文来源标记：区分「真翻译」「同语言直通」「英文中枢兜底」 */
export const TRANSLATION_MODEL = {
  /** 原文已是目标语言，直通写入（此时 description_tr 可能为 NULL，需回填原文） */
  SAME_LANG: "same-lang-passthrough",
  /** 小语种公告自动补齐的英文中枢兜底译文 */
  EN_PIVOT: "en-pivot",
} as const;

/**
 * 安全截断（null/undefined 归空串），统一替代散落 String(x||'').slice(0, N)。
 *
 * 按**码点**而非 UTF-16 码元截断：SQL 侧 LEFT() 以字符计数，JS 的 String#slice 以
 * 代理对为单位 —— 含 emoji/生僻字的描述在两侧会切在不同位置，正是「宽表与索引描述
 * 不一致」这类隐性漂移的来源，因此这里直接对齐 SQL 语义。
 */
export function truncate(val: unknown, max: number): string {
  const s = String(val ?? "");
  // 快路径：绝大多数文本无代理对，长度未超即零开销返回
  if (s.length <= max) return s;
  return Array.from(s).slice(0, max).join("");
}
