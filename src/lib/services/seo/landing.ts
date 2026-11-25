/**
 * SEO 聚合落地页数据源（国别 / 品目）
 * Landing pages data sources for country & commodity hubs
 *
 * @module lib/services/seo/landing
 * @description 长尾入口：每条公告只覆盖一个公告词，国别/品目聚合页承接
 *              「巴西 招标」「医疗设备 政府采购」这类稳定的品类词。
 *
 *              口径复用既有唯一实现，不另起一套：
 *              - 国别计数 = notice-search/countries 的规范化缓存（country_aliases 归一，kind=country）；
 *              - 国别筛选 = 同一快照的别名展开（与检索侧 n.country IN (...) 同口径）；
 *              - 品目计数 = hot-topics 的骨架 L1「包含」口径（标称数 = 点进去的兑现数）。
 *
 *              国别查询走 idx_bid_notices_country / idx_notices_filter(country,agency,notice_type)，
 *              品目列表复用 10 分钟聚合缓存，均不为 SEO 新增全表扫描。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db/pool";
import { ACTIVE_NOTICE_WHERE } from "@/lib/utils/notice-expired";
import {
  getNoticeCountries,
  getCountrySnapshot,
  expandCountryAliases,
} from "@/lib/services/notice-search/countries";
import { ensureCountryDisplaySnapshot, countryZhOf } from "@/lib/services/country/display";
import { listTopGroups, type HotGroupItem } from "@/lib/services/notice-search/hot-topics";
import { landingSlug } from "./country-slug";

/** 一条国别落地页（slug 由标准名派生，保证 URL 稳定可读） */
export interface CountryLanding {
  /** URL 片段，如 brazil / united-states */
  slug: string;
  /** country_aliases 标准名（英文），也是筛选时的归一键 */
  name: string;
  /** 中文译名（快照未命中为 null，页面回退英文） */
  nameZh: string | null;
  /** 有效公告数（与搜索侧同口径的缓存值） */
  count: number;
}

/** 国别落地页清单（按有效公告数降序；slug 冲突时保留计数更高的那个） */
export async function listCountryLandings(pool?: Pool): Promise<CountryLanding[]> {
  const db = pool ?? getPool();
  const [rows] = await Promise.all([
    getNoticeCountries(db),
    ensureCountryDisplaySnapshot(db).catch(() => undefined),
  ]);

  const seen = new Set<string>();
  const out: CountryLanding[] = [];
  for (const row of rows) {
    const name = String(row.country ?? "").trim();
    if (!name) continue;
    const slug = landingSlug(name);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, name, nameZh: countryZhOf(name), count: Number(row.count) || 0 });
  }
  return out;
}

/** 按 slug 取单条国别落地页（未知 slug 返回 null → notFound） */
export async function findCountryLanding(slug: string, pool?: Pool): Promise<CountryLanding | null> {
  const list = await listCountryLandings(pool);
  return list.find((c) => c.slug === slug) ?? null;
}

/** 国别落地页列出的公告行（只取卡片/标题需要的公开列） */
export interface CountryNoticeRow extends RowDataPacket {
  id: number;
  title: string;
  agency: string | null;
  country: string | null;
  notice_type: string | null;
  deadline_sec: number | null;
  published_date: string | null;
}

/** 某国最新有效公告（country 别名展开后 IN 查询，走 country 索引） */
export async function fetchCountryNotices(
  country: string,
  limit = 20,
  pool?: Pool,
): Promise<CountryNoticeRow[]> {
  const db = pool ?? getPool();
  const snapshot = getCountrySnapshot();
  const forms = snapshot ? expandCountryAliases(country, snapshot) : [country];
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const placeholders = forms.map(() => "?").join(", ");
  // 排序用 id 而非 update_time：大国的 update_time 排序需要 filesort（实测 Brazil 53s），
  // id 是入库时间派生值，倒序扫主键 + country 过滤实测 142ms，语义仍是「最新公告」。
  const [rows] = await db.query(
    `SELECT n.id, n.title, n.agency, n.country, n.notice_type, n.deadline_sec, n.published_date
       FROM bid_notices n
      WHERE ${ACTIVE_NOTICE_WHERE} AND n.country IN (${placeholders})
      ORDER BY n.id DESC
      LIMIT ${safeLimit}`,
    forms,
  );
  return rows as CountryNoticeRow[];
}

/** 品目大类落地清单（32 个骨架 L1，复用 hot-topics 的包含口径聚合） */
export async function listIndustryLandings(pool?: Pool): Promise<HotGroupItem[]> {
  return listTopGroups(pool ?? getPool(), 32);
}
