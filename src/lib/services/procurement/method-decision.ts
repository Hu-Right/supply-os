/**
 * 采购方式判定（F08）：规则引擎推荐 + 采购方确认 + 云境复核
 * @module lib/services/procurement/method-decision
 *
 * @description 设计稿：docs/2026-11-20-采购方式体系与发布流程重设计.md §1.3/§4.3。
 *              判定树逻辑在 shared/utils/procurement-method（前后端共用纯函数），
 *              本服务只管 method_decisions 表的落库口径：
 *              · 一次版本一条（唯一键 project+version）；draft/need_info 可重判（upsert）
 *              · 采购方可偏离推荐（须留理由）；可确认方式仅限 PROCUREMENT_METHOD_AVAILABLE
 *              · 云境 feasibility 复核可修正（corrected），修正只发生在发布前
 *              · 提交兜底：历史/API 直调路径若无判定记录，submitProject 会合成一条
 *                passthrough 记录（engine_version='passthrough-v0'），保证表内事实完整
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { PROJECT_STATUS, PROCUREMENT_METHOD_AVAILABLE } from "@/shared/constants/procurement";
import {
  recommendMethodV2,
  type MethodAdvisorInput,
  type MethodRecommendation,
} from "@/shared/utils/procurement-method";

export interface MethodDecisionRow extends RowDataPacket {
  id: number;
  project_id: number;
  version_no: number;
  inputs: string | null;
  recommended_method: string;
  reason_keys: string | null;
  missing_keys: string | null;
  buyer_method: string;
  buyer_note: string | null;
  decided_by: number | null;
  decided_at: number | null;
  review_result: string | null;
  review_method: string | null;
  reviewer: string | null;
  engine_version: string;
  created_at: number;
  updated_at: number;
}

export interface MethodDecisionView {
  projectId: number;
  versionNo: number;
  inputs: MethodAdvisorInput | null;
  recommendedMethod: string;
  reasonKeys: string[];
  missingKeys: string[];
  buyerMethod: string;
  buyerNote: string | null;
  decidedAt: number | null;
  reviewResult: string | null;
  reviewMethod: string | null;
  reviewer: string | null;
  engineVersion: string;
}

export type MethodDecisionResult =
  | { ok: true; decision: MethodDecisionView }
  | {
      ok: false;
      reason:
        | "not_found"
        | "forbidden"
        | "not_editable"
        | "method_not_available"
        | "deviation_note_required"
        | "base_method_required";
    };

function viewOf(row: MethodDecisionRow): MethodDecisionView {
  const parse = (v: string | null): unknown => {
    if (!v) return null;
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  };
  return {
    projectId: Number(row.project_id),
    versionNo: Number(row.version_no),
    inputs: (parse(row.inputs) as MethodAdvisorInput | null) ?? null,
    recommendedMethod: String(row.recommended_method ?? ""),
    reasonKeys: Array.isArray(parse(row.reason_keys)) ? (parse(row.reason_keys) as string[]) : [],
    missingKeys: Array.isArray(parse(row.missing_keys)) ? (parse(row.missing_keys) as string[]) : [],
    buyerMethod: String(row.buyer_method ?? ""),
    buyerNote: row.buyer_note ?? null,
    decidedAt: row.decided_at == null ? null : Number(row.decided_at),
    reviewResult: row.review_result ?? null,
    reviewMethod: row.review_method ?? null,
    reviewer: row.reviewer ?? null,
    engineVersion: String(row.engine_version ?? ""),
  };
}

async function loadRow(db: Pool | { query: Pool["query"] }, projectId: number): Promise<MethodDecisionRow | null> {
  const [rows] = await db.query(
    "SELECT * FROM method_decisions WHERE project_id = ? ORDER BY version_no DESC, id DESC LIMIT 1",
    [projectId],
  );
  return ((rows as MethodDecisionRow[])[0] ?? null) || null;
}

/** 读最新判定（向导回填/核验后台展示） */
export async function getMethodDecision(
  db: Pool,
  projectId: number,
): Promise<MethodDecisionView | null> {
  const row = await loadRow(db, projectId);
  return row ? viewOf(row) : null;
}

/**
 * 保存/重判方式（draft/need_info 可 upsert）。
 * @param input.inputs 七维判定输入（原样快照落库，保证判定可复算可追溯）
 * @param input.buyerMethod 采购方最终确认方式；与推荐不同时必须给 buyerNote
 */
export async function saveMethodDecision(
  db: Pool,
  input: {
    projectId: number;
    userId: number;
    inputs: MethodAdvisorInput;
    buyerMethod: string;
    buyerNote?: string | null;
    at?: number;
  },
): Promise<MethodDecisionResult> {
  const at = input.at ?? Math.floor(Date.now() / 1000);

  const [projRows] = await db.query(
    `SELECT p.id, p.version_no, p.status, p.method FROM procurement_projects p
       JOIN procurement_buyers b ON b.id = p.buyer_id
      WHERE p.id = ? AND b.user_id = ? LIMIT 1`,
    [input.projectId, input.userId],
  );
  const project = (projRows as Array<{ id: number; version_no: number; status: string; method: string }>)[0];
  if (!project) return { ok: false, reason: "not_found" };
  if (project.status !== PROJECT_STATUS.DRAFT && project.status !== PROJECT_STATUS.NEED_INFO) {
    return { ok: false, reason: "not_editable" };
  }

  const buyerMethod = String(input.buyerMethod ?? "").trim().toLowerCase();
  if (!PROCUREMENT_METHOD_AVAILABLE.includes(buyerMethod)) {
    return { ok: false, reason: "method_not_available" };
  }

  const recommendation: MethodRecommendation = recommendMethodV2(input.inputs ?? {});
  const note = String(input.buyerNote ?? "").trim();
  if (buyerMethod !== recommendation.method && note.length === 0) {
    return { ok: false, reason: "deviation_note_required" };
  }
  // LTA 双层定式（P2 实装，校验先行）：选 lta 必须绑定底层竞争方式
  if (buyerMethod === "lta" && !("ltaBaseMethod" in (input.inputs ?? {}))) {
    return { ok: false, reason: "base_method_required" };
  }

  await db.query(
    `INSERT INTO method_decisions
       (project_id, version_no, inputs, recommended_method, reason_keys, missing_keys,
        buyer_method, buyer_note, decided_by, decided_at, engine_version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       inputs = VALUES(inputs), recommended_method = VALUES(recommended_method),
       reason_keys = VALUES(reason_keys), missing_keys = VALUES(missing_keys),
       buyer_method = VALUES(buyer_method), buyer_note = VALUES(buyer_note),
       decided_by = VALUES(decided_by), decided_at = VALUES(decided_at),
       review_result = NULL, review_method = NULL, reviewer = NULL,
       updated_at = VALUES(updated_at)`,
    [
      input.projectId,
      project.version_no,
      JSON.stringify(input.inputs ?? {}),
      recommendation.method,
      JSON.stringify(recommendation.reasonKeys),
      JSON.stringify(recommendation.missingKeys),
      buyerMethod,
      note || null,
      input.userId,
      at,
      "rules-v2",
      at,
      at,
    ],
  );

  const row = await loadRow(db, input.projectId);
  return { ok: true, decision: row ? viewOf(row) : ({} as MethodDecisionView) };
}

/**
 * 提交兜底：无判定记录时合成 passthrough 一条（保证表内事实完整、云境复核有据可依）。
 * 在 submitProject 的事务内调用（复用其连接）；已有记录则原样返回。
 */
export async function ensureDecisionForSubmit(
  conn: { query: Pool["query"] },
  projectId: number,
  versionNo: number,
  method: string,
  userId: number | null,
  at: number,
): Promise<void> {
  const [dup] = await conn.query(
    "SELECT id FROM method_decisions WHERE project_id = ? AND version_no = ? LIMIT 1",
    [projectId, versionNo],
  );
  if ((dup as RowDataPacket[]).length > 0) return;
  await conn.query(
    `INSERT INTO method_decisions
       (project_id, version_no, inputs, recommended_method, reason_keys, missing_keys,
        buyer_method, decided_by, decided_at, engine_version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      projectId,
      versionNo,
      JSON.stringify({ source: "submit_passthrough", objectTypes: [], budgetKnown: true }),
      method,
      JSON.stringify([]),
      JSON.stringify([]),
      method,
      userId,
      at,
      "passthrough-v0",
      at,
      at,
    ],
  );
}

/**
 * 云境 feasibility 复核修正方式（仅发布前；在 applyReviewDecision 事务内调用）。
 * 修正 = projects.method 同事务改写 + 判定记录 review_* 落痕。
 */
export async function applyMethodCorrection(
  conn: { query: Pool["query"] },
  projectId: number,
  versionNo: number,
  correctedMethod: string,
  reviewer: string,
  at: number,
): Promise<boolean> {
  if (!PROCUREMENT_METHOD_AVAILABLE.includes(correctedMethod)) return false;
  await conn.query("UPDATE procurement_projects SET method = ?, updated_at = ? WHERE id = ?", [
    correctedMethod,
    at,
    projectId,
  ]);
  await conn.query(
    `UPDATE method_decisions
        SET review_result = 'corrected', review_method = ?, reviewer = ?, updated_at = ?
      WHERE project_id = ? AND version_no = ?`,
    [correctedMethod, reviewer, at, projectId, versionNo],
  );
  return true;
}

/**
 * 提交时把判定记录随版本前滚：draft 期判定挂在旧版本上，提交产生新版本号后
 * 需要一条绑定新版本的判定（授权书/核验/发布都按版本对齐）。无任何记录时
 * 合成 passthrough（历史/API 直调路径兜底）。在 submitProject 事务内调用。
 */
export async function carryMethodDecisionToVersion(
  conn: { query: Pool["query"] },
  projectId: number,
  newVersionNo: number,
  method: string,
  userId: number | null,
  at: number,
): Promise<void> {
  const [rows] = await conn.query(
    "SELECT * FROM method_decisions WHERE project_id = ? ORDER BY version_no DESC, id DESC LIMIT 1",
    [projectId],
  );
  const last = (rows as MethodDecisionRow[])[0];
  if (!last) {
    await ensureDecisionForSubmit(conn, projectId, newVersionNo, method, userId, at);
    return;
  }
  if (Number(last.version_no) === newVersionNo) return;
  await conn.query(
    `INSERT INTO method_decisions
       (project_id, version_no, inputs, recommended_method, reason_keys, missing_keys,
        buyer_method, buyer_note, decided_by, decided_at, engine_version, created_at, updated_at)
     SELECT project_id, ?, inputs, recommended_method, reason_keys, missing_keys,
        buyer_method, buyer_note, decided_by, decided_at, engine_version, created_at, updated_at
       FROM method_decisions WHERE id = ?`,
    [newVersionNo, last.id],
  );
}
