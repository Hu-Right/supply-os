/**
 * 首页热门话题聚合（国家 / 行业 / UNSPSC 热门代码，带有效公告计数）
 * Homepage hot topics aggregation with active-notice counts
 *
 * @module server/services/notice-search/hot-topics
 * @description 规划 §5.1 内容模块 + §7.3 数量 SEO 的数据源：热门国家、热门行业、
 *              UNSPSC 热门代码均展示真实结果数。行业/代码计数基于宽表 precise_level{1,2}
 *              （逗号分隔 UNSPSC ID）FIND_IN_SET 展开。
 *              有效公告谓词与 utils/notice-expired 的 ACTIVE_NOTICE_WHERE_NO_ALIAS
 *              逐字一致（该模块为唯一口径定义处；此处字面内联仅为满足静态安全扫描
 *              对 SQL 模板插值/动态语句的拦截，两处必须同步修改，禁止单边改动）。
 *              10 分钟内存缓存，国家计数复用 getNoticeCountries 既有缓存。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { getNoticeCountries } from "./countries";

const HOT_TOPICS_TTL_MS = 10 * 60 * 1000;
const HOT_TOPICS_LIMIT = 8;

export interface HotIndustryItem {
  id: number;
  code: string;
  title_zh: string;
  title: string;
  count: number;
}

export interface HotTopics {
  countries: Array<{ country: string; count: number }>;
  industries: HotIndustryItem[];
  unspsc: HotIndustryItem[];
}

let hotTopicsCache: { data: HotTopics; expires: number } | null = null;

interface CountRow extends RowDataPacket {
  id: number;
  code: string;
  title_zh: string;
  title: string;
  cnt: number;
}

function toItems(rows: CountRow[]): HotIndustryItem[] {
  return rows.map((r) => ({
    id: Number(r.id),
    code: String(r.code || ""),
    title_zh: String(r.title_zh || ""),
    title: String(r.title || ""),
    count: Number(r.cnt) || 0,
  }));
}

// 以下两条 SQL 完全字面量化（无模板插值、无常量选表），通过静态安全扫描；
// 谓词 (deadline_sec = 0 OR deadline_sec >= UNIX_TIMESTAMP(NOW())) 即
// ACTIVE_NOTICE_WHERE_NO_ALIAS 的逐字拷贝，口径变更须与 utils/notice-expired 同步。

/** UNSPSC 一级行业（segment）有效公告计数 TOP8 */
async function countLevel1Industries(pool: Pool): Promise<HotIndustryItem[]> {
  const [rows] = await pool.query(
    `SELECT u.id, u.code, u.title_zh, u.title, COUNT(ns.id) AS cnt
     FROM crm_unspsc_codes u
     JOIN crm_notice_search ns
       ON FIND_IN_SET(u.id, ns.precise_level1)
      AND (ns.deadline_sec = 0 OR ns.deadline_sec >= UNIX_TIMESTAMP(NOW()))
     WHERE u.level = 1
     GROUP BY u.id, u.code, u.title_zh, u.title
     ORDER BY cnt DESC
     LIMIT 8`,
  );
  return toItems(rows as CountRow[]);
}

/** UNSPSC 二级代码（family）有效公告计数 TOP8 */
async function countLevel2Codes(pool: Pool): Promise<HotIndustryItem[]> {
  const [rows] = await pool.query(
    `SELECT u.id, u.code, u.title_zh, u.title, COUNT(ns.id) AS cnt
     FROM crm_unspsc_codes u
     JOIN crm_notice_search ns
       ON FIND_IN_SET(u.id, ns.precise_level2)
      AND (ns.deadline_sec = 0 OR ns.deadline_sec >= UNIX_TIMESTAMP(NOW()))
     WHERE u.level = 2
     GROUP BY u.id, u.code, u.title_zh, u.title
     ORDER BY cnt DESC
     LIMIT 8`,
  );
  return toItems(rows as CountRow[]);
}

/** 读取热门话题聚合（10 分钟 TTL，过期惰性重建；国家计数复用国家缓存） */
export async function getHotTopics(pool: Pool): Promise<HotTopics> {
  if (hotTopicsCache && hotTopicsCache.expires > Date.now()) return hotTopicsCache.data;
  const [countryList, industries, unspsc] = await Promise.all([
    getNoticeCountries(pool),
    countLevel1Industries(pool),
    countLevel2Codes(pool),
  ]);
  const data: HotTopics = {
    countries: countryList.slice(0, HOT_TOPICS_LIMIT),
    industries,
    unspsc,
  };
  hotTopicsCache = { data, expires: Date.now() + HOT_TOPICS_TTL_MS };
  return data;
}

/** 清除缓存（测试辅助） */
export function clearHotTopicsCache(): void {
  hotTopicsCache = null;
}
