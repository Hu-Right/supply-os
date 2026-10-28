/**
 * GET /api/system/icp — ICP 备案号（10min 缓存）
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";

let icpCache: { bah: string; ts: number } | null = null;
const ICP_CACHE_TTL = 10 * 60 * 1000;

export const GET = withRoute(async () => {
  try {
    const now = Date.now();
    if (icpCache && now - icpCache.ts < ICP_CACHE_TTL) {
      // 只下发契约字段：ts 是模块级缓存的内部时间戳，不是对外契约（前端只读 data.bah）。
      // 上一版 `json(icpCache)` 整块透出把它一并送上了网，现在出口是显式字面量，规则一直接查得到。
      return NextResponse.json({ bah: icpCache.bah }, { headers: { "Cache-Control": "public, max-age=600" } });
    }
    const bah = await getContext().systemRepo.getIcpBah();
    icpCache = { bah, ts: now };
    return NextResponse.json({ bah }, { headers: { "Cache-Control": "public, max-age=600" } });
  } catch {
    return NextResponse.json({ bah: "" });
  }
});
