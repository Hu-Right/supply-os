/**
 * POST /api/supplier-diagnosis — 提交供应商投标能力诊断（v2）
 *
 * @module app/api/supplier-diagnosis/route
 * @description 与 v1 的三点根本差异：
 *              1. 登录闸门在 API（规范 N4），不再靠前端跳转兜 authenticity；
 *              2. 幂等按 (user_id, supplier_id) 覆盖写（规范 N5），一家公司不会再堆多条；
 *              3. 主体先确定后写诊断（规范 N6）：命中即关联，未命中由本端点建档。
 *              本端点**不写** supplier.claim_status、**不写** crm_users.supplier_id（规范 N7）：
 *              现场确认只是候选，排他认领权只有上传执照 + 人工审核的 /api/supplier-claims 能给。
 *              建档与写诊断不套长事务：与 /api/user/enterprise POST 同口径——建档失败即中断，
 *              写诊断失败时留下的 pending 档案行会被下一次提交按公司名命中复用，不产生重复主体。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getContext } from "@/lib/db/context";
import { SupplierDiagnosisRepo } from "@/lib/repos/supplier-diagnosis.repo";
import { scoreDiagnosis } from "@/lib/services/scoring/diagnosis-v2";
import { parseDiagnosisPayload } from "@/lib/validators/diagnosis";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { EC_INVALID_PARAMS, EC_INTERNAL_ERROR } from "@/shared/constants/api";

const REASON_TEXT: Record<string, string> = {
  missing: "为必答题",
  invalid: "取值不在允许范围内",
  too_long: "内容超长",
};

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const rl = checkRateLimit(req, { windowMs: 10 * 60_000, maxAttempts: 10 }, () => `diag:${auth.userId}`);
  if (rl) return rl;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    routeError(400, EC_INVALID_PARAMS, "请求数据格式错误");
  }

  const parsed = parseDiagnosisPayload(body as Record<string, unknown>);
  if (!parsed.ok) {
    // fieldKey=answers 是「请求体形状不对」而不是「某道题没答」：两者必须分报。
    // 之前的坑就是：形状不匹配却报「english_evidence_level 为必答题」，把排查方向带偏。
    routeError(
      400,
      EC_INVALID_PARAMS,
      parsed.fieldKey === "answers"
        ? "请求体缺少 answers 对象（前后端契约不匹配）"
        : `${parsed.fieldKey} ${REASON_TEXT[parsed.reason] ?? "非法"}`,
    );
  }
  const { companyName, supplierId: claimedId, answers } = parsed.payload;

  const ctx = getContext();
  const directory = ctx.supplier.directoryRepo;

  // ── 主体确定：显式 id → 公司名命中 → 建档 ──
  let supplierId = claimedId ?? 0;
  let claimRequired = false;
  if (supplierId) {
    // 只校验存在性。允许把诊断挂到任意已存在主体上是设计内的行为：本端点不因此获得该主体的
    // 任何写权或归属权，真正的归属仍需走执照审核。
    if (!(await directory.findProfileBits(supplierId))) {
      routeError(400, EC_INVALID_PARAMS, "指定的企业主体不存在");
    }
  } else {
    const hit = await directory.findByCompanyBest(companyName);
    if (hit) {
      supplierId = Number(hit.id);
      claimRequired = String(hit.verify_status ?? "") === "done";
    } else {
      supplierId = await directory.insertEnterprise(
        { company: companyName, name_confirmed: companyName },
        { verify_status: "pending", source_channel: "self_register" },
      );
    }
  }
  if (!supplierId) routeError(500, EC_INTERNAL_ERROR, "企业档案创建失败，请稍后重试");

  // 认领提示只对「这不是你的企业」成立：当前账号已绑定该主体时他就是主人，
  // 再提示“请走执照审核认领”是误报（真机案例：vip@qq.com 已绑 18296、claim_status=verified）。
  if (claimRequired) {
    const me = await ctx.user.usersRepo.findProfileById(auth.userId);
    if (Number(me?.supplier_id ?? 0) === supplierId) claimRequired = false;
  }

  const profileBits = (await directory.findProfileBits(supplierId)) ?? { dataQualityScore: null, infoChecked: false };
  const scoring = scoreDiagnosis({ answers, supplier: profileBits });

  try {
    const stored = await new SupplierDiagnosisRepo(getPool()).upsertDiagnosis({
      userId: auth.userId,
      supplierId,
      companyName,
      answers,
      // breakdown 除维度明细外，一并快照红线闸口：报告 PDF 只读快照，
      // 不应为了重现一句提示词再反推评分规则（等级文案可由 gradeDescriptor 从 grade 推导）。
      score: {
        totalScore: scoring.totalScore,
        grade: scoring.grade,
        breakdown: {
          dimensions: scoring.dimensions,
          overrideGateTriggered: scoring.overrideGateTriggered,
          overrideGateReason: scoring.overrideGateReason,
        },
      },
      ip: extractClientIp(req),
    });

    return NextResponse.json({
      code: 0,
      message: "ok",
      data: {
        id: Number(stored.id),
        supplier_id: supplierId,
        claim_required: claimRequired,
        score_total: scoring.totalScore,
        score_grade: scoring.grade,
        grade_label: scoring.gradeLabel,
        dimensions: scoring.dimensions,
        top_gaps: scoring.topGaps,
        override_gate: { triggered: scoring.overrideGateTriggered, reason: scoring.overrideGateReason },
      },
    }, { status: 201 });
  } catch (err) {
    console.error("[supplier-diagnosis POST]", err);
    routeError(500, EC_INTERNAL_ERROR, "诊断提交失败");
  }
});
