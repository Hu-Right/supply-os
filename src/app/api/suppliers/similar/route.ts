/**
 * GET /api/suppliers/similar?company= — 诊断入口的公司名候选
 *
 * @module app/api/suppliers/similar/route
 * @description 只服务一件事：让用户确认"库里这条是不是贵公司"（规范 N9 的脱敏口径由
 *              repo 的字段白名单 + 本文件的 credit_code 绕码共同保证）。
 *              登录态才可用（诊断本身已收敛为登录后填写），并做用户维度限流，
 *              防止把主数据目录当免费检索接口爬。
 *              响应为信封结构，前端必须读 `res.data.list`。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { maskCreditCode } from "@/lib/repos/suppliers/supplier-directory.repo";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { EC_INVALID_PARAMS, EC_INTERNAL_ERROR } from "@/shared/constants/api";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const rl = checkRateLimit(req, { windowMs: 60_000, maxAttempts: 20 }, () => `sim:${auth.userId}`);
  if (rl) return rl;

  const keyword = new URL(req.url).searchParams.get("company")?.trim() ?? "";
  if (keyword.length < 2) routeError(400, EC_INVALID_PARAMS, "公司名称至少 2 个字符");

  try {
    const rows = await getContext().supplier.directoryRepo.findDiagnosisCandidatesByName(keyword, 5);
    return NextResponse.json({
      code: 0,
      message: "ok",
      data: {
        list: rows.map((r) => ({
          supplierId: Number(r.id),
          company: r.company ?? "",
          englishName: r.english_name ?? "",
          province: r.province ?? "",
          city: r.city ?? "",
          establishedAt: r.established_at ?? "",
          legalRep: r.legal_rep ?? "",
          // 只给掩码：足以在"同名不同主体"之间辨认，不足以取走完整信用代码
          creditCodeMasked: maskCreditCode(r.credit_code),
          businessType: r.business_type ?? "",
          verified: String(r.verify_status ?? "") === "done",
          claimPending: String(r.claim_status ?? "") === "pending",
        })),
      },
    });
  } catch (err) {
    console.error("[suppliers similar GET]", err);
    routeError(500, EC_INTERNAL_ERROR, "查询企业候选失败");
  }
});
