/**
 * POST /api/training/register — 培训报名
 *
 * @description 前端发送 snake_case 字段，本 handler 负责映射为 camelCase
 *              后调用 trainingRepo.insertRegistration。同时根据 industry_code
 *              查询 UGT-I 行业面节点名称写入 industry 列。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";

export const POST = withRoute(async (req: NextRequest) => {
  await requireUserKeyOrThrow(req);

  // ARCH-P3（2026-09-05）：限流补全 — 培训报名写端点，IP 维度 10min/5
  const rl = checkRateLimit(req, { windowMs: 10 * 60_000, maxAttempts: 5 }, () => `training_reg:${extractClientIp(req)}`);
  if (rl) return rl;

  const body = await req.json();
  const ctx = getContext();

  // 行业：UGT-I 行业面节点码（旧 industry_id 字典行 id 随 旧品类字典退役停用）
  const industryCode = body.industry_code ? String(body.industry_code).trim().slice(0, 40) : "";

  // 根据行业码查询名称（crm_industry_nodes）
  let industryName = "";
  if (industryCode) {
    try {
      const [rows] = await ctx.dbPool.execute(
        "SELECT name_zh FROM crm_industry_nodes WHERE code = ? LIMIT 1",
        [industryCode],
      );
      const row = (rows as Array<{ name_zh: string | null }>)[0];
      industryName = row?.name_zh || "";
    } catch (e) {
      // 查询失败不影响报名主流程，industry 留空
      console.warn("[training/register] 行业名称查询失败:", (e as Error).message);
    }
  }

  const result = await ctx.trainingRepo.insertRegistration({
    companyName: body.company_name || "",
    industryId: null,
    industry: industryName,
    mainProduct: body.main_product || "",
    exportExperience: body.export_experience || "",
    certification: body.certification || "",
    contactName: body.contact_name || "",
    position: body.position || "",
    telephone: body.telephone || "",
    email: body.email || "",
    remark: body.remark || "",
    ip: extractClientIp(req),
  });

  return NextResponse.json({ success: true, id: result }, { status: 201 });
});
