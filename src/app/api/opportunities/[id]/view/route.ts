/**
 * POST /api/opportunities/:id/view — 浏览打点（已退役，保留端点契约）
 *
 * 浏览流水随 user_notice_views.opportunity_id 列退役（2026-09-30），
 * 商机表的 view_count 计数列同批删除（外部 DDL）——本端点不再有任何写入，
 * 保留 success 响应兼容存量客户端；商机无独立详情页，前端已无调用方。
 */
import { NextResponse } from "next/server";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";

export const POST = withRoute<{ params: Promise<{ id: string }> }>(
  async (req) => {
    await requireUserKeyOrThrow(req);
    return NextResponse.json({ success: true });
  },
);
