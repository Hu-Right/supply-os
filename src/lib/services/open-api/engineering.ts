/**
 * 开放 API — 工程类商机数据筛选服务
 * Open API — Engineering opportunity data filtering service
 *
 * @module lib/services/open-api/engineering
 * @description 多维度组合筛选"工程类"商机：
 *              1. notice_type = 'WORKS'（EU 合同分类的工程类型）
 *              2. UNSPSC 工程段编码（23xxxxxx 建筑工程、26xxxxxx 电力工程等）
 *              3. industry 字段含工程关键词（building, construction, infrastructure 等）
 *              取并集，覆盖最全。
 *
 *              分档返回：
 *              - basic：基础元数据（标题、国家、截止日期、类型、预算范围）
 *              - pro：完整数据（含描述、AI 分析、产品清单、联系方式等）
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { ACTIVE_OPP_WHERE } from "@/lib/utils/notice-expired";

/** 工程类 UNSPSC 前缀（段级别） */
const ENGINEERING_UNSPSC_PREFIXES = [
  "23", // 建筑工程（Construction）
  "26", // 电力/电气工程（Electrical）
  "25", // 结构材料（Structures）
];

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
  o.unspsc_codes,
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
  o.product_code,
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
  const unspscConditions = ENGINEERING_UNSPSC_PREFIXES.map(
    (prefix) => `o.unspsc_codes LIKE '${prefix}%'`
  ).join(" OR ");

  const industryConditions = ENGINEERING_INDUSTRY_KEYWORDS.map(
    (kw) => `o.industry LIKE '%${kw}%'`
  ).join(" OR ");

  return `(
    o.notice_type = 'WORKS'
    OR (${unspscConditions})
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
    "o.status = 'active'",
  ];
  const queryParams: (string | number)[] = [];

  if (country) {
    conditions.push("o.country = ?");
    queryParams.push(country);
  }

  if (noticeType) {
    conditions.push("o.notice_type = ?");
    queryParams.push(noticeType);
  }

  if (deadlineFrom) {
    conditions.push("o.deadline >= ?");
    queryParams.push(deadlineFrom);
  }

  if (deadlineTo) {
    conditions.push("o.deadline <= ?");
    queryParams.push(deadlineTo);
  }

  if (keyword) {
    conditions.push("o.title LIKE ?");
    queryParams.push(`%${keyword}%`);
  }

  const whereClause = conditions.join(" AND ");

  // 查总数
  const [countRows] = await dbPool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM crm_bid_opportunities o WHERE ${whereClause}`,
    queryParams,
  );
  const total = Number(countRows[0]?.total ?? 0);

  // 查列表
  const [rows] = await dbPool.query<RowDataPacket[]>(
    `SELECT ${fields}
     FROM crm_bid_opportunities o
     WHERE ${whereClause}
     ORDER BY o.published_date DESC, o.id DESC
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
     FROM crm_bid_opportunities o
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
     FROM crm_bid_opportunities o
     WHERE ${engineeringWhere}
       AND o.is_qualified = 1
       AND o.status = 'active'`,
  );

  return rows[0] ?? { total_count: 0, country_count: 0, earliest_date: null, latest_date: null };
}
