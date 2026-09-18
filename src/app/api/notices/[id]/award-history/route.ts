/**
 * GET /api/notices/:id/award-history — 同类品类历史中标数据
 *
 * @module app/api/notices/[id]/award-history/route
 * @description 根据公告的 UNSPSC 编码前缀，查询 crm_bid_awards 中同类品类的历史中标数据。
 *              返回：采购次数、采购总额、按国家分布、中标商排行、最近中标记录。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { normalizeUnspscCodes, unspscPrefixFromCode } from "@/lib/services/unspsc/parser";

export const dynamic = "force-dynamic";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (_req, { params }) => {
    const { id } = await params;
    const noticeId = Number(id);
    if (!Number.isFinite(noticeId) || noticeId <= 0) {
      return routeError(400, EC_INVALID_PARAMS, "无效的公告 ID");
    }

    const ctx = getContext();

    // 1. 查公告的 UNSPSC 码
    const notice = await ctx.notice.detailRepo.findById(noticeId);
    if (!notice) {
      return routeError(404, 40004, "公告不存在");
    }

    const codes = normalizeUnspscCodes(notice.unspsc_codes);
    if (codes.length === 0) {
      return NextResponse.json({
        code: 0,
        data: {
          total: 0,
          total_value_usd: 0,
          by_country: [],
          top_winners: [],
          recent_awards: [],
          unspsc_matched: [],
        },
      });
    }

    // 2. 提取前缀（去重）
    const prefixSet = new Set<string>();
    for (const item of codes) {
      const prefix = unspscPrefixFromCode(item.code);
      if (prefix) prefixSet.add(prefix);
    }
    const prefixes = Array.from(prefixSet);

    // 3. 查询中标历史
    const result = await ctx.awardsRepo.getByUnspscCodes(prefixes);

    return NextResponse.json({
      code: 0,
      data: {
        ...result,
        unspsc_matched: prefixes,
      },
    });
  },
);
