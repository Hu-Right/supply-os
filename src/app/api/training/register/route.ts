/**
 * POST /api/training/register — 培训报名
 *
 * @description 前端发送 snake_case 字段，本 handler 负责映射为 camelCase
 *              后调用 trainingRepo.insertRegistration。2026-11-13 精简：只收企业四项
 *              （名称/主营产品/出口经验/资质证书）+ 备注 + 学员四项（姓名/性别/电话/职位）+ 期次。
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

  // 定价快照：2800 元/人来自 training_courses.unit_price（零硬编码），报名时落库，
  // 避免后续调价改写历史；取不到则留空，不阻断报名。
  let amount: number | null = null;
  try {
    const course = await ctx.trainingRepo.getActiveCourse();
    const unit = course?.unit_price != null ? Number(course.unit_price) : NaN;
    amount = Number.isFinite(unit) ? unit : null;
  } catch {
    // 课程查询失败不影响报名主流程
  }

  const result = await ctx.trainingRepo.insertRegistration({
    // 兼容两种入参：新前端传 full_name/phone，旧前端传 contact_name/telephone
    fullName: String(body.full_name || body.contact_name || "").trim(),
    gender: body.gender ? String(body.gender).trim() : null,
    phone: String(body.phone || body.telephone || "").trim(),
    position: body.position || "",
    companyName: body.company_name || "",
    mainProduct: body.main_product || "",
    exportExperience: body.export_experience || "",
    certification: body.certification || "",
    remark: body.remark || "",
    email: body.email || "",
    scheduleId: body.schedule_id != null ? Number(body.schedule_id) : null,
    amount,
    ip: extractClientIp(req),
  });

  return NextResponse.json({ success: true, id: result }, { status: 201 });
});
