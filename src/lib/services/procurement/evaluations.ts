/**
 * 评审打分与双信封开封（F18 + RFP 开封时序）
 * @module lib/services/procurement/evaluations
 *
 * @description 设计稿：docs/2026-11-20-采购方式体系与发布流程重设计.md §7.2/§7.3。
 *              时序铁律（防「先看价再打技术分」）：
 *              截标 → 技术封随收标批量开封（opening.ts 写 envelope_openings）→ 技术评审
 *              → 技术总分 ≥ 门槛线者才允许开商务封（openFinancialEnvelope）→ 商务评分
 *              → 综合分 S_i = T_i + 30×P_min/P_i（70/30 口径，模板发布前冻结）。
 *              商务标未开封的响应：比价/列表面对采购方隐藏价格（responses.ts 消费 isFinOpened）。
 *              最终定标仍由采购方在排名参考下自行决定（全案：中标不自动决定）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import {
  FINANCIAL_SCORE_MAX,
  PROJECT_STATUS,
  RESPONSE_ENVELOPE,
  TENDER_STATUS,
  type EvalTemplate,
} from "@/shared/constants/procurement";
import { loadLatestTender, loadProjectRow } from "./responses";
import { pushNotificationSafe } from "@/lib/services/notifications";

export interface EvaluationRow extends RowDataPacket {
  id: number;
  project_id: number;
  version_no: number;
  tender_id: number;
  response_id: number;
  stage: string;
  dimension_key: string;
  score: string | null;
  pass_fail: string | null;
  weight: string | null;
  evaluator: number | null;
  note: string | null;
  created_at: number;
  updated_at: number;
}

export interface EvaluationEntryInput {
  stage: string;
  dimensionKey: string;
  score?: number | null;
  passFail?: string | null;
  note?: string | null;
}

export interface RankingRow {
  responseId: number;
  supplierId: number;
  company: string;
  technicalTotal: number | null;
  financialScore: number | null;
  totalScore: number | null;
  priceTotal: string | null;
  finOpened: boolean;
  /** true=技术未达门槛（商务分不可加） */
  techFailed: boolean;
}

export type EvaluationResult<T> =
  | ({ ok: true } & T)
  | {
      ok: false;
      reason:
        | "not_found"
        | "forbidden"
        | "project_not_published"
        | "tender_not_open"
        | "method_invalid"
        | "template_missing"
        | "dimension_invalid"
        | "score_out_of_range"
        | "stage_not_permitted"
        | "tech_not_passed"
        | "already_opened"
        | "response_invalid"
        | "state_invalid";
    };

/** 读项目冻结的评分模板（tender_configs.eval_template；无配置返回 null） */
export async function getEvalTemplate(db: Pool, projectId: number): Promise<EvalTemplate | null> {
  const [rows] = await db.query(
    "SELECT eval_template FROM procurement_tender_configs WHERE project_id = ? ORDER BY version_no DESC, id DESC LIMIT 1",
    [projectId],
  );
  const raw = (rows as Array<{ eval_template: string | null }>)[0]?.eval_template;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as EvalTemplate;
  } catch {
    return null;
  }
}

/** 技术总分（Σ score，每维 ≤ weight）；无任何技术评分返回 null */
export async function computeTechnicalTotal(
  db: Pool | { query: Pool["query"] },
  responseId: number,
): Promise<number | null> {
  const [rows] = await db.query(
    "SELECT COALESCE(SUM(score), 0) AS total, COUNT(*) AS cnt FROM procurement_evaluations WHERE response_id = ? AND stage = 'technical'",
    [responseId],
  );
  const r = (rows as Array<{ total: string | number; cnt: number }>)[0];
  if (!r || Number(r.cnt) === 0) return null;
  return Number(r.total);
}

/** 商务封是否已开封 */
export async function isFinOpened(
  db: Pool | { query: Pool["query"] },
  responseId: number,
): Promise<boolean> {
  const [rows] = await db.query(
    "SELECT id FROM procurement_envelope_openings WHERE response_id = ? AND envelope = ? LIMIT 1",
    [responseId, RESPONSE_ENVELOPE.FINANCIAL],
  );
  return (rows as RowDataPacket[]).length > 0;
}

interface OwnerProjectRow extends RowDataPacket {
  id: number;
  version_no: number;
  status: string;
  method: string;
}

/** 归属校验 + 发布态项目行 */
async function loadOwnedProject(
  db: Pool,
  projectId: number,
  buyerUserId: number,
): Promise<OwnerProjectRow | null> {
  const [rows] = await db.query(
    `SELECT p.id, p.version_no, p.status, p.method FROM procurement_projects p
       JOIN procurement_buyers b ON b.id = p.buyer_id
      WHERE p.id = ? AND b.user_id = ? LIMIT 1`,
    [projectId, buyerUserId],
  );
  return ((rows as OwnerProjectRow[])[0] ?? null) || null;
}

/**
 * 保存评审打分（upsert；evaluator=NULL 采购方单人，同一 (response,stage,dim) 覆盖重打）。
 * 阶段闸：technical 要求收标开封；financial 要求该响应商务封已开封（44016/44019 语义）。
 */
export async function saveEvaluations(
  db: Pool,
  input: {
    projectId: number;
    buyerUserId: number;
    responseId: number;
    entries: EvaluationEntryInput[];
    evaluator?: number | null;
    at?: number;
  },
): Promise<EvaluationResult<{ saved: number }>> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const project = await loadOwnedProject(db, input.projectId, input.buyerUserId);
  if (!project) return { ok: false, reason: "forbidden" };
  if (project.status !== PROJECT_STATUS.PUBLISHED) return { ok: false, reason: "state_invalid" };
  if (String(project.method) !== "rfp") return { ok: false, reason: "method_invalid" };

  const tender = await loadLatestTender(db, input.projectId);
  if (!tender) return { ok: false, reason: "not_found" };
  if (tender.status !== TENDER_STATUS.CLOSED && tender.status !== TENDER_STATUS.AWARDED) {
    return { ok: false, reason: "tender_not_open" };
  }

  const template = await getEvalTemplate(db, input.projectId);
  if (!template) return { ok: false, reason: "template_missing" };
  const technicalMax = Number(template.technicalMax ?? 70);
  const dimWeight = new Map(template.dimensions.map((d) => [String(d.key), Number(d.weight)]));

  const [respRows] = await db.query(
    "SELECT id, status FROM procurement_responses WHERE id = ? AND project_id = ? LIMIT 1",
    [input.responseId, input.projectId],
  );
  const response = (respRows as Array<{ id: number; status: string }>)[0];
  if (!response) return { ok: false, reason: "not_found" };
  if (!["submitted", "evaluated"].includes(String(response.status))) {
    return { ok: false, reason: "response_invalid" };
  }

  // 阶段闸 + 维度/分值校验（先全量校验再写，避免半批落库）
  let sawFinancial = false;
  for (const e of input.entries) {
    const stage = String(e.stage ?? "");
    if (!["technical", "financial"].includes(stage)) return { ok: false, reason: "stage_not_permitted" };
    const key = String(e.dimensionKey ?? "");
    const weight = dimWeight.get(key);
    if (weight == null) return { ok: false, reason: "dimension_invalid" };
    if (stage === "financial") sawFinancial = true;
    if (e.score != null) {
      const score = Number(e.score);
      if (!Number.isFinite(score) || score < 0 || score > weight) {
        return { ok: false, reason: "score_out_of_range" };
      }
    }
  }
  if (sawFinancial && !(await isFinOpened(db, input.responseId))) {
    return { ok: false, reason: "stage_not_permitted" };
  }
  if (sawFinancial && String(response.status) === "submitted") {
    // 商务分阶段响应仍应处于可评状态（未撤回/未废标）；submitted 允许（评完再定标统一置 evaluated）
  }

  let saved = 0;
  for (const e of input.entries) {
    await db.query(
      `INSERT INTO procurement_evaluations
         (project_id, version_no, tender_id, response_id, stage, dimension_key, score, pass_fail, weight, evaluator, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE score = VALUES(score), pass_fail = VALUES(pass_fail),
         note = VALUES(note), updated_at = VALUES(updated_at)`,
      [
        input.projectId,
        project.version_no,
        tender.id,
        input.responseId,
        String(e.stage),
        String(e.dimensionKey),
        e.score == null ? null : String(Number(e.score)),
        e.passFail == null ? null : String(e.passFail).slice(0, 8),
        dimWeight.get(String(e.dimensionKey)) != null ? String(dimWeight.get(String(e.dimensionKey))) : null,
        input.evaluator ?? null,
        e.note == null ? null : String(e.note).slice(0, 500),
        at,
        at,
      ],
    );
    saved++;
  }
  return { ok: true, saved };
}

/** 读某响应的全部评分行 */
export async function listEvaluations(db: Pool, responseId: number): Promise<EvaluationRow[]> {
  const [rows] = await db.query(
    "SELECT * FROM procurement_evaluations WHERE response_id = ? ORDER BY stage, dimension_key",
    [responseId],
  );
  return rows as EvaluationRow[];
}

/**
 * 开商务封：技术总分 ≥ 门槛线才放行；记录开封时间并落事件。
 * 未开封前该响应的报价对采购方不可见（responses.ts 各读点消费 isFinOpened）。
 */
export async function openFinancialEnvelope(
  db: Pool,
  input: { projectId: number; buyerUserId: number; responseId: number; at?: number },
): Promise<EvaluationResult<{ openedAt: number }>> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const project = await loadOwnedProject(db, input.projectId, input.buyerUserId);
  if (!project) return { ok: false, reason: "forbidden" };
  if (project.status !== PROJECT_STATUS.PUBLISHED) return { ok: false, reason: "state_invalid" };
  if (String(project.method) !== "rfp") return { ok: false, reason: "method_invalid" };

  const tender = await loadLatestTender(db, input.projectId);
  if (!tender) return { ok: false, reason: "not_found" };
  if (tender.status !== TENDER_STATUS.CLOSED && tender.status !== TENDER_STATUS.AWARDED) {
    return { ok: false, reason: "tender_not_open" };
  }
  if (await isFinOpened(db, input.responseId)) {
    const [openedRows] = await db.query(
      "SELECT opened_at FROM procurement_envelope_openings WHERE response_id = ? AND envelope = ? LIMIT 1",
      [input.responseId, RESPONSE_ENVELOPE.FINANCIAL],
    );
    return { ok: true, openedAt: Number((openedRows as Array<{ opened_at: number }>)[0]?.opened_at ?? at) };
  }

  const template = await getEvalTemplate(db, input.projectId);
  if (!template) return { ok: false, reason: "template_missing" };
  const [respRows] = await db.query(
    "SELECT id, status FROM procurement_responses WHERE id = ? AND project_id = ? LIMIT 1",
    [input.responseId, input.projectId],
  );
  const response = (respRows as Array<{ id: number; status: string }>)[0];
  if (!response) return { ok: false, reason: "not_found" };
  if (!["submitted", "evaluated"].includes(String(response.status))) {
    return { ok: false, reason: "response_invalid" };
  }

  const techTotal = await computeTechnicalTotal(db, input.responseId);
  if (techTotal == null) return { ok: false, reason: "stage_not_permitted" };
  const threshold = Number(template.technicalThreshold);
  if (techTotal < threshold) return { ok: false, reason: "tech_not_passed" };

  await db.query(
    `INSERT INTO procurement_envelope_openings
       (tender_id, project_id, response_id, envelope, opened_at, opened_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE opened_at = VALUES(opened_at)`,
    [tender.id, input.projectId, input.responseId, RESPONSE_ENVELOPE.FINANCIAL, at, input.buyerUserId, at],
  );
  await db.query(
    `INSERT INTO procurement_events
       (project_id, version_no, tender_id, response_id, actor_type, actor_id, kind, payload, created_ts)
     VALUES (?, ?, ?, ?, 'buyer', ?, 'fin_opened', ?, ?)`,
    [
      input.projectId,
      project.version_no,
      tender.id,
      input.responseId,
      input.buyerUserId,
      JSON.stringify({ techTotal, threshold }),
      at,
    ],
  );

  // 通知供应商入围商务评审（best-effort）
  try {
    const [supRows] = await db.query(
      `SELECT s.id AS supplier_id FROM procurement_responses r JOIN supplier s ON s.id = r.supplier_id WHERE r.id = ?`,
      [input.responseId],
    );
    const supplierId = Number((supRows as Array<{ supplier_id: number }>)[0]?.supplier_id ?? 0);
    if (supplierId) {
      const userRows = await db.query("SELECT user_id FROM users WHERE supplier_id = ? LIMIT 1", [supplierId]);
      const userId = Number((userRows[0] as Array<{ user_id: number }>)[0]?.user_id ?? 0);
      if (userId) {
        await pushNotificationSafe(db, {
          userId,
          type: "procurement.fin_opened",
          title: "",
          link: `/rfq/${input.projectId}`,
          refId: input.projectId,
          payload: { projectId: input.projectId, responseId: input.responseId },
          dedupeKey: `procurement.fin_opened:${input.responseId}`,
        });
      }
    }
  } catch (err) {
    console.warn("[procurement] 商务开封通知写入失败:", (err as Error).message);
  }

  return { ok: true, openedAt: at };
}

/** 技术封批量开封（收标时由 opening.ts 调用）：全部 submitted 响应各记一行 technical */
export async function openTechnicalEnvelopesForTender(
  conn: { query: Pool["query"] },
  projectId: number,
  tenderId: number,
  at: number,
): Promise<number> {
  const [rows] = await conn.query(
    "SELECT id FROM procurement_responses WHERE project_id = ? AND tender_id = ? AND status = 'submitted'",
    [projectId, tenderId],
  );
  let count = 0;
  for (const row of rows as Array<{ id: number }>) {
    await conn.query(
      `INSERT INTO procurement_envelope_openings
         (tender_id, project_id, response_id, envelope, opened_at, opened_by, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)
       ON DUPLICATE KEY UPDATE opened_at = VALUES(opened_at)`,
      [tenderId, projectId, row.id, RESPONSE_ENVELOPE.TECHNICAL, at, at],
    );
    count++;
  }
  return count;
}

/**
 * 综合评分排名（70/30）：S_i = T_i + 30×P_min/P_i。
 * 未开封商务标的响应：financialScore/totalScore 为 null（价格亦不出）；
 * 技术未达门槛：techFailed=true（不参与商务排名）。
 */
export async function computeComprehensiveRanking(db: Pool, projectId: number): Promise<RankingRow[]> {
  const [rows] = await db.query(
    `SELECT r.id, r.supplier_id, r.status, s.company,
            (SELECT COALESCE(SUM(ri.unit_price * ri.quantity), 0)
               FROM procurement_response_items ri WHERE ri.response_id = r.id) AS price_total
       FROM procurement_responses r
       JOIN supplier s ON s.id = r.supplier_id
      WHERE r.project_id = ? AND r.status IN ('submitted', 'evaluated')
      ORDER BY r.id`,
    [projectId],
  );
  const list = rows as Array<{ id: number; supplier_id: number; company: string; price_total: string | number | null }>;
  const out: RankingRow[] = [];
  const template = await getEvalTemplate(db, projectId);
  for (const row of list) {
    const responseId = Number(row.id);
    const finOpened = await isFinOpened(db, responseId);
    const techTotal = await computeTechnicalTotal(db, responseId);
    const priceTotal = row.price_total == null ? null : Number(row.price_total).toFixed(2);
    let techFailed = false;
    if (template && techTotal != null && techTotal < Number(template.technicalThreshold)) techFailed = true;
    out.push({
      responseId,
      supplierId: Number(row.supplier_id),
      company: String(row.company ?? ""),
      technicalTotal: techTotal,
      financialScore: null,
      totalScore: null,
      priceTotal: finOpened ? priceTotal : null,
      finOpened,
      techFailed,
    });
  }
  // 商务分统一计算（P_min 取已开封响应的最低总价；全案公式）
  const opened = out.filter((r) => r.finOpened && r.priceTotal != null && Number(r.priceTotal) > 0 && !r.techFailed);
  if (opened.length > 0) {
    const minPrice = Math.min(...opened.map((r) => Number(r.priceTotal)));
    for (const r of out) {
      if (r.finOpened && r.priceTotal != null && Number(r.priceTotal) > 0) {
        r.financialScore = Number((FINANCIAL_SCORE_MAX * (minPrice / Number(r.priceTotal))).toFixed(2));
        r.totalScore = r.technicalTotal == null
          ? r.financialScore
          : Number((r.technicalTotal + r.financialScore).toFixed(2));
      }
    }
  }
  out.sort((a, b) => (b.totalScore ?? -1) - (a.totalScore ?? -1));
  return out;
}
