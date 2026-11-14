/**
 * 采购项目状态机（唯一状态写点）
 * @module lib/services/procurement/lifecycle
 *
 * @description 全域 `procurement_projects.status` 只经 transitionProjectWithin /
 *              transitionProject 修改：SELECT ... FOR UPDATE 行锁 + expectVersion
 *              乐观校验 + 转移表/角色校验 + 状态变更与事件同事务。机理与旧 rfq-demand
 *              lifecycle 同构（重构前 5 个 route 各自 UPDATE 的教训），但转移表/枚举
 *              换新口径（shared/constants/procurement）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { PROJECT_STATUS, PROJECT_TRANSITIONS } from "@/shared/constants/procurement";

/** 事务句柄（连接对象与 Pool 的 query 同签名，便于事务内复用） */
export type TxLike = { query: Pool["query"]; execute?: Pool["execute"] };

export type ProjectActor = "buyer" | "system";

export interface TransitionProjectInput {
  projectId: number;
  to: string;
  actor: ProjectActor;
  actorId: number | null;
  /** 乐观版本校验：当前 version_no 必须等于该值（改稿竞态防护） */
  expectVersion?: number;
  closeReason?: string | null;
  reason?: string | null;
  at?: number;
  /** 额外 SET 片段（如 published_at），调用方保证合法性 */
  extraSets?: Record<string, unknown>;
}

export type TransitionProjectResult =
  | { ok: true; status: string; versionNo: number }
  | {
      ok: false;
      reason:
        | "not_found"
        | "version_conflict"
        | "illegal_transition"
        | "actor_not_allowed"
        | "close_reason_required";
    };

interface ProjectLockRow extends RowDataPacket {
  id: number;
  status: string;
  version_no: number;
  buyer_id: number;
}

/**
 * 事务内状态转移。调用方负责开启/提交事务（与业务写同事务，杜绝半提交）。
 * 角色/理由校验在此层：buyer 只能主动 draft→submitted、submitted→draft（撤回提交）、
 * published→closed（撤回）；under_review/published 的推进由 system（云境核验回调）执行。
 */
export async function transitionProjectWithin(
  conn: TxLike,
  input: TransitionProjectInput,
): Promise<TransitionProjectResult> {
  const at = input.at ?? Math.floor(Date.now() / 1000);
  const [rows] = await conn.query(
    "SELECT id, status, version_no, buyer_id FROM procurement_projects WHERE id = ? FOR UPDATE",
    [input.projectId],
  );
  const row = (rows as ProjectLockRow[])[0];
  if (!row) return { ok: false, reason: "not_found" };

  if (input.expectVersion !== undefined && Number(row.version_no) !== input.expectVersion) {
    return { ok: false, reason: "version_conflict" };
  }

  const allowed = PROJECT_TRANSITIONS[String(row.status)] ?? [];
  if (!allowed.includes(input.to)) {
    return { ok: false, reason: "illegal_transition" };
  }

  // 角色裁决：进入 under_review/published 的核验推进是 system 动作；buyer 不得直达
  const systemOnlyTargets = new Set<string>([
    PROJECT_STATUS.UNDER_REVIEW,
    PROJECT_STATUS.PUBLISHED,
  ]);
  if (input.actor === "buyer" && systemOnlyTargets.has(input.to)) {
    return { ok: false, reason: "actor_not_allowed" };
  }

  // 终态必须带 close_reason
  if (input.to === PROJECT_STATUS.CLOSED && !input.closeReason) {
    return { ok: false, reason: "close_reason_required" };
  }

  const extraKeys = Object.keys(input.extraSets ?? {});
  const extraSets = extraKeys.map((k) => `\`${k}\` = ?`).join(", ");
  const extraParams = extraKeys.map((k) => (input.extraSets ?? {})[k]);

  // version_no 只随版本确认（revisions）递增，状态转移不改它
  await conn.query(
    `UPDATE procurement_projects
        SET status = ?, close_reason = ?, ${extraSets ? extraSets + ", " : ""}updated_at = ?
      WHERE id = ?`,
    [input.to, input.closeReason ?? null, ...extraParams, at, input.projectId],
  );

  return { ok: true, status: input.to, versionNo: Number(row.version_no) };
}

/** 事务外便捷入口（独立的状态推进，无伴随业务写） */
export async function transitionProject(
  db: Pool,
  input: TransitionProjectInput,
): Promise<TransitionProjectResult> {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await transitionProjectWithin(conn as unknown as TxLike, input);
    if (!result.ok) {
      await conn.rollback();
      return result;
    }
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
