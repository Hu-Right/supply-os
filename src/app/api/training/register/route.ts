/**
 * POST /api/training/register — 研修班报名（一次写全 N 位学员）
 *
 * @description 2026-11-13 收敛：报名即学员，一行一人，一次请求把所有参训学员写进
 *              `training_enrollments`（企业信息与期次作为同一批报名的快照逐行冗余）。
 *              此前是「报名写 1 行 + 支付成功后异步补 N 行学员」，支付成功而补写失败的窗口
 *              会造成「有钱没名单」，现已在结构上消除。
 *
 *              请求体（前端 snake_case，请求侧允许）：
 *                company_name / main_product / export_experience / certification / remark
 *                schedule_id
 *                participants: [{ full_name, gender?, phone, position?, email? }]
 *
 *              参与者序号由服务端按下标生成（1-based），不信任客户端传入的 participant_no。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import { trainingEnrollmentIdsViewOf } from "@/lib/services/training/view";
import {
  EC_TRAINING_PARTICIPANTS_INVALID,
  EC_TRAINING_SCHEDULE_NOT_FOUND,
} from "@/shared/constants/api";

/** 与下单层 MAX_PARTICIPANTS_PER_ORDER 对齐：报名阶段就拦，别等到支付才报错 */
const MAX_PARTICIPANTS = 50;

interface RawParticipant {
  full_name?: unknown;
  gender?: unknown;
  phone?: unknown;
  position?: unknown;
  email?: unknown;
}

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);

  // ARCH-P3（2026-09-05）：限流补全 — 培训报名写端点，IP 维度 10min/5
  const rl = checkRateLimit(req, { windowMs: 10 * 60_000, maxAttempts: 5 }, () => `training_reg:${extractClientIp(req)}`);
  if (rl) return rl;

  const body = await req.json();
  const ctx = getContext();

  const rawParticipants: RawParticipant[] = Array.isArray(body.participants) ? body.participants : [];
  if (rawParticipants.length === 0) {
    routeError(400, EC_TRAINING_PARTICIPANTS_INVALID, "至少需要一位参训学员");
  }
  if (rawParticipants.length > MAX_PARTICIPANTS) {
    routeError(400, EC_TRAINING_PARTICIPANTS_INVALID, `单次报名最多 ${MAX_PARTICIPANTS} 人`);
  }

  const participants = rawParticipants.map((p, i) => ({
    participant_no: i + 1,
    full_name: String(p.full_name ?? "").trim(),
    gender: p.gender ? String(p.gender).trim() : null,
    phone: String(p.phone ?? "").trim(),
    position: p.position ? String(p.position).trim() : null,
    email: p.email ? String(p.email).trim() : null,
  }));

  for (const p of participants) {
    if (!p.full_name) {
      routeError(400, EC_TRAINING_PARTICIPANTS_INVALID, `第 ${p.participant_no} 位学员姓名不能为空`);
    }
    if (!p.phone) {
      routeError(400, EC_TRAINING_PARTICIPANTS_INVALID, `第 ${p.participant_no} 位学员手机号不能为空`);
    }
  }

  const scheduleId = body.schedule_id != null ? Number(body.schedule_id) : null;
  if (scheduleId == null || !Number.isFinite(scheduleId)) {
    routeError(400, EC_TRAINING_SCHEDULE_NOT_FOUND, "请选择参训期次");
  }

  const ids = await ctx.trainingRepo.createEnrollments({
    userId: auth.userId,
    scheduleId,
    companyName: String(body.company_name ?? "").trim(),
    mainProduct: String(body.main_product ?? "").trim(),
    exportExperience: String(body.export_experience ?? "").trim(),
    certification: String(body.certification ?? "").trim(),
    remark: String(body.remark ?? "").trim(),
    // 企业区「发票/开课通知邮箱」：与 participants[].email（学员个人）分开存，各一个载体
    invoiceEmail: String(body.email ?? "").trim(),
    ip: extractClientIp(req),
    participants,
  });

  return NextResponse.json(
    { success: true, id: ids[0] ?? null, ids: trainingEnrollmentIdsViewOf(ids), count: ids.length },
    { status: 201 },
  );
});
