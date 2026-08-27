/**
 * GET /api/system/icp — ICP 备案号（10min 缓存）
 */
import { NextResponse } from "next/server";
import { getContext } from "@/server/db/context";

let icpCache: { bah: string; ts: number } | null = null;
const ICP_CACHE_TTL = 10 * 60 * 1000;

export async function GET() {
  try {
    const now = Date.now();
    if (icpCache && now - icpCache.ts < ICP_CACHE_TTL) {
      return NextResponse.json(icpCache, { headers: { "Cache-Control": "public, max-age=600" } });
    }
    const bah = await getContext().systemRepo.getIcpBah();
    icpCache = { bah, ts: now };
    return NextResponse.json(icpCache, { headers: { "Cache-Control": "public, max-age=600" } });
  } catch {
    return NextResponse.json({ bah: "" });
  }
}
