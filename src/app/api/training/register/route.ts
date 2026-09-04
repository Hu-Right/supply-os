/**
 * POST /api/training/register — 培训报名
 *
 * @description 前端发送 snake_case 字段，本 handler 负责映射为 camelCase
 *              后调用 trainingRepo.insertRegistration。同时根据 industry_id
 *              查询 UNSPSC 行业名称写入 industry 列。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { extractClientIp } from "@/lib/utils/ip";

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);

  const body = await req.json();
  const ctx = getContext();

  // snake_case → camelCase 映射（前端 TrainingRegisterForm / TrainingPaymentModal 均发送 snake_case）
  const industryId = body.industry_id ? Number(body.industry_id) : null;

  // 根据 industry_id 查询行业名称（UNSPSC 一级类目）
  let industryName = "";
  if (industryId) {
    try {
      const [rows] = await ctx.dbPool.execute(
        "SELECT title_zh FROM crm_unspsc_codes WHERE id = ? LIMIT 1",
        [industryId],
      );
      const row = (rows as Array<{ title_zh: string | null }>)[0];
      industryName = row?.title_zh || "";
    } catch {
      // 查询失败不影响报名主流程，industry 留空
    }
  }

  const result = await ctx.trainingRepo.insertRegistration({
    companyName: body.company_name || "",
    industryId,
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
