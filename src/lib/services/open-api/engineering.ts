/**
 * 开放 API — 工程类商机数据筛选服务
 * Open API — Engineering opportunity data filtering service
 *
 * @module lib/services/open-api/engineering
 * @description 多维度组合筛选"工程类"商机：
 *              1. notice_type = 'WORKS'（EU 合同分类的工程类型）
 *              2. industry 字段含工程关键词（building, construction, infrastructure 等）
 *              取并集，覆盖最全。
 *
 *              【口径收窄】2026-10-14 第三条轴「旧品类编码的 23/26/25 段前缀 LIKE」随其源列
 *              物理退役一并删除：该列已不在库里，留着就是 500（实测 ER_BAD_FIELD_ERROR）。
 *              商机表上没有任何品目树列，若要按 UGT 节点重新加一条工程轴，需经
 *              source_notice_id → 公告落点表 的 JOIN，另批设计（不在本批范围内）。
 *
 *              分档返回：
 *              - basic：基础元数据（标题、国家、截止日期、类型、预算范围）
 *              - pro：完整数据（含描述、AI 分析、产品清单、联系方式等）
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { ACTIVE_OPP_WHERE } from "@/lib/utils/notice-expired";
import { normalizeNoticeType } from "../../utils/notice-type";
import { toBeijingUnixTs } from "../../utils/notice-expired";
import { expandCountryAliases } from "../notice-search/countries";
import { loadCountryAliasSnapshot } from "../country/alias-store";

/** 工程类 industry 关键词 */
const ENGINEERING_INDUSTRY_KEYWORDS = [
  "building",
  "construction",
  "infrastructure",
  "civil engineering",
  "engineering",
];

/** basic 档返回字段 */
const BASIC_FIELDS = `
  o.id,
  o.title,
  o.reference,
  o.notice_type,
  o.agency,
  o.agency_full,
  o.country,
  o.published_date,
  o.deadline,
  o.deadline_ts,
  o.estimated_value,
  o.industry,
  o.status,
  o.priority,
  o.source_notice_id
`;

/** pro 档额外字段 */
const PRO_EXTRA_FIELDS = `
  ,
  o.description,
  o.description_cn,
  o.bid_overview,
  o.supplier_conditions,
  o.eligibility,
  o.technical_hurdles,
  o.ai_products,
  o.ai_analysis,
  o.contacts,
  o.beneficiary_countries,
  o.registration_level,
  o.source_url
`;

export interface EngineeringListParams {
  page: number;
  limit: number;
  country?: string;
  noticeType?: string;
  /** 截止日期起始（ISO 日期字符串） */
  deadlineFrom?: string;
  /** 截止日期结束 */
  deadlineTo?: string;
  /** 关键词搜索（标题） */
  keyword?: string;
}

export interface EngineeringListResult {
  total: number;
  page: number;
  limit: number;
  items: RowDataPacket[];
}

/**
 * 构建工程类 WHERE 条件（多维度并集）
 */
function buildEngineeringWhere(): string {
  const industryConditions = ENGINEERING_INDUSTRY_KEYWORDS.map(
    (kw) => `o.industry LIKE '%${kw}%'`
  ).join(" OR ");

  return `(
    o.notice_type = 'WORKS'
    OR (${industryConditions})
  )`;
}

/**
 * 查询工程类商机列表
 */
export async function queryEngineeringList(
  dbPool: Pool,
  params: EngineeringListParams,
  tier: "basic" | "pro",
): Promise<EngineeringListResult> {
  const { page, limit, country, noticeType, deadlineFrom, deadlineTo, keyword } = params;
  const offset = (page - 1) * limit;

  const fields = tier === "pro" ? `${BASIC_FIELDS}${PRO_EXTRA_FIELDS}` : BASIC_FIELDS;
  const engineeringWhere = buildEngineeringWhere();

  const conditions: string[] = [
    ACTIVE_OPP_WHERE.replace("o.", "o."),
    engineeringWhere,
    "o.is_qualified = 1",
    // status 是 tinyint（1=已授标/won），可投标的即 status = 0。
    // 旧写法 `o.status = 'active'` 在非严格模式下把 'active' 隐式转成 0，
    // 凑巧与预期结果同值但语义错写（任何非数字字符串都会变成 =0），2026-10-12 改显式。
    "o.status = 0",
  ];
  const queryParams: (string | number)[] = [];

  if (country) {
    // 与主站检索同口径：国家别名展开（一切以 country_aliases 为准），不再裸等值
    const forms = expandCountryAliases(country, await loadCountryAliasSnapshot(dbPool));
    conditions.push(`o.country IN (${forms.map(() => "?").join(",")})`);
    queryParams.push(...forms);
  }

  if (noticeType) {
    // 与主站检索同口径：入参先经 normalizeNoticeType 归一（EU 合同类型的形态别名收敛）
    conditions.push("o.notice_type = ?");
    queryParams.push(normalizeNoticeType(noticeType));
  }

  if (deadlineFrom) {
    // 与主站检索同口径：落 deadline_sec 生成列（varchar 原始串含时区标注，字典序比较无意义）
    conditions.push("o.deadline_sec >= ?");
    queryParams.push(toBeijingUnixTs(deadlineFrom, "00:00:00"));
  }

  if (deadlineTo) {
    conditions.push("o.deadline_sec <= ?");
    queryParams.push(toBeijingUnixTs(deadlineTo, "23:59:59"));
  }

  if (keyword) {
    conditions.push("o.title LIKE ?");
    queryParams.push(`%${keyword}%`);
  }

  const whereClause = conditions.join(" AND ");

  // 查总数
  const [countRows] = await dbPool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM bid_opportunities o WHERE ${whereClause}`,
    queryParams,
  );
  const total = Number(countRows[0]?.total ?? 0);

  // 查列表
  // 排序用 create_time（干净、已建索引的 DATETIME）而非 published_date（源库自由文本，
  // ISO 与 dd-Mon-yyyy 混存，字符串 ORDER BY 会把 2019 排在 2026 前）。
  const [rows] = await dbPool.query<RowDataPacket[]>(
    `SELECT ${fields}
     FROM bid_opportunities o
     WHERE ${whereClause}
     ORDER BY o.create_time DESC, o.id DESC
     LIMIT ? OFFSET ?`,
    [...queryParams, limit, offset],
  );

  return { total, page, limit, items: rows };
}

/**
 * 查询单条工程类商机详情（pro 档完整数据）
 */
export async function queryEngineeringDetail(
  dbPool: Pool,
  opportunityId: number,
): Promise<RowDataPacket | null> {
  const fields = `${BASIC_FIELDS}${PRO_EXTRA_FIELDS}`;
  const engineeringWhere = buildEngineeringWhere();

  const [rows] = await dbPool.query<RowDataPacket[]>(
    `SELECT ${fields}
     FROM bid_opportunities o
     WHERE o.id = ?
       AND ${engineeringWhere}
     LIMIT 1`,
    [opportunityId],
  );

  return rows[0] ?? null;
}

/**
 * 获取工程类数据统计（供 API 文档/概览用）
 */
export async function getEngineeringStats(dbPool: Pool): Promise<RowDataPacket> {
  const engineeringWhere = buildEngineeringWhere();

  const [rows] = await dbPool.query<RowDataPacket[]>(
    `SELECT
       COUNT(*) AS total_count,
       COUNT(DISTINCT o.country) AS country_count,
       MIN(o.published_date) AS earliest_date,
       MAX(o.published_date) AS latest_date
     FROM bid_opportunities o
     WHERE ${engineeringWhere}
       AND o.is_qualified = 1
       AND o.status = 0`,
  );

  return rows[0] ?? { total_count: 0, country_count: 0, earliest_date: null, latest_date: null };
}
