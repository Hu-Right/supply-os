/**
 * 发布后邀约编排（流程第 7 步的"送达"这一段）
 * @module lib/services/procurement/invitations
 *
 * @description 2026-11-15：`procurement_matches` 只说明"谁可能合适"，没有人把这件事告诉供应商。
 *              生产实测 `matches.status='invited'` 从未被写过，供应商侧也没有任何入口——
 *              于是"发布即匹配"停在算完分给自己看。
 *
 *              本模块负责把候选变成"已发生的触达"：
 *                1. 频控：同一供应商在冷却期内收到的邀约条数不超过上限（防冷启动期刷屏）；
 *                2. 分流：`supplier_claims.status='approved'`（有账号）走站内信，其余走邮件；
 *                3. 幂等：唯一键 (project_id, supplier_id, version_no) 冲突即视为已邀约，不重复发信；
 *                4. 隔离：单条失败只标 `status='failed'` + `fail_reason`，不中断整批。
 *
 *              一条需求的触达面取决于"有账号的供应商"（当前 22 家 / 96k），
 *              所以邮件是主力通道——8.8 万个可用邮箱，SMTP 未配置时自动降级为仅站内信。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { randomBytes } from "node:crypto";
import { listMatchCandidates } from "./matching";
import { isEmailConfigured, sendProcurementInviteEmail } from "@/lib/services/email";
import { pushNotificationSafe } from "@/lib/services/notifications";

export interface InviteOptions {
  /**
   * 邀约总开关。默认**关闭**（fail-closed）：只有显式 `PROCUREMENT_INVITE_ENABLED=on`
   * 或调用方传 `enabled: true` 才真正投递。关闭时 `dispatchInvitations` 直接返回全 0，
   * 不查候选、不写邀约行、不发任何消息——发布仍会生成候选名单给买方看。
   */
  enabled?: boolean;
  /** 单条需求最多邀约多少家（env PROCUREMENT_INVITE_LIMIT，默认 30） */
  limit?: number;
  /** 冷却期天数（env PROCUREMENT_INVITE_COOLDOWN_DAYS，默认 7） */
  cooldownDays?: number;
  /** 冷却期内同一供应商最多接收条数（env PROCUREMENT_INVITE_COOLDOWN_MAX，默认 3） */
  cooldownMax?: number;
  /**
   * 是否允许发外部邮件。默认**关闭**：只有 `PROCUREMENT_INVITE_EMAIL=on` 且 SMTP 已配置才发。
   * 供应商邮箱多为采集所得，未经显式开启不得群发。
   */
  emailEnabled?: boolean;
  /** 落地页与退订链接的基址（默认 PORTAL_BASE_URL） */
  baseUrl?: string;
}

export interface InviteResult {
  invited: number;
  emailed: number;
  inapp: number;
  skippedCooldown: number;
  skippedDuplicate: number;
  /** 既无站内信收件人、又不允许发邮件：本次触达不到，不留邀约行（供应商注册后可重新命中） */
  skippedNoChannel: number;
  failed: number;
}

const EMPTY_RESULT: InviteResult = {
  invited: 0,
  emailed: 0,
  inapp: 0,
  skippedCooldown: 0,
  skippedDuplicate: 0,
  skippedNoChannel: 0,
  failed: 0,
};

interface ProjectForInvite {
  id: number;
  reference: string;
  title_zh: string | null;
  status: string;
  version_no: number;
  quote_deadline_at: number | null;
  budget_amount: string | null;
  budget_public: number;
}

/** 32 位 hex 令牌：落地页识别来源 + 一键退订 */
export function buildInviteToken(): string {
  return randomBytes(16).toString("hex");
}

/** 读数值型环境变量：缺失或非法时回落到默认值（0 是合法值，用于关闭频控） */
function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function resolveBaseUrl(opts: InviteOptions): string {
  const raw =
    opts.baseUrl ??
    process.env.PORTAL_BASE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://www.osneosmart.com";
  return raw.replace(/\/+$/, "");
}

function formatDeadline(sec: number | null): string | undefined {
  if (!sec) return undefined;
  return new Date(sec * 1000).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function formatBudget(amount: string | null, isPublic: number): string | undefined {
  if (!isPublic || amount == null) return undefined;
  const n = Number(amount);
  if (!Number.isFinite(n)) return undefined;
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

/**
 * 生成并投递一批邀约。best-effort：任何单条失败都不影响已发布的既成事实。
 */
export async function dispatchInvitations(
  db: Pool,
  projectId: number,
  opts: InviteOptions = {},
): Promise<InviteResult> {
  const [projectRows] = (await db.query(
    `SELECT id, reference, title_zh, status, version_no, quote_deadline_at, budget_amount, budget_public
       FROM procurement_projects WHERE id = ? LIMIT 1`,
    [projectId],
  )) as unknown as [ProjectForInvite[]];
  const project = projectRows[0];
  if (!project || project.status !== "published") return { ...EMPTY_RESULT };

  // 总开关：默认关闭（fail-closed）。关闭时连候选都不读，确保"发布"不产生任何对外动作。
  const enabled = opts.enabled ?? process.env.PROCUREMENT_INVITE_ENABLED === "on";
  if (!enabled) return { ...EMPTY_RESULT };

  const limit = Math.max(1, opts.limit ?? envNumber("PROCUREMENT_INVITE_LIMIT", 30));
  const cooldownDays = Math.max(0, opts.cooldownDays ?? envNumber("PROCUREMENT_INVITE_COOLDOWN_DAYS", 7));
  const cooldownMax = Math.max(0, opts.cooldownMax ?? envNumber("PROCUREMENT_INVITE_COOLDOWN_MAX", 3));
  // 邮件默认关闭：只有显式 on 且 SMTP 可用才发。采集来的邮箱未经开启不得群发。
  const emailEnabled =
    opts.emailEnabled ??
    (process.env.PROCUREMENT_INVITE_EMAIL === "on" && isEmailConfigured());
  const baseUrl = resolveBaseUrl(opts);

  const now = Math.floor(Date.now() / 1000);
  const cooldownSince = now - cooldownDays * 86400;

  const candidates = (await listMatchCandidates(db, projectId, limit)).slice(0, limit);
  if (!candidates.length) return { ...EMPTY_RESULT };

  // 一次取回"有账号"的映射，避免逐条查询
  const supplierIds = candidates.map((c) => c.supplierId);
  const accountMap = new Map<number, number>();
  if (supplierIds.length) {
    const [accountRows] = (await db.query(
      "SELECT supplier_id, user_id FROM supplier_claims WHERE status = 'approved' AND supplier_id IN (?)",
      [supplierIds],
    )) as unknown as [RowDataPacket[]];
    for (const row of accountRows) {
      const sid = Number(row.supplier_id);
      const uid = Number(row.user_id);
      if (Number.isFinite(sid) && Number.isFinite(uid) && uid > 0) accountMap.set(sid, uid);
    }
  }

  const result: InviteResult = { ...EMPTY_RESULT };
  const invitedIds: number[] = [];
  const deadlineText = formatDeadline(project.quote_deadline_at);
  const budgetText = formatBudget(project.budget_amount, Number(project.budget_public));

  for (const candidate of candidates) {
    const supplierId = candidate.supplierId;

    // 频控：冷却期内已收满就不再打扰
    if (cooldownMax > 0) {
      const [cdRows] = (await db.query(
        "SELECT COUNT(*) AS n FROM procurement_invitations WHERE supplier_id = ? AND sent_at > ?",
        [supplierId, cooldownSince],
      )) as unknown as [Array<{ n: number }>];
      if (Number(cdRows[0]?.n ?? 0) >= cooldownMax) {
        result.skippedCooldown += 1;
        continue;
      }
    }

    const userId = accountMap.get(supplierId) ?? null;
    const email = String(candidate.email ?? "").trim();
    const canEmail = emailEnabled && Boolean(email);

    // 没有站内信收件人、又不允许发邮件 → 这条触达不到，不写邀约行
    if (!userId && !canEmail) {
      result.skippedNoChannel += 1;
      continue;
    }

    const channel: "inapp" | "email" = userId ? "inapp" : "email";
    const token = buildInviteToken();
    const inviteLink = `${baseUrl}/rfq/${projectId}?inv=${token}`;
    const unsubscribeUrl = `${baseUrl}/api/procurement/invitations/unsubscribe?token=${token}`;

    const [ins] = await db.query(
      `INSERT IGNORE INTO procurement_invitations
         (project_id, supplier_id, version_no, score, reasons, channel,
          recipient_email, recipient_user_id, token, status, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?)`,
      [
        projectId,
        supplierId,
        Number(project.version_no) || 0,
        Number(candidate.score) || 0,
        String(candidate.reasons ?? "").slice(0, 500),
        channel,
        channel === "email" ? email : null,
        userId,
        token,
        now,
      ],
    );
    const affected = Number((ins as { affectedRows?: number }).affectedRows ?? 0);
    if (affected === 0) {
      // 唯一键命中：该版本已经邀约过这家，不重复打扰
      result.skippedDuplicate += 1;
      continue;
    }
    const inviteId = Number((ins as { insertId?: number }).insertId ?? 0);
    result.invited += 1;
    invitedIds.push(supplierId);

    try {
      if (channel === "inapp" && userId) {
        await pushNotificationSafe(db, {
          userId,
          type: "procurement.invited",
          title: "",
          link: `/rfq/${projectId}?inv=${token}`,
          refId: projectId,
          payload: {
            projectId,
            reference: project.reference,
            title: project.title_zh,
            deadlineAt: project.quote_deadline_at,
            inviteId,
          },
          dedupeKey: `procurement.invited:${projectId}:${supplierId}`,
        });
        result.inapp += 1;
      } else {
        await sendProcurementInviteEmail(email, {
          title: project.title_zh || project.reference,
          link: inviteLink,
          deadlineText,
          budgetText,
          unsubscribeUrl,
        });
        result.emailed += 1;
      }
    } catch (err) {
      result.failed += 1;
      const reason = (err instanceof Error ? err.message : String(err)).slice(0, 255);
      await db.query(
        "UPDATE procurement_invitations SET status = 'failed', fail_reason = ? WHERE id = ?",
        [reason, inviteId],
      );
      console.warn(`[procurement] 邀约投递失败 project=${projectId} supplier=${supplierId}: ${reason}`);
    }
  }

  if (invitedIds.length) {
    await db.query(
      "UPDATE procurement_matches SET status = 'invited' WHERE project_id = ? AND supplier_id IN (?)",
      [projectId, invitedIds],
    );
  }

  return result;
}
