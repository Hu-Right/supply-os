/**
 * GET /api/system/links — 底部社交媒体链接（30min 缓存）
 */
import { NextResponse } from "next/server";
import { getContext } from "@/server/db/context";

interface FooterLink { id: number; name: string; url: string; icon: string }

let linksCache: { items: FooterLink[]; ts: number } | null = null;
const LINKS_CACHE_TTL = 30 * 60 * 1000;

export async function GET() {
  try {
    const now = Date.now();
    if (linksCache && now - linksCache.ts < LINKS_CACHE_TTL) {
      return NextResponse.json(linksCache.items, { headers: { "Cache-Control": "public, max-age=1800" } });
    }
    const rows = await getContext().systemRepo.listFooterLinks();
    const items: FooterLink[] = (rows || []).map((r: any) => ({
      id: Number(r.id), name: String(r.name || ""), url: String(r.url || ""), icon: String(r.icon || ""),
    }));
    linksCache = { items, ts: now };
    return NextResponse.json(items, { headers: { "Cache-Control": "public, max-age=1800" } });
  } catch {
    return NextResponse.json([]);
  }
}
