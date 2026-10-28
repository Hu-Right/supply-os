/**
 * GET /api/system/links — 底部社交媒体链接（30min 缓存）
 */
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";

interface FooterLink {
  id: number;
  name: string;
  url: string;
  icon: string;
}

/**
 * link 表行 → 对外契约（命名红线② 的约定名：规则二靠 ViewOf 认出这里已收视图，
 * 本出口因此不再需要占「整块透出」登记位）。
 * 列名只有 id/name/url/icon 四个单词，但必须在此显式列出：以后 SELECT 加列不会自动上网。
 */
function footerLinkViewOf(r: RowDataPacket): FooterLink {
  return {
    id: Number(r.id),
    name: String(r.name || ""),
    url: String(r.url || ""),
    icon: String(r.icon || ""),
  };
}

let linksCache: { items: FooterLink[]; ts: number } | null = null;
const LINKS_CACHE_TTL = 30 * 60 * 1000;

export const GET = withRoute(async () => {
  try {
    const now = Date.now();
    if (linksCache && now - linksCache.ts < LINKS_CACHE_TTL) {
      return NextResponse.json(linksCache.items, { headers: { "Cache-Control": "public, max-age=1800" } });
    }
    const rows = await getContext().systemRepo.listFooterLinks();
    const items: FooterLink[] = (rows || []).map(footerLinkViewOf);
    linksCache = { items, ts: now };
    return NextResponse.json(items, { headers: { "Cache-Control": "public, max-age=1800" } });
  } catch {
    return NextResponse.json([]);
  }
});
