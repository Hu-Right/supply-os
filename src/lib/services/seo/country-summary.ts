/**
 * 国别筛选页的聚合摘要（`/procurement?country=XX`）
 *
 * @module lib/services/seo/country-summary
 * @description 2026-11-26：国别 URL 的服务端直出内容此前恒为“全球最新 10 条”，
 *              190 个国家页正文雷同（薄重复页）。本模块给国别页提供该国真实统计：
 *              在挂量、7/30 天截止压力、采购类型构成、主要采购方。
 *              只做只读聚合，10 分钟进程内缓存；查不到国家返回 null（页面退回通用内容）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { countryName } from "@/shared/constants/countries";
import { noticeTypeCodeLabel } from "@/shared/utils/notice-type";

export interface CountrySummary {
  code: string;
  nameZh: string;
  nameEn: string;
  /** 当前在挂（未截止）公告数 */
  active: number;
  /** 7 天内截止 */
  deadline7: number;
  /** 30 天内截止（含 7 天内） */
  deadline30: number;
  /** 采购类型构成（Top 6） */
  types: Array<{ code: string; label: string; count: number }>;
  /** 主要采购方（Top 5） */
  buyers: Array<{ name: string; count: number }>;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; data: CountrySummary }>();

/** 单测用：清空进程内缓存 */
export function resetCountrySummaryCacheForTests(): void {
  cache.clear();
}

const DAY = 86_400;

export async function getCountrySummary(pool: Pool, code: string): Promise<CountrySummary | null> {
  const key = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(key)) return null;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const nameZh = countryName(key, "zh");
  const nameEn = countryName(key, "en");
  if (!nameZh || !nameEn) return null;

  const now = Math.floor(Date.now() / 1000);

  const [totals] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS active,
            COALESCE(SUM(deadline_ts <= ?), 0) AS d7,
            COALESCE(SUM(deadline_ts <= ?), 0) AS d30
       FROM notice_public
      WHERE country_code = ? AND deadline_ts > ?`,
    [now + 7 * DAY, now + 30 * DAY, key, now],
  );
  const total = totals[0] ?? {};
  const active = Number(total.active ?? 0);
  // 无在挂公告（含解析不出的国家码）不给摘要，页面退回通用内容
  if (active === 0) return null;

  const [types] = await pool.query<RowDataPacket[]>(
    `SELECT notice_type_code, COUNT(*) AS n
       FROM notice_public
      WHERE country_code = ? AND deadline_ts > ?
      GROUP BY notice_type_code
      ORDER BY n DESC
      LIMIT 6`,
    [key, now],
  );
  const [buyers] = await pool.query<RowDataPacket[]>(
    `SELECT buyer_name, COUNT(*) AS n
       FROM notice_public
      WHERE country_code = ? AND deadline_ts > ? AND buyer_name IS NOT NULL AND buyer_name <> ''
      GROUP BY buyer_name
      ORDER BY n DESC
      LIMIT 5`,
    [key, now],
  );

  const data: CountrySummary = {
    code: key,
    nameZh,
    nameEn,
    active,
    deadline7: Number(total.d7 ?? 0),
    deadline30: Number(total.d30 ?? 0),
    types: types
      .map((row) => {
        const code = String(row.notice_type_code ?? "").trim();
        return { code, label: noticeTypeCodeLabel(code) || code, count: Number(row.n ?? 0) };
      })
      .filter((t) => t.code !== "" && t.count > 0),
    buyers: buyers
      .map((row) => ({ name: String(row.buyer_name ?? "").trim(), count: Number(row.n ?? 0) }))
      .filter((b) => b.name !== "" && b.count > 0),
  };

  cache.set(key, { at: Date.now(), data });
  return data;
}
