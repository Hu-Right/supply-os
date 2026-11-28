/**
 * 正式发布（流程第 6/7 步）与撤回/到期
 * @module lib/services/procurement/tender
 *
 * @description 云境核验通过（HMAC 回调）→ 发布：状态 published + bid_notices 投影 +
 *              tender 记录 + rfq_guard 守护登记同事务；发布即匹配（候选生成）事务后
 *              best-effort。发布双闸：当前版本授权书 verified + 采购主体 verified
 *              （全案 F01：未认证主体不得以"已核验真实采购"身份正式发布）。
 *              退回 → need_info（理由≥10 字），项目回到补充态，可改稿重提（版本+1 重签授权）。
 *              撤回（授权书第五条）→ closed/withdrawn + 撤投影 + 守护销账。
 */
import { createHash } from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import {
  PROJECT_STATUS,
  PROJECT_CLOSE_REASON,
  PROCUREMENT_METHOD_AVAILABLE,
  isValidEvalTemplate,
} from "@/shared/constants/procurement";
import { transitionProjectWithin, type TxLike } from "./lifecycle";
import { buildPublicDescription, formatShanghaiDate, removeProjection, upsertProjection } from "./projection";
import type { ProjectRow } from "./projects";
import { isAuthorizationVerified } from "./authorization";
import { isBuyerPublishable } from "./buyers";
import { formatTenderNo } from "./reference";
import { applyMethodCorrection } from "./method-decision";
import { consumeConfigForPublish } from "./tender-config";
import { findMissingCoreDocuments, freezeTenderDocuments } from "./tender-documents";
import { noticeTypeForMethod } from "./projection";
import { deleteNoticeDocuments } from "@/lib/services/meilisearch/client";
import { pushNotificationSafe } from "@/lib/services/notifications";

/**
 * 给采购方账号发站内通知（best-effort）：查收件人 → 写通知，任何失败只 warn。
 * `title` 留空 —— 文案由前端按 type + payload 渲染多语言；空值也避免后端拼中文。
 */
async function notifyBuyer(
  db: Pool,
  buyerId: number,
  n: { type: string; link: string; refId: number; payload: Record<string, unknown>; dedupeKey: string },
): Promise<void> {
  try {
    const [rows] = await db.query("SELECT user_id FROM procurement_buyers WHERE id = ? LIMIT 1", [buyerId]);
    const userId = Number((rows as Array<{ user_id: number | null }>)[0]?.user_id ?? 0);
    if (!userId) return;
    await pushNotificationSafe(db, {
      userId,
      type: n.type,
      title: "",
      link: n.link,
      refId: n.refId,
      payload: n.payload,
      dedupeKey: n.dedupeKey,
    });
  } catch (err) {
    console.warn("[procurement] 站内通知写入失败:", (err as Error).message);
  }
}


export type PublishDecision = "approved" | "rejected";

/** 发布闸未通过项（顺序即判定顺序） */
export type PublishBlocker =
  | "authorization"
  | "buyer"
  | "authorize_publish"
  | "deadline"
  | "auto_review"
  | "override_reason"
  | "method_not_available"
  | "tender_config_invalid";

export interface ReviewDecisionInput {
  projectId: number;
  version: number;
  decision: PublishDecision;
  /** 退回时必填（≥10 字）：需补充什么 */
  reason?: string | null;
  reviewerRef?: string | null;
  /** 回调幂等键（X-Review-Request-Id） */
  callbackId: string;
  /** 推翻自动初审否决结论（need_info/risk）时置 true，并给出 ≥10 字说明 */
  overrideAutoReview?: boolean;
  overrideReason?: string | null;
  /**
   * 方式复核（F06 feasibility 阶段，设计稿 §4.4）：核验员可在发布前修正采购方式。
   * correctedMethod 与项目当前方式不同且 ∈ 开放集时，同事务改写 method 并落判定留痕。
   */
  feasibility?: {
    result?: string | null;
    correctedMethod?: string | null;
    reviewer?: string | null;
  };
  at?: number;
}

export type ReviewDecisionResult =
  | { ok: true; status: string; version: number; tenderNo?: string; duplicate?: boolean }
  | {
      ok: false;
      reason:
        | "not_found"
        | "version_conflict"
        | "illegal_transition"
        | "reason_required"
        | "authorization_required"
        | "buyer_not_verified"
        | "callback_dup_conflict"
        | "publish_blocked";
      /** publish_blocked 时指出具体未通过项，供调用方给出可行动文案 */
      blockedBy?: PublishBlocker;
    };

interface ProjectLockRow extends RowDataPacket {
  id: number;
  reference: string;
  buyer_id: number;
  version_no: number;
  status: string;
  method: string;
  title_zh: string;
  title_en: string | null;
  background: string | null;
  budget_amount: string | number | null;
  budget_currency: string;
  budget_public: number;
  delivery_country: string | null;
  delivery_city: string | null;
  delivery_address: string | null;
  quote_deadline_at: number | null;
  primary_ugt_code: string | null;
  notice_pk: number | null;
  contact_disclosure: string;
  /** F02 授权确认：1=允许云境OS发布给符合条件供应商（发布前置） */
  authorize_publish: number;
}

/** 幂等键指纹：hash(projectId|version|callbackId)，落核验记录 evidence 防重复投递 */
function callbackFingerprint(input: ReviewDecisionInput): string {
  return createHash("sha256")
    .update(`${input.projectId}|${input.version}|${input.callbackId}`, "utf8")
    .digest("hex");
}

/**
 * 云境核验结论落地（HMAC 回调唯一入口）。
 *
 * 幂等（2026-11 修正）：以数据库事实判定 —— `procurement_reviews.callback_id` 列 +
 * `(project_id, version_no, callback_id)` 唯一键（迁移 018）。同一回调键第二次投递
 * 直接回放首次结论（含 tenderNo），不再改状态。旧实现用 `evidence LIKE '%"fp":"…"%'`
 * 匹配 JSON 列，而 MySQL 规范化后是 `{"fp": "…"}`（带空格），**永远命不中** ——
 * 后台每次超时重试都会拿到 409，只能转人工直写库。
 *
 * 发布闸（第 6 步，顺序即判定顺序，全部在状态转移之前，任一不过则工单不消耗、补正后同键重试）：
 *   ① 当前版本授权书 verified
 *   ② 采购主体 verified
 *   ③ 采购方已勾选「授权云境OS发布给供应商」（authorize_publish=1）
 *   ④ 报价截止时间非空（否则发布后永不过期，广场长期挂一条无效需求）
 *   ⑤ 自动初审未否决（result=need_info/risk 时必须带 overrideAutoReview + ≥10 字说明）
 * ⑤ 的意义：自动初审写在提交后（`reviews.ts`），其否决结论此前会被「人工点通过」静默改写成
 * pass，事后无法证明发生过覆盖。现在要求显式推翻并把说明写进 evidence。
 */
export async function applyReviewDecision(
  db: Pool,
  input: ReviewDecisionInput,
): Promise<ReviewDecisionResult> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const fingerprint = callbackFingerprint(input);
  const callbackId = resolveCallbackId(input);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 行锁先于幂等判定：同一项目的并发回调在这里串行化（唯一键是第二道兜底）
    const [rows] = await conn.query("SELECT * FROM procurement_projects WHERE id = ? FOR UPDATE", [input.projectId]);
    const row = (rows as ProjectLockRow[])[0];
    if (!row) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }

    // 幂等：同一 (项目, 版本, 回调键) 已落库 → 回放首次结论
    const [dup] = await conn.query(
      "SELECT id, result FROM procurement_reviews WHERE project_id = ? AND version_no = ? AND callback_id = ? LIMIT 1",
      [input.projectId, input.version, callbackId],
    );
    if ((dup as RowDataPacket[]).length > 0) {
      const [tenderRows] = await conn.query(
        "SELECT tender_no FROM procurement_tenders WHERE project_id = ? AND version_no = ? ORDER BY id DESC LIMIT 1",
        [input.projectId, input.version],
      );
      const tenderNo = (tenderRows as Array<{ tender_no: string | null }>)[0]?.tender_no ?? null;
      await conn.rollback();
      return {
        ok: true,
        status: String(row.status),
        version: Number(row.version_no),
        duplicate: true,
        ...(tenderNo && tenderNo !== "PENDING" ? { tenderNo } : {}),
      };
    }

    if (Number(row.version_no) !== input.version) {
      await conn.rollback();
      return { ok: false, reason: "version_conflict" };
    }
    if (row.status !== PROJECT_STATUS.SUBMITTED && row.status !== PROJECT_STATUS.UNDER_REVIEW) {
      await conn.rollback();
      return { ok: false, reason: "illegal_transition" };
    }

    const approved = input.decision === "approved";

    // 方式复核（F06 feasibility，设计稿 §4.4）：发布前修正采购方式，同事务改写 + 判定留痕。
    // 修正值非法（不在开放集）时按无效载荷忽略，方式闸（checkPublishGates ⑥）兜底拦截。
    let method = String(row.method ?? "rfq");
    const correctedMethod = String(input.feasibility?.correctedMethod ?? "").trim().toLowerCase();
    if (approved && correctedMethod && correctedMethod !== method) {
      const applied = await applyMethodCorrection(
        conn,
        input.projectId,
        input.version,
        correctedMethod,
        String(input.feasibility?.reviewer ?? input.reviewerRef ?? "review-backstage"),
        at,
      );
      if (applied) {
        method = correctedMethod;
        row.method = correctedMethod;
      }
    }

    const target = approved ? PROJECT_STATUS.PUBLISHED : PROJECT_STATUS.NEED_INFO;

    // 退回必须给足理由（采购方要知道补什么）
    if (!approved && (input.reason ?? "").trim().length < 10) {
      await conn.rollback();
      return { ok: false, reason: "reason_required" };
    }

    // 自动初审结论（只认 auto 环节，避免与人工结论互相污染）
    let autoVerdict = "";
    if (approved) {
      const [autoRows] = await conn.query(
        "SELECT result FROM procurement_reviews WHERE project_id = ? AND version_no = ? AND stage = 'auto' ORDER BY id DESC LIMIT 1",
        [input.projectId, input.version],
      );
      autoVerdict = String((autoRows as RowDataPacket[])[0]?.result ?? "");
    }

    if (approved) {
      // ①② 沿用既有契约：授权书 / 主体各返回专属 reason（403 + EC_RFQ_AUTHORIZATION_REQUIRED），
      // 评审后台与告警按这两个码分流，不并入 publish_blocked。
      const authOk = await isAuthorizationVerified(conn as unknown as Pool, input.projectId, input.version);
      if (!authOk) {
        await conn.rollback();
        return { ok: false, reason: "authorization_required" };
      }
      const [buyerRows] = await conn.query("SELECT status FROM procurement_buyers WHERE id = ? LIMIT 1", [
        row.buyer_id,
      ]);
      const buyerStatus = String((buyerRows as Array<{ status: string }>)[0]?.status ?? "");
      if (!isBuyerPublishable({ status: buyerStatus })) {
        await conn.rollback();
        return { ok: false, reason: "buyer_not_verified" };
      }
      // ③④⑤ 本次新增的三道：授权发布勾选 / 报价截止时间 / 自动初审否决
      const blocked = checkPublishGates(row, input, autoVerdict);
      if (blocked) {
        await conn.rollback();
        return { ok: false, reason: "publish_blocked", blockedBy: blocked };
      }
    }

    // 状态转移（同事务）
    const transition = await transitionProjectWithin(conn as unknown as TxLike, {
      projectId: input.projectId,
      to: target,
      actor: "system",
      actorId: null,
      expectVersion: input.version,
      closeReason: null,
      reason: input.reason ?? null,
      at,
      extraSets: approved ? { published_at: at } : {},
    });
    if (!transition.ok) {
      await conn.rollback();
      if (transition.reason === "version_conflict") return { ok: false, reason: "version_conflict" };
      return { ok: false, reason: "illegal_transition" };
    }

    // 核验记录（含幂等键 + 自动初审结论 + 推翻说明）
    await conn.execute(
      `INSERT INTO procurement_reviews (project_id, version_no, stage, result, reviewer, evidence, note, callback_id, created_at)
       VALUES (?, ?, 'requirement', ?, ?, ?, ?, ?, ?)`,
      [
        input.projectId,
        input.version,
        approved ? "pass" : "need_info",
        input.reviewerRef ?? "review-backstage",
        JSON.stringify({
          fp: fingerprint,
          callbackId,
          decision: input.decision,
          autoReview: autoVerdict || "missing",
          override: input.overrideAutoReview
            ? { reason: String(input.overrideReason ?? "").trim() }
            : null,
        }),
        input.reason ?? null,
        callbackId,
        at,
      ],
    );

    let tenderNo: string | null = null;
    if (approved) {
      // 搜索投影：bid_notices（notice_public/宽表/Meili/首页链自动覆盖）
      const [buyerRows] = await conn.query(
        "SELECT org_name, user_id FROM procurement_buyers WHERE id = ? LIMIT 1",
        [row.buyer_id],
      );
      const buyer = (buyerRows as Array<{ org_name: string; user_id: number }>)[0];
      const [itemRows] = await conn.query(
        "SELECT name_zh, spec, quantity, qty_unit FROM procurement_items WHERE project_id = ? ORDER BY lot_id, line_no",
        [input.projectId],
      );
      const description = buildPublicDescription(
        row as unknown as Parameters<typeof buildPublicDescription>[0],
        itemRows as Array<{ name_zh: string; spec: string | null; quantity: string | number | null; qty_unit: string }>,
      );
      // 投影失败必须回滚：否则会留下「published 但搜索侧无投影」的半状态
      const noticePk = await upsertProjection(
        conn as unknown as Pool,
        {
          projectId: input.projectId,
          noticePk: row.notice_pk == null ? null : Number(row.notice_pk),
          reference: String(row.reference),
          buyerOrgName: String(buyer?.org_name ?? ""),
          buyerUserId: buyer?.user_id == null ? null : Number(buyer.user_id),
          row: row as unknown as ProjectRow,
          description,
        },
        at,
      );
      if (noticePk && noticePk !== Number(row.notice_pk ?? 0)) {
        await conn.execute("UPDATE procurement_projects SET notice_pk = ? WHERE id = ?", [noticePk, input.projectId]);
      }
      // 守护登记（与投影同事务）：登记表是「平台行预期归属 + 预期类型码」的可靠真相
      // （platform_notice_guard 平替 rfq_guard：类型码按方式映射，对账不再硬编码 RFQ）
      await conn.query(
        `INSERT INTO platform_notice_guard (notice_id, reference, user_id, expected_notice_type)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE reference = VALUES(reference), user_id = VALUES(user_id),
           expected_notice_type = VALUES(expected_notice_type)`,
        [noticePk, String(row.reference), buyer?.user_id ?? null, noticeTypeForMethod(method)],
      );

      // 提交确认人（全案 F15 采购方内容审批 v1 = 提交即确认，发布时落留痕）
      const [revRows] = await conn.query(
        "SELECT confirmed_by FROM procurement_revisions WHERE project_id = ? AND version_no = ? LIMIT 1",
        [input.projectId, input.version],
      );
      const confirmedBy = (revRows as Array<{ confirmed_by: number | null }>)[0]?.confirmed_by ?? null;
      // 采购规则消费（§4.5）：按方式派生生效配置 —— rfq 无覆盖时逐字段等于 P0 硬编码值（行为零变化）
      const publishConfig = await consumeConfigForPublish(
        conn as unknown as Pool,
        input.projectId,
        input.version,
        method,
        confirmedBy == null ? null : Number(confirmedBy),
        at,
      );
      // 方式专属配置闸：RFP 发布前必须已冻结合法评分模板（权重闭合 technicalMax、门槛线半开区间）
      if (method === "rfp" && !isValidEvalTemplate(publishConfig.evalTemplate)) {
        await conn.rollback();
        return { ok: false, reason: "publish_blocked", blockedBy: "tender_config_invalid" };
      }
      // 方式专属配置闸：ITB 发布前 9 件套核心件必须齐备（F10/F14），答疑截止须早于截标
      if (method === "itb") {
        const missing = await findMissingCoreDocuments(conn as unknown as Pool, input.projectId);
        if (missing.length > 0) {
          console.warn(`[procurement] ITB 发布拦截：缺核心件 ${missing.join(",")}`);
          await conn.rollback();
          return { ok: false, reason: "publish_blocked", blockedBy: "tender_config_invalid" };
        }
        const qaDeadline = Number((publishConfig as { qaDeadlineAt?: number | null }).qaDeadlineAt ?? 0);
        if (qaDeadline > 0 && row.quote_deadline_at != null && qaDeadline >= Number(row.quote_deadline_at)) {
          await conn.rollback();
          return { ok: false, reason: "publish_blocked", blockedBy: "tender_config_invalid" };
        }
      }

      // tender 记录：正式发布编号（PENDING 占位 → OSPT-{年}-{id} 回填）
      const [tIns] = await conn.query(
        `INSERT INTO procurement_tenders
           (project_id, version_no, tender_no, publish_mode, sealed, award_method, status,
            published_at, deadline_at, deadline_tz, created_at)
         VALUES (?, ?, 'PENDING', ?, ?, ?, 'published', ?, ?, 'Asia/Shanghai', ?)`,
        [
          input.projectId,
          input.version,
          publishConfig.publishMode,
          publishConfig.sealed ? 1 : 0,
          publishConfig.awardMethod,
          at,
          row.quote_deadline_at,
          at,
        ],
      );
      const tenderId = Number((tIns as { insertId?: number }).insertId ?? 0);
      tenderNo = formatTenderNo(tenderId, at);
      await conn.query("UPDATE procurement_tenders SET tender_no = ? WHERE id = ?", [tenderNo, tenderId]);
      // ITB 文件包发布冻结（F14）：草稿件挂确认版本并置 published=1（同事务，投影失败整体回滚）
      if (method === "itb") {
        await freezeTenderDocuments(conn, input.projectId, input.version, at);
      }
      await conn.query(
        "UPDATE procurement_projects SET requirement_verify = 'pass', updated_at = ? WHERE id = ?",
        [at, input.projectId],
      );
    } else {
      await conn.query(
        "UPDATE procurement_projects SET requirement_verify = 'need_info', updated_at = ? WHERE id = ?",
        [at, input.projectId],
      );
    }

    await conn.commit();

    // 结论落库后再发站内通知（best-effort）：通知失败不影响已发布/已退回的事实
    const refLink = `/rfq/${input.projectId}/publish`;
    if (approved) {
      await notifyBuyer(db, Number(row.buyer_id), {
        type: "procurement.published",
        link: refLink,
        refId: input.projectId,
        payload: { reference: String(row.reference), projectId: input.projectId, tenderNo: tenderNo ?? null },
        dedupeKey: `procurement.published:${input.projectId}:v${input.version}`,
      });

    } else {
      await notifyBuyer(db, Number(row.buyer_id), {
        type: "procurement.need_info",
        link: refLink,
        refId: input.projectId,
        payload: { reference: String(row.reference), projectId: input.projectId, reason: input.reason ?? null },
        dedupeKey: `procurement.need_info:${input.projectId}:v${input.version}`,
      });
    }

    return { ok: true, status: target, version: input.version, ...(tenderNo ? { tenderNo } : {}) };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * 发布闸 ③④⑤：授权发布勾选 / 报价截止时间 / 自动初审否决。
 * 只判这三项（①② 沿用专属 reason），返回首个未通过项；全部通过返回 null。
 * 顺序即产品语义：没勾授权 → 没截止时间 → 机器结论被否决但没给推翻说明。
 */
function checkPublishGates(
  row: ProjectLockRow,
  input: ReviewDecisionInput,
  autoVerdict: string,
): PublishBlocker | null {
  // ③ 采购方已勾选「授权云境OS发布给供应商」（F02 授权确认）
  if (Number(row.authorize_publish) !== 1) return "authorize_publish";

  // ④ 报价截止时间非空：为空则收标开标器（openDueTenders）扫不到，需求会长期滞留 published
  if (row.quote_deadline_at == null || Number(row.quote_deadline_at) <= 0) return "deadline";

  // ⑤ 自动初审否决必须显式推翻（否则人工一点通过就把机器结论静默改写为 pass）
  if (autoVerdict === "need_info" || autoVerdict === "risk") {
    if (!input.overrideAutoReview) return "auto_review";
    if (String(input.overrideReason ?? "").trim().length < 10) return "override_reason";
  }
  // ⑥ 方式闸：待发布方式必须在当前开放集内（未开放方式不可发布，投影层同样设防）
  if (!PROCUREMENT_METHOD_AVAILABLE.includes(String(row.method ?? ""))) return "method_not_available";
  return null;
}

/** 回调幂等键：优先用调用方 X-Review-Request-Id；缺失时用内容指纹兜底（永不为空串） */
function resolveCallbackId(input: ReviewDecisionInput): string {
  const raw = String(input.callbackId ?? "").trim();
  if (raw) return raw.slice(0, 64);
  return createHash("sha256")
    .update(`${input.projectId}|${input.version}|${input.decision}|${String(input.reason ?? "")}`, "utf8")
    .digest("hex")
    .slice(0, 64);
}

/** 采购方撤回/取消（授权书第五条）：closed + 撤投影 + 守护销账，同事务 */
export async function withdrawProject(
  db: Pool,
  input: { projectId: number; buyerUserId: number; reason?: string | null; at?: number },
): Promise<
  | { ok: true; status: string }
  | { ok: false; reason: "not_found" | "forbidden" | "not_closable" }
> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT p.id, p.status, p.notice_pk FROM procurement_projects p
        JOIN procurement_buyers b ON b.id = p.buyer_id
        WHERE p.id = ? AND b.user_id = ? FOR UPDATE`,
      [input.projectId, input.buyerUserId],
    );
    const row = (rows as Array<{ id: number; status: string; notice_pk: number | null }>)[0];
    if (!row) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }

    const transition = await transitionProjectWithin(conn as unknown as TxLike, {
      projectId: input.projectId,
      to: PROJECT_STATUS.CLOSED,
      actor: "buyer",
      actorId: input.buyerUserId,
      closeReason: PROJECT_CLOSE_REASON.WITHDRAWN,
      reason: input.reason ?? null,
      at,
    });
    if (!transition.ok) {
      await conn.rollback();
      return { ok: false, reason: "not_closable" };
    }

    await removeProjection(conn as unknown as Pool, row.notice_pk == null ? null : Number(row.notice_pk));
    if (row.notice_pk != null) {
      await conn.query("UPDATE procurement_projects SET notice_pk = NULL WHERE id = ?", [input.projectId]);
      // 守护销账：撤回后主行已删除，登记在册会变成对账误报
      await conn.query("DELETE FROM platform_notice_guard WHERE notice_id = ?", [Number(row.notice_pk)]);
    }
    await conn.query(
      "UPDATE procurement_tenders SET status = 'cancelled' WHERE project_id = ? AND status = 'published'",
      [input.projectId],
    );

    await conn.commit();
    // 搜索索引不是事务的一部分：提交后再删，避免回滚时索引已丢
    if (row.notice_pk != null) {
      await deleteNoticeDocuments([Number(row.notice_pk)]).catch((err: Error) => {
        console.warn("[procurement] 撤回后删除搜索索引失败（下轮全量同步会清）:", err.message);
      });
    }
    return { ok: true, status: PROJECT_STATUS.CLOSED };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** 延长截止的远期上限（防脏值）：不晚于 now + 365 天 */
const MAX_DEADLINE_HORIZON_SEC = 365 * 86_400;

export type ExtendDeadlineResult =
  | { ok: true; tenderId: number; oldDeadlineAt: number; newDeadlineAt: number }
  | {
      ok: false;
      reason: "not_found" | "invalid_deadline" | "not_published" | "method_not_allowed";
    };

/**
 * 延长报价截止时间（发布后的采购方自主调整；市场型方式 rfq/eoi 专属）。
 *
 * 业务口径（同业基准 2026-11-28 核实）：
 * - itb/rfp（密封正式型）的延期走招标文件补遗（qa_addendum）通道，不在本入口开放——
 *   密封公平性要求所有潜在投标人获得同等编制时间，正式招标域「提前收口」同业均不提供。
 * - 授权书按「需求编号+版本」绑定（letter_hash 只含 reference/version/主体名/标题），
 *   延期不产生新版本 → 无需重签授权书，已 verified 授权继续有效。
 * - 投影同步只动 bid_notices（deadline/deadline_ts + update_time 顶水位）；
 *   notice_public 的 SSOT 是 build.ts 水位重建，这里不直写。
 * 并发：FOR UPDATE 行锁 + tender UPDATE 带 status='published' 条件（与到期开标器互斥，
 * 开标器先到则本操作得 not_published）；newDeadlineAt 必须晚于当前时刻与现截止（只许顺延）。
 */
export async function extendProjectDeadline(
  db: Pool,
  input: {
    projectId: number;
    buyerUserId: number;
    newDeadlineAt: number;
    reason?: string | null;
    at?: number;
  },
): Promise<ExtendDeadlineResult> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const newDeadlineAt = Math.floor(Number(input.newDeadlineAt));
  if (!Number.isFinite(newDeadlineAt) || newDeadlineAt <= at || newDeadlineAt > at + MAX_DEADLINE_HORIZON_SEC) {
    return { ok: false, reason: "invalid_deadline" };
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT p.id, p.status, p.method, p.notice_pk, p.reference, b.user_id AS buyer_user_id,
              t.id AS tender_id, t.deadline_at AS tender_deadline
         FROM procurement_projects p
         JOIN procurement_buyers b ON b.id = p.buyer_id
         JOIN procurement_tenders t ON t.id = (
           SELECT MAX(t2.id) FROM procurement_tenders t2 WHERE t2.project_id = p.id
         )
        WHERE p.id = ? AND b.user_id = ?
        FOR UPDATE`,
      [input.projectId, input.buyerUserId],
    );
    const row = (rows as Array<{
      id: number;
      status: string;
      method: string;
      notice_pk: number | null;
      reference: string;
      buyer_user_id: number | null;
      tender_id: number;
      tender_deadline: number | null;
    }>)[0];
    // 归属并入 not_found（404 掩护，不泄漏项目存在性——与 withdrawProject 同口径）
    if (!row) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }
    if (row.status !== PROJECT_STATUS.PUBLISHED) {
      await conn.rollback();
      return { ok: false, reason: "not_published" };
    }
    const method = String(row.method ?? "");
    if (method !== "rfq" && method !== "eoi") {
      await conn.rollback();
      return { ok: false, reason: "method_not_allowed" };
    }
    const oldDeadlineAt = Number(row.tender_deadline ?? 0);
    if (!oldDeadlineAt || oldDeadlineAt <= 0) {
      await conn.rollback();
      return { ok: false, reason: "not_published" };
    }
    if (newDeadlineAt <= oldDeadlineAt) {
      await conn.rollback();
      return { ok: false, reason: "invalid_deadline" };
    }

    // status 条件与到期开标器互斥：开标已把 tender 置 closed 时这里 affectedRows=0
    const [upd] = await conn.query(
      "UPDATE procurement_tenders SET deadline_at = ? WHERE id = ? AND status = 'published'",
      [newDeadlineAt, row.tender_id],
    );
    if (Number((upd as { affectedRows?: number }).affectedRows ?? 0) === 0) {
      await conn.rollback();
      return { ok: false, reason: "not_published" };
    }
    await conn.query("UPDATE procurement_projects SET quote_deadline_at = ?, updated_at = ? WHERE id = ?", [
      newDeadlineAt,
      at,
      input.projectId,
    ]);
    // 投影行截止同步（平台行防误伤爬虫行）：update_time 顶水位，服务表/宽表重建链会跟进
    if (row.notice_pk != null) {
      await conn.query(
        "UPDATE bid_notices SET deadline = ?, deadline_ts = ?, update_time = ? WHERE id = ? AND entry_source = 'platform'",
        [formatShanghaiDate(newDeadlineAt), newDeadlineAt * 1000, at, Number(row.notice_pk)],
      );
    }
    await conn.query(
      `INSERT INTO procurement_events
         (project_id, tender_id, actor_type, actor_id, kind, payload, created_ts)
       VALUES (?, ?, 'buyer', ?, 'deadline_extended', ?, ?)`,
      [
        input.projectId,
        row.tender_id,
        input.buyerUserId,
        JSON.stringify({
          oldDeadlineAt,
          newDeadlineAt,
          reason: input.reason == null ? null : String(input.reason).slice(0, 255),
        }),
        at,
      ],
    );

    await conn.commit();

    // 结论落库后再通知（best-effort）：日期串用固定上海时区 ISO 日期，不在后端拼语言文案
    await notifyBuyer(db, Number(row.buyer_user_id ?? 0), {
      type: "procurement.deadline_extended",
      link: `/rfq/${input.projectId}/publish`,
      refId: input.projectId,
      payload: {
        reference: String(row.reference),
        projectId: input.projectId,
        tenderId: Number(row.tender_id),
        oldDeadlineDate: formatShanghaiDate(oldDeadlineAt),
        newDeadlineDate: formatShanghaiDate(newDeadlineAt),
      },
      dedupeKey: `procurement.deadline_extended:${row.tender_id}:${newDeadlineAt}`,
    });

    return { ok: true, tenderId: Number(row.tender_id), oldDeadlineAt, newDeadlineAt };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
