/**
 * POST /api/supplier-diagnosis — 提交供应商投标能力诊断（v2）
 *
 * @module app/api/supplier-diagnosis/route
 * @description 与 v1 的根本差异：
 *              1. 登录闸门在 API（规范 N4），不再靠前端跳转兜 authenticity；
 *              2. 幂等覆盖写：唯一键 uk_supplier(supplier_id)，一司一份
 *                 （2026-11-11 定稿：报告属于公司不属于个人，最后写入者 user_id 落行上）；
 *              3. 主体先确定后写诊断（规范 N6），且**不再建档**（2026-11-11 定稿：
 *                 库里没有就是没有——防止乱输公司名往主数据塞垃圾 pending 主体）。
 *              4. 落库名走 supplier.company SSOT（2026-11-12）：payload 公司名只做按名检索，
 *                 显式 id 提交时客户端叫什么都不入库——company_name 快照防测试/乱名污染
 *                 （曾致『占位』覆盖正名，见诊断表 2026-11-12 影子重排）。
 *              写权闸口（2026-11-11 定稿）：归属人（绑定在该主体上的账号，临时/正式均算）放行；
 *              有主主体（他人绑定 / 认领排他期 / 已归属 / 已认证）非归属人一律 403。
 *              本端点**不写** supplier 的认领状态（`claim_status` 已退役，认领状态由
 *              supplier_claims 派生）、**不写** users.supplier_id（规范 N7）：
 *              现场确认只是候选，排他认领权只有上传执照 + 人工审核的 /api/supplier-claims 能给。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getContext } from "@/lib/db/context";
import { SupplierDiagnosisRepo, diagnosisWriteGateDecision } from "@/lib/repos/supplier-diagnosis.repo";
import { scoreDiagnosis } from "@/lib/services/scoring/diagnosis-v2";
import { parseDiagnosisPayload } from "@/lib/validators/diagnosis";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { extractClientIp } from "@/lib/utils/ip";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { EC_FORBIDDEN, EC_INVALID_PARAMS, EC_INTERNAL_ERROR, EC_DIAGNOSIS_ANSWERS_INCOMPLETE, EC_DIAGNOSIS_ENTITY_NOT_FOUND } from "@/shared/constants/api";

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
      parsed.fieldKey === "answers" ? EC_DIAGNOSIS_ANSWERS_INCOMPLETE : EC_INVALID_PARAMS,
      parsed.fieldKey === "answers"
        ? "请求体缺少 answers 对象（前后端契约不匹配）"
        : `${parsed.fieldKey} ${REASON_TEXT[parsed.reason] ?? "非法"}`,
    );
  }
  const { companyName: typedName, supplierId: claimedId, answers } = parsed.payload;

  const ctx = getContext();
  const directory = ctx.supplier.directoryRepo;

  // ── 主体确定：显式 id → 公司名命中（不再建档：库里没有就是没有，2026-11-11 定稿）──
  // 落库名一律取 supplier.company SSOT：payload 名只做按名检索，显式 id 提交时
  // 客户端叫什么都不入库（2026-11-12 快照防污染口径）。
  let supplierId = claimedId ?? 0;
  let canonicalName = "";
  // 显式 id 路径在此顺带取 D1 评分片段（省一次往返）；按名命中路径延迟到闸口之后
  let profileBits: { dataQualityScore: number | null; infoChecked: boolean; company: string | null } | null = null;
  if (supplierId) {
    profileBits = await directory.findProfileBits(supplierId);
    if (!profileBits) {
      routeError(400, EC_DIAGNOSIS_ENTITY_NOT_FOUND, "指定的企业主体不存在");
    }
    canonicalName = profileBits.company ?? typedName;
  } else {
    const hit = await directory.findByCompanyBest(typedName);
    if (!hit) {
      routeError(
        400,
        EC_DIAGNOSIS_ENTITY_NOT_FOUND,
        "库中未收录该公司，暂不支持新建企业档案；请确认公司名称，或联系客服收录后再诊断",
      );
    }
    supplierId = Number(hit.id);
    canonicalName = hit.company ?? typedName;
  }

  // ── 写权闸口（2026-11-11 定稿）：归属人放行；有主主体非归属人一律 403 ──
  // 诊断即写公司的唯一报告（一司一份），所以对有主主体必须收口到归属人；
  // 判定规则在 diagnosisWriteGateDecision（纯函数、可单测），这里只做编排。
  // 闸口放行且非归属人 = 无主主体上的路人诊断：响应透出 subjectUnclaimed，
  // 结果页据此提示「如为贵公司可发起认领」（直达 /supplier/[id] 认领弹窗）。
  const diagnosisRepo = new SupplierDiagnosisRepo(getPool());
  const gateFacts = await diagnosisRepo.getWriteGateFacts(supplierId, auth.userId);
  if (!gateFacts || !diagnosisWriteGateDecision(gateFacts)) {
    routeError(
      403,
      EC_FORBIDDEN,
      "该公司已被认领或认证，仅归属企业可提交诊断；如为贵公司，请先完成企业认领",
    );
  }
  const subjectUnclaimed = !gateFacts.selfBound;

  // 按名命中路径的主体可能在闸口前后被删：取不到 D1 片段就按空档案评分（与旧口径一致）
  const bits =
    profileBits ??
    (await directory.findProfileBits(supplierId)) ?? {
      dataQualityScore: null,
      infoChecked: false,
      company: typedName,
    };
  const scoring = scoreDiagnosis({ answers, supplier: bits });

  try {
    const stored = await diagnosisRepo.upsertDiagnosis({
      userId: auth.userId,
      supplierId,
      companyName: canonicalName, // SSOT 正名入库；payload 名仅用于检索（2026-11-12）
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
      id: Number(stored.id),
      supplierId,
      subjectUnclaimed,
      scoreTotal: scoring.totalScore,
      scoreGrade: scoring.grade,
      gradeLabel: scoring.gradeLabel,
      dimensions: scoring.dimensions,
      topGaps: scoring.topGaps,
      overrideGate: { triggered: scoring.overrideGateTriggered, reason: scoring.overrideGateReason },
    }, { status: 201 });
  } catch (err) {
    console.error("[supplier-diagnosis POST]", err);
    routeError(500, EC_INTERNAL_ERROR, "诊断提交失败");
  }
});
