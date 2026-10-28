/**
 * 开放 API 对外视图 mapper —— 命名红线② 在 `/api/open/v1/**` 的收口点
 *
 * @module lib/services/open-api/view
 * @description 本域原先把 `bid_opportunities` 的查询行直接 json 出去（list 的 `items: rows`、
 *              detail 的 `item`、stats 的 `json(stats)`），外发键名就是列名与 SQL 别名
 *              （`notice_type` / `agency_full` / `total_count`…）。实测证据见
 *              runtime/probe-opaque-c-group.ts：stats 出口 4 个键全是 snake。
 *              2026-10-28 决策：开放 API 与主站同口径，实体字段一律 camelCase（红线②）。
 *
 *              【破坏性变更】这是对已授权客户的对外契约改动，键名对照见 ARCHITECTURE.md
 *              「开放 API 字段对照」。值一律原样透传：不改类型、不格式化、不补默认值。
 *
 *              为什么这里是**显式列字段**而不是 `toCamelKeys` 整行机械改名：
 *              对外契约应当由本模块单独负责。新增列要出现在外发响应里，必须先在这里显式登记，
 *              这是有意的摩擦（机械改名会把以后随便加的一列换个名字继续发出去）。
 *              pro 档独有的列用 `!== undefined` 判定：basic 行里不存在就不写，
 *              不在 basic 响应上造一串 null 键。
 */

/** 行类型（列名口径，服务内部按列名读；不跟着视图改名） */
export interface EngineeringRow {
  id: number;
  title: string | null;
  reference: string | null;
  notice_type: string | null;
  agency: string | null;
  agency_full: string | null;
  country: string | null;
  published_date: string | null;
  deadline: string | null;
  deadline_ts: number | null;
  estimated_value: string | null;
  industry: string | null;
  status: number | null;
  priority: number | null;
  source_notice_id: string | null;
  // 以下仅 pro 档 SELECT（basic 行里不存在）
  description?: string | null;
  description_cn?: string | null;
  bid_overview?: string | null;
  supplier_conditions?: string | null;
  eligibility?: string | null;
  technical_hurdles?: string | null;
  ai_products?: unknown;
  ai_analysis?: unknown;
  contacts?: unknown;
  beneficiary_countries?: string | null;
  registration_level?: string | null;
  source_url?: string | null;
}

/** stats 聚合行（SQL 别名口径） */
export interface EngineeringStatsRow {
  total_count: number;
  country_count: number;
  earliest_date: string | null;
  latest_date: string | null;
}

/** 列表/详情单条对外形状 */
export interface EngineeringItemView {
  id: number;
  title: string | null;
  reference: string | null;
  noticeType: string | null;
  agency: string | null;
  agencyFull: string | null;
  country: string | null;
  publishedDate: string | null;
  deadline: string | null;
  deadlineTs: number | null;
  estimatedValue: string | null;
  industry: string | null;
  status: number | null;
  priority: number | null;
  sourceNoticeId: string | null;
  /** pro 档才有 */
  description?: string | null;
  descriptionCn?: string | null;
  bidOverview?: string | null;
  supplierConditions?: string | null;
  eligibility?: string | null;
  technicalHurdles?: string | null;
  aiProducts?: unknown;
  aiAnalysis?: unknown;
  contacts?: unknown;
  beneficiaryCountries?: string | null;
  registrationLevel?: string | null;
  sourceUrl?: string | null;
}

/** 统计对外形状 */
export interface EngineeringStatsView {
  totalCount: number;
  countryCount: number;
  earliestDate: string | null;
  latestDate: string | null;
}

/** 行 → 视图：只改名与按档裁剪，不改任何值 */
export function engineeringItemViewOf(row: EngineeringRow): EngineeringItemView {
  const view: EngineeringItemView = {
    id: row.id,
    title: row.title,
    reference: row.reference,
    noticeType: row.notice_type,
    agency: row.agency,
    agencyFull: row.agency_full,
    country: row.country,
    publishedDate: row.published_date,
    deadline: row.deadline,
    deadlineTs: row.deadline_ts,
    estimatedValue: row.estimated_value,
    industry: row.industry,
    status: row.status,
    priority: row.priority,
    sourceNoticeId: row.source_notice_id,
  };
  if (row.description !== undefined) view.description = row.description;
  if (row.description_cn !== undefined) view.descriptionCn = row.description_cn;
  if (row.bid_overview !== undefined) view.bidOverview = row.bid_overview;
  if (row.supplier_conditions !== undefined) view.supplierConditions = row.supplier_conditions;
  if (row.eligibility !== undefined) view.eligibility = row.eligibility;
  if (row.technical_hurdles !== undefined) view.technicalHurdles = row.technical_hurdles;
  if (row.ai_products !== undefined) view.aiProducts = row.ai_products;
  if (row.ai_analysis !== undefined) view.aiAnalysis = row.ai_analysis;
  if (row.contacts !== undefined) view.contacts = row.contacts;
  if (row.beneficiary_countries !== undefined) view.beneficiaryCountries = row.beneficiary_countries;
  if (row.registration_level !== undefined) view.registrationLevel = row.registration_level;
  if (row.source_url !== undefined) view.sourceUrl = row.source_url;
  return view;
}

/** 列表批量转换（保持顺序，不做任何过滤） */
export function engineeringItemViewsOf(rows: EngineeringRow[]): EngineeringItemView[] {
  return rows.map(engineeringItemViewOf);
}

/** stats 行 → 视图 */
export function engineeringStatsViewOf(row: EngineeringStatsRow): EngineeringStatsView {
  return {
    totalCount: row.total_count,
    countryCount: row.country_count,
    earliestDate: row.earliest_date,
    latestDate: row.latest_date,
  };
}
