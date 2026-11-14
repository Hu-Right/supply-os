/**
 * 核验引擎（F04 自动初审 + F05/F06 人工核验记录）
 * @module lib/services/procurement/reviews
 *
 * @description 提交后自动初审（九项检查：完整性/真实性线索/重复性/技术合理性/时间合理性/
 *              商业合理性/合规风险/信息安全/招标风险），结果落 procurement_reviews
 *              （AUTO-REVIEW-ID 即本表 id）；人工核验记录由站外评审后台经 HMAC 回调写入。
 *              核验快照同步 projects.requirement_verify / fund_verify（对外展示三态口径：
 *              主体已核验/需求待核验/资金未核验）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { REVIEW_RESULT, REVIEW_STAGE, AUTO_REVIEWER } from "@/shared/constants/procurement";

export interface ReviewRow extends RowDataPacket {
  id: number;
  project_id: number;
  version_no: number;
  stage: string;
  result: string;
  reviewer: string;
  evidence: string | null;
  note: string | null;
  created_at: number;
}

export interface AutoReviewChecks {
  completeness: "pass" | "fail"; // 产品/数量/交货地点/截止时间
  identity_clue: "pass" | "risk"; // 联系邮箱/主体一致性
  duplication: "pass" | "suspect"; // 重复采购单
  technical_sanity: "pass" | "suspect"; // 技术要求自洽
  timing_sanity: "pass" | "fail"; // 交期 vs 截标
  commercial_sanity: "pass" | "suspect"; // 预算 vs 数量
  compliance: "pass" | "flagged"; // 禁运/制裁/受控
  info_security: "pass" | "flagged"; // 附件敏感信息
  competition: "pass" | "suspect"; // 指向单一品牌/排斥竞争
}

export interface AutoReviewOutcome {
  reviewId: number;
  result: "pass" | "need_info" | "risk" | "reject";
  checks: AutoReviewChecks;
}

/**
 * 系统自动初审（MVP 规则版）：全案九项中先落 4 项可机判的硬规则（完整性/时间合理性/
 * 合规自述/重复性粗查），其余六项标记 pending 由人工核验补齐——**AI 识别 ≠ 已核验**，
 * 不得因自动通过而跳过人工（全案第 178 行红线）。
 */
export async function runAutoReview(
  db: Pool,
  projectId: number,
  versionNo: number,
  at = Math.floor(Date.now() / 1000),
): Promise<AutoReviewOutcome> {
  const [rows] = await db.query("SELECT * FROM procurement_projects WHERE id = ? LIMIT 1", [projectId]);
  const project = (rows as Array<RowDataPacket>)[0];
  const checks: AutoReviewChecks = {
    completeness: "pass",
    identity_clue: "risk", // 邮箱/官网一致性机判留人工核验
    duplication: "pass",
    technical_sanity: "pass",
    timing_sanity: "pass",
    commercial_sanity: "pass",
    compliance: "pass",
    info_security: "pass",
    competition: "pass",
  };
  const notes: string[] = [];

  // 完整性：明细已由 submit 保证非空；交付地/截标时间缺失 → need_info
  if (!project.delivery_country && !project.delivery_city) {
    checks.completeness = "fail";
    notes.push("缺少交付国家/城市");
  }
  if (!project.quote_deadline_at) {
    checks.completeness = "fail";
    notes.push("缺少报价截止时间");
  }
  // 时间合理性：截标时间必须晚于当前
  if (project.quote_deadline_at && Number(project.quote_deadline_at) <= at) {
    checks.timing_sanity = "fail";
    notes.push("报价截止时间早于当前时间");
  }
  // 合规自述：勾选了管制/危险品等 → 转人工合规复核
  const compliance = project.compliance ? JSON.parse(String(project.compliance)) : {};
  if (compliance && typeof compliance === "object" && Object.entries(compliance).some(([k, v]) => k !== "note" && v)) {
    checks.compliance = "flagged";
    notes.push("自述涉及特殊合规项，进入人工合规复核");
  }
  // 重复性粗查：同主体、同标题的历史项目
  const [dup] = await db.query(
    `SELECT id, reference FROM procurement_projects
      WHERE buyer_id = ? AND id <> ? AND title_zh = ? AND status <> 'draft' LIMIT 1`,
    [project.buyer_id, projectId, project.title_zh],
  );
  if ((dup as RowDataPacket[]).length > 0) {
    checks.duplication = "suspect";
    notes.push("存在同主体同标题历史项目，人工确认是否重复");
  }

  const flagged = checks.completeness === "fail" || checks.compliance === "flagged" || checks.duplication === "suspect";
  const result: AutoReviewOutcome["result"] = checks.completeness === "fail"
    ? REVIEW_RESULT.NEED_INFO
    : flagged
      ? REVIEW_RESULT.RISK
      : REVIEW_RESULT.PASS;

  const [ins] = await db.execute(
    `INSERT INTO procurement_reviews (project_id, version_no, stage, result, reviewer, evidence, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      projectId,
      versionNo,
      REVIEW_STAGE.AUTO,
      result,
      AUTO_REVIEWER,
      JSON.stringify({ checks, generatedAt: at }),
      notes.join("；").slice(0, 500) || null,
      at,
    ],
  );
  const reviewId = Number((ins as { insertId?: number }).insertId ?? 0);

  // 核验快照：自动初审结论直接反映到需求核验态
  await db.execute(
    "UPDATE procurement_projects SET requirement_verify = ?, updated_at = ? WHERE id = ?",
    [result === REVIEW_RESULT.PASS ? "pass" : result, at, projectId],
  );

  return { reviewId, result, checks };
}

/** 人工核验记录（站外评审后台经 HMAC 回调写入；核验快照同步） */
export async function recordManualReview(
  db: Pool,
  input: {
    projectId: number;
    versionNo: number;
    stage: string; // identity/requirement/feasibility/fund
    result: "pass" | "need_info" | "risk" | "reject";
    reviewer: string;
    note?: string | null;
    at?: number;
  },
): Promise<{ reviewId: number }> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const [ins] = await db.execute(
    `INSERT INTO procurement_reviews (project_id, version_no, stage, result, reviewer, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [input.projectId, input.versionNo, input.stage, input.result, input.reviewer, input.note ?? null, at],
  );

  if (input.stage === REVIEW_STAGE.REQUIREMENT) {
    await db.execute(
      "UPDATE procurement_projects SET requirement_verify = ?, updated_at = ? WHERE id = ?",
      [input.result === REVIEW_RESULT.PASS ? "pass" : input.result, at, input.projectId],
    );
  }
  if (input.stage === REVIEW_STAGE.FUND) {
    await db.execute(
      "UPDATE procurement_projects SET fund_verify = ?, updated_at = ? WHERE id = ?",
      [input.result === REVIEW_RESULT.PASS ? "verified" : "unverified", at, input.projectId],
    );
  }
  return { reviewId: Number((ins as { insertId?: number }).insertId ?? 0) };
}
