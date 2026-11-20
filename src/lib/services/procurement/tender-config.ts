/**
 * 发布配置（采购规则）：按方式派生缺省，采购方可覆盖，发布时消费并冻结
 * @module lib/services/procurement/tender-config
 *
 * @description 设计稿：docs/2026-11-20-采购方式体系与发布流程重设计.md §4.5/§5.1。
 *              P1a 零 ALTER 承载：配置草稿存新表 procurement_tender_configs（一版一条）；
 *              procurement_tenders 沿用 063 已有列（publish_mode/sealed/award_method），
 *              P1b/P1c 的 qa/envelope/eval_template 列先落配置表，tenders 加列走影子表蓝绿。
 *
 *              派生口径（derivePublishConfig，纯函数）：
 *              rfq 且无覆盖配置 → { public, sealed=1, lowest_price, none } —— 与 P0 硬编码逐字段相同；
 *              eoi → { sealed=0, eligibility_filter }；itb/rfp 在 P1b/P1c 拨开关前不可发布。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import {
  AWARD_METHOD,
  AWARD_METHOD_BY_METHOD,
  PROJECT_STATUS,
  SEALED_BY_METHOD,
  TENDER_PUBLISH_MODE,
} from "@/shared/constants/procurement";

export interface TenderConfigRow extends RowDataPacket {
  id: number;
  project_id: number;
  version_no: number;
  publish_mode: string;
  award_method: string | null;
  qa_deadline_at: number | null;
  envelope_policy: string;
  eval_template: string | null;
  lta_base_method: string | null;
  confirmed_by: number | null;
  confirmed_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface TenderConfigView {
  projectId: number;
  versionNo: number;
  publishMode: string;
  awardMethod: string | null;
  qaDeadlineAt: number | null;
  envelopePolicy: string;
  evalTemplate: unknown;
  ltaBaseMethod: string | null;
  confirmedBy: number | null;
  confirmedAt: number | null;
}

/** 发布时的生效配置（derivePublishConfig 输出） */
export interface PublishConfig {
  publishMode: string;
  sealed: boolean;
  awardMethod: string;
  envelopePolicy: string;
}

/** 按方式+覆盖配置推导发布配置（纯函数；rfq 无覆盖 = P0 硬编码值，行为零变化） */
export function derivePublishConfig(
  method: string,
  config: Pick<TenderConfigRow, "publish_mode" | "award_method" | "envelope_policy"> | null,
): PublishConfig {
  const sealed = SEALED_BY_METHOD[method] ?? true;
  const fallbackAward = AWARD_METHOD_BY_METHOD[method] ?? AWARD_METHOD.LOWEST_PRICE;
  const publishMode = String(config?.publish_mode ?? TENDER_PUBLISH_MODE.PUBLIC);
  const awardMethod = String(config?.award_method ?? fallbackAward);
  const envelopePolicy = String(config?.envelope_policy ?? "none");
  return { publishMode, sealed, awardMethod, envelopePolicy };
}

function viewOf(row: TenderConfigRow): TenderConfigView {
  let evalTemplate: unknown = null;
  if (row.eval_template) {
    try {
      evalTemplate = JSON.parse(row.eval_template);
    } catch {
      evalTemplate = null;
    }
  }
  return {
    projectId: Number(row.project_id),
    versionNo: Number(row.version_no),
    publishMode: String(row.publish_mode ?? TENDER_PUBLISH_MODE.PUBLIC),
    awardMethod: row.award_method ?? null,
    qaDeadlineAt: row.qa_deadline_at == null ? null : Number(row.qa_deadline_at),
    envelopePolicy: String(row.envelope_policy ?? "none"),
    evalTemplate,
    ltaBaseMethod: row.lta_base_method ?? null,
    confirmedBy: row.confirmed_by == null ? null : Number(row.confirmed_by),
    confirmedAt: row.confirmed_at == null ? null : Number(row.confirmed_at),
  };
}

/** 读最新配置（向导回填/采购规则区展示） */
export async function getTenderConfig(
  db: Pool,
  projectId: number,
): Promise<TenderConfigView | null> {
  const [rows] = await db.query(
    "SELECT * FROM procurement_tender_configs WHERE project_id = ? ORDER BY version_no DESC, id DESC LIMIT 1",
    [projectId],
  );
  const row = (rows as TenderConfigRow[])[0];
  return row ? viewOf(row) : null;
}

/**
 * 保存配置草稿（draft/need_info 可 upsert；发布后不可改）。
 * 校验：publish_mode ∈ 枚举；award_method 覆盖须 ∈ 值域且不得与方式语义冲突
 * （EOI 只能资格筛选；rfq 只能最低价——覆盖自由度随分期收口）。
 */
export async function saveTenderConfig(
  db: Pool,
  input: {
    projectId: number;
    userId: number;
    config: {
      publishMode?: string;
      awardMethod?: string | null;
      qaDeadlineAt?: number | null;
      envelopePolicy?: string | null;
      evalTemplate?: unknown;
      ltaBaseMethod?: string | null;
    };
    at?: number;
  },
): Promise<
  | { ok: true; config: TenderConfigView }
  | { ok: false; reason: "not_found" | "not_editable" | "invalid_publish_mode" | "invalid_award_method" | "invalid_envelope" }
> {
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

  const method = String(project.method ?? "rfq");
  const c = input.config ?? {};

  const publishMode = String(c.publishMode ?? TENDER_PUBLISH_MODE.PUBLIC);
  if (!Object.values(TENDER_PUBLISH_MODE).includes(publishMode as never)) {
    return { ok: false, reason: "invalid_publish_mode" };
  }

  let awardMethod: string | null = null;
  if (c.awardMethod != null && String(c.awardMethod).length > 0) {
    awardMethod = String(c.awardMethod);
    if (!Object.values(AWARD_METHOD).includes(awardMethod as never)) {
      return { ok: false, reason: "invalid_award_method" };
    }
    if (method === "eoi" && awardMethod !== AWARD_METHOD.ELIGIBILITY_FILTER) {
      return { ok: false, reason: "invalid_award_method" };
    }
    if (method === "rfq" && awardMethod !== AWARD_METHOD.LOWEST_PRICE) {
      return { ok: false, reason: "invalid_award_method" };
    }
  }

  const envelopePolicy = c.envelopePolicy == null ? "none" : String(c.envelopePolicy);
  if (!["none", "tech_fin_split"].includes(envelopePolicy)) {
    return { ok: false, reason: "invalid_envelope" };
  }

  await db.query(
    `INSERT INTO procurement_tender_configs
       (project_id, version_no, publish_mode, award_method, qa_deadline_at, envelope_policy,
        eval_template, lta_base_method, confirmed_by, confirmed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       publish_mode = VALUES(publish_mode), award_method = VALUES(award_method),
       qa_deadline_at = VALUES(qa_deadline_at), envelope_policy = VALUES(envelope_policy),
       eval_template = VALUES(eval_template), lta_base_method = VALUES(lta_base_method),
       updated_at = VALUES(updated_at)`,
    [
      input.projectId,
      project.version_no,
      publishMode,
      awardMethod,
      c.qaDeadlineAt == null ? null : Number(c.qaDeadlineAt),
      envelopePolicy,
      c.evalTemplate == null ? null : JSON.stringify(c.evalTemplate),
      c.ltaBaseMethod == null ? null : String(c.ltaBaseMethod),
      input.userId,
      at,
      at,
      at,
    ],
  );

  const row = await getTenderConfig(db, input.projectId);
  return { ok: true, config: row as TenderConfigView };
}

/**
 * 发布时消费配置（在 applyReviewDecision 事务内调用）：读配置行并把
 * confirmed_* 落为「提交确认人」（全案 F15 采购方内容审批 v1 = 提交即确认）。
 * @returns 生效配置；无配置行时按方式缺省派生
 */
export async function consumeConfigForPublish(
  conn: { query: Pool["query"] },
  projectId: number,
  versionNo: number,
  method: string,
  submitConfirmedBy: number | null,
  at: number,
): Promise<PublishConfig> {
  const [rows] = await conn.query(
    "SELECT * FROM procurement_tender_configs WHERE project_id = ? AND version_no = ? LIMIT 1",
    [projectId, versionNo],
  );
  const row = (rows as TenderConfigRow[])[0] ?? null;
  const config = derivePublishConfig(method, row as PublishSource | null);
  if (row) {
    await conn.query(
      "UPDATE procurement_tender_configs SET confirmed_by = COALESCE(confirmed_by, ?), confirmed_at = COALESCE(confirmed_at, ?), updated_at = ? WHERE id = ?",
      [submitConfirmedBy, at, at, row.id],
    );
  } else {
    await conn.query(
      `INSERT INTO procurement_tender_configs
         (project_id, version_no, publish_mode, envelope_policy, confirmed_by, confirmed_at, created_at, updated_at)
       VALUES (?, ?, ?, 'none', ?, ?, ?, ?)`,
      [projectId, versionNo, config.publishMode, submitConfirmedBy, at, at, at],
    );
  }
  return config;
}

type PublishSource = Pick<TenderConfigRow, "publish_mode" | "award_method" | "envelope_policy">;

/**
 * 提交时把配置随版本前滚（与 method_decisions 同口径）：draft 期配置挂在旧版本上，
 * 提交产生新版本号后复制一条绑定新版本；无任何记录则不合成（发布时按方式缺省派生）。
 * 在 submitProject 事务内调用。
 */
export async function carryTenderConfigToVersion(
  conn: { query: Pool["query"] },
  projectId: number,
  newVersionNo: number,
  submitConfirmedBy: number | null,
  at: number,
): Promise<void> {
  const [rows] = await conn.query(
    "SELECT id, version_no FROM procurement_tender_configs WHERE project_id = ? ORDER BY version_no DESC, id DESC LIMIT 1",
    [projectId],
  );
  const last = (rows as Array<{ id: number; version_no: number }>)[0];
  if (!last || Number(last.version_no) === newVersionNo) return;
  await conn.query(
    `INSERT INTO procurement_tender_configs
       (project_id, version_no, publish_mode, award_method, qa_deadline_at, envelope_policy,
        eval_template, lta_base_method, confirmed_by, confirmed_at, created_at, updated_at)
     SELECT project_id, ?, publish_mode, award_method, qa_deadline_at, envelope_policy,
        eval_template, lta_base_method, ?, ?, created_at, updated_at
       FROM procurement_tender_configs WHERE id = ?`,
    [newVersionNo, submitConfirmedBy, at, last.id],
  );
}
