/**
 * GET /api/opportunities — 商机列表（按 UNSPSC code）
 * GET /api/opportunities/unlocks — 用户已解锁商机
 * POST /api/opportunities/[id]/view — 查看商机
 * POST /api/opportunities/[id]/unlock — 解锁商机
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKey } from "@/lib/middleware/auth";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const ctx = getContext();
  const oppsRepo = ctx.opportunitiesRepo;

  // /opportunities/unlocks
  if (url.pathname.endsWith("/unlocks")) {
    const auth = await requireUserKey(req);
    if (auth instanceof Response) return auth;
    const unlocks = await oppsRepo.listUnlocks(auth.userKey);
    return NextResponse.json(unlocks);
  }

  // /opportunities?code_id=X
  const codeId = Number(req.nextUrl.searchParams.get("code_id") || req.nextUrl.searchParams.get("industry_id"));
  if (codeId) {
    const items = await oppsRepo.listOpportunities(codeId);
    return NextResponse.json(items);
  }

  return NextResponse.json({ code: 40404, message: "Not found" }, { status: 404 });
}

export async function POST(req: NextRequest) {
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  // Extract ID from /api/opportunities/[id]/action
  const idIdx = pathParts.indexOf("opportunities") + 1;
  const oppId = Number(pathParts[idIdx]);
  if (!oppId) return NextResponse.json({ code: 40000, message: "Invalid ID" }, { status: 400 });

  const ctx = getContext();
  const oppsRepo = ctx.opportunitiesRepo;

  if (url.pathname.endsWith("/view")) {
    await oppsRepo.insertView({ userKey: auth.userKey, opportunityId: oppId, ip: "127.0.0.1" });
    await oppsRepo.incrementViewCount(oppId);
    return NextResponse.json({ success: true });
  }

  if (url.pathname.endsWith("/unlock")) {
    const existing = await oppsRepo.findExistingUnlock(auth.userKey, oppId);
    if (existing) return NextResponse.json({ success: true, already_unlocked: true });

    // 简化版解锁（完整支付流程由 payment 域处理）
    const opp = await oppsRepo.findById(oppId);
    if (!opp) return NextResponse.json({ code: 40044, message: "商机不存在" }, { status: 404 });
    await oppsRepo.insertUnlock({
      userKey: auth.userKey,
      opportunityId: oppId,
      unlockType: "direct",
      price: 0,
      unspscSnapshot: opp.unspsc_code || "",
    });
    await oppsRepo.incrementUnlockCount(oppId);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ code: 40404, message: "Not found" }, { status: 404 });
}
