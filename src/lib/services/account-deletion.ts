/**
 * 账号注销申请（自助提交 + 冷静期 + 人工核验）
 *
 * @module lib/services/account-deletion
 *
 * @description 对齐大厂注销流程：
 *   1. 提交前短信/邮箱验证码二次确认身份；
 *   2. 提交时检查阻塞项（未支付订单、未完成发票），有则拒绝提交并列出；
 *   3. 提交后进入冷静期（ACCOUNT_DELETION_COOLING_DAYS，默认 7 天），期间重新登录即撤销；
 *   4. 冷静期到期：无阻塞项自动执行注销；有阻塞项转人工；
 *   5. 结果（完成/拒绝）由定时任务通知用户（邮件优先，手机号走通知短信模板）。
 *
 *   执行注销 = 停用账号 + 吊销全部登录会话 + 匿名化个人信息；订单/发票/税务记录保留。
 */
import crypto from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { AccountDeletionRepo, type AccountDeletionStatus } from "../repos/account-deletion.repo";
import { hashVerificationCode } from "./auth";
import { isEmailConfigured, sendNotificationEmail } from "./email";
import { isSmsNoticeConfigured, sendSmsNotice, sendSmsVerificationCode, isSmsConfigured } from "./sms";

export interface AccountDeletionStatusView {
  id: number;
  status: AccountDeletionStatus;
  coolingUntil: string | null;
  blockers: string[];
  createdAt: string;
  handledNote: string | null;
}

export interface SubmitAccountDeletionInput {
  userId: number;
  code: string;
  reason?: string | null;
  contact?: string | null;
}

const CODE_TYPE = "account_delete";
const MAX_CODE_ATTEMPTS = 5;

function coolingDays(): number {
  const n = Number(process.env.ACCOUNT_DELETION_COOLING_DAYS ?? 7);
  return Number.isFinite(n) && n >= 0 ? Math.min(30, Math.floor(n)) : 7;
}

/** 阻塞项：未支付订单、未完成发票（两者都属于“还有未结清事项”） */
export async function checkDeletionBlockers(pool: Pool, userId: number): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
        (SELECT COUNT(*) FROM orders WHERE user_id = ? AND status = 'pending') AS unpaid_orders,
        (SELECT COUNT(*) FROM invoice_requests WHERE user_id = ? AND status IN ('pending', 'issuing')) AS open_invoices`,
    [userId, userId],
  );
  const row = rows[0] ?? {};
  const blockers: string[] = [];
  const unpaid = Number(row.unpaid_orders ?? 0);
  const invoices = Number(row.open_invoices ?? 0);
  if (unpaid > 0) blockers.push(`有 ${unpaid} 笔未支付订单，请先完成支付或取消订单`);
  if (invoices > 0) blockers.push(`有 ${invoices} 张发票未完成，请等待开具或作废`);
  return blockers;
}

/** 账号标识快照：手机优先，其次邮箱 */
async function loadIdentity(pool: Pool, userId: number): Promise<{ identifier: string; phone: string | null; email: string | null }> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT phone, email FROM users WHERE id = ? LIMIT 1",
    [userId],
  );
  const row = rows[0];
  if (!row) return { identifier: "", phone: null, email: null };
  const phone = String(row.phone ?? "").trim() || null;
  const email = String(row.email ?? "").trim() || null;
  return { identifier: phone || email || "", phone, email };
}

/** 发送注销验证码（手机优先，其次邮箱） */
export async function sendDeletionCode(
  pool: Pool,
  userId: number,
  ip: string,
): Promise<{ channel: "sms" | "email"; expiresInSeconds: number }> {
  const { phone, email } = await loadIdentity(pool, userId);
  if (!phone && !email) {
    throw Object.assign(new Error("账号未绑定手机或邮箱，无法验证身份，请联系客服"), { code: "ERR_NO_CHANNEL" });
  }
  const code = String(crypto.randomInt(100000, 1000000));
  const ttlMs = 10 * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);

  await pool.execute(
    "UPDATE password_resets SET used = 1 WHERE user_id = ? AND code_type = ? AND used = 0",
    [userId, CODE_TYPE],
  );
  await pool.execute(
    `INSERT INTO password_resets (user_id, phone, code, code_type, expires_at, ip)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, phone, hashVerificationCode(code), CODE_TYPE, expiresAt, ip],
  );

  if (phone && isSmsConfigured()) {
    await sendSmsVerificationCode(phone, "verify", code);
    return { channel: "sms", expiresInSeconds: ttlMs / 1000 };
  }
  if (email && isEmailConfigured()) {
    await sendNotificationEmail(email, {
      subject: "账号注销验证码",
      heading: "账号注销验证码",
      lines: [`验证码：${code}`, "10 分钟内有效。若非本人操作，请立即修改密码并联系客服。"],
    });
    return { channel: "email", expiresInSeconds: ttlMs / 1000 };
  }
  throw Object.assign(new Error("短信/邮件通道未配置，请联系客服完成身份核验"), { code: "ERR_NO_CHANNEL" });
}

/** 校验注销验证码（错误累加 attempts，超过 5 次拒绝） */
async function verifyDeletionCode(pool: Pool, userId: number, code: string): Promise<void> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, code, attempts FROM password_resets
      WHERE user_id = ? AND code_type = ? AND used = 0 AND expires_at > NOW()
      ORDER BY id DESC LIMIT 1`,
    [userId, CODE_TYPE],
  );
  const row = rows[0];
  if (!row) throw Object.assign(new Error("验证码已失效，请重新获取"), { code: "ERR_CODE_INVALID" });
  if (Number(row.attempts ?? 0) >= MAX_CODE_ATTEMPTS) {
    throw Object.assign(new Error("验证码错误次数过多，请重新获取"), { code: "ERR_CODE_LOCKED" });
  }
  if (String(row.code) !== hashVerificationCode(code.trim())) {
    await pool.execute("UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?", [row.id]);
    throw Object.assign(new Error("验证码不正确"), { code: "ERR_CODE_INVALID" });
  }
  await pool.execute("UPDATE password_resets SET used = 1 WHERE id = ?", [row.id]);
}

/**
 * 提交注销申请：验证码 → 阻塞项检查 → 建单（进入冷静期）。
 * 返回 blocked 表示存在未结清事项，未建单。
 */
export async function submitAccountDeletion(
  pool: Pool,
  input: SubmitAccountDeletionInput,
): Promise<
  | { ok: true; id: number; status: AccountDeletionStatus; coolingUntil: string | null; duplicate: boolean }
  | { ok: false; blocked: true; blockers: string[] }
> {
  const repo = new AccountDeletionRepo(pool);
  const active = await repo.findActive(input.userId);
  if (active) {
    return {
      ok: true,
      id: active.id,
      status: active.status,
      coolingUntil: active.cooling_until,
      duplicate: true,
    };
  }

  await verifyDeletionCode(pool, input.userId, input.code);

  const blockers = await checkDeletionBlockers(pool, input.userId);
  if (blockers.length > 0) {
    return { ok: false, blocked: true, blockers };
  }

  const { identifier } = await loadIdentity(pool, input.userId);
  const days = coolingDays();
  const coolingUntil = days > 0 ? new Date(Date.now() + days * 24 * 3600 * 1000) : null;
  const id = await repo.create({
    userId: input.userId,
    identifier,
    reason: input.reason?.trim() || null,
    contact: input.contact?.trim() || null,
    coolingUntil,
    blockers,
  });

  // 通知运营（未配置收件人时静默跳过）
  const to = (process.env.ACCOUNT_DELETION_NOTIFY_EMAIL || process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "").trim();
  if (to) {
    void sendNotificationEmail(to, {
      subject: `账号注销申请 #${id}`,
      heading: "新的账号注销申请",
      lines: [
        `申请单号：${id}`,
        `用户 ID：${input.userId}`,
        `账号标识：${identifier || "(未绑定)"}`,
        `冷静期至：${coolingUntil ? coolingUntil.toISOString() : "无（立即进入人工核验）"}`,
        `注销原因：${input.reason?.trim() || "(未填写)"}`,
      ],
    }).catch((err) => console.error("[account-deletion] 运营通知失败:", (err as Error).message));
  }

  return {
    ok: true,
    id,
    status: coolingUntil ? "cooling" : "pending",
    coolingUntil: coolingUntil ? coolingUntil.toISOString() : null,
    duplicate: false,
  };
}

export async function accountDeletionStatusViewOf(
  pool: Pool,
  userId: number,
): Promise<AccountDeletionStatusView | null> {
  const row = await new AccountDeletionRepo(pool).latest(userId);
  if (!row) return null;
  const blockers: string[] = (() => {
    if (!row.blockers) return [];
    try {
      return JSON.parse(row.blockers) as string[];
    } catch {
      return [];
    }
  })();
  return {
    id: Number(row.id),
    status: row.status,
    coolingUntil: row.cooling_until,
    blockers,
    createdAt: String(row.created_at),
    handledNote: row.handled_note,
  };
}

/** 冷静期内重新登录 → 撤销注销申请 */
export async function cancelCoolingDeletion(pool: Pool, userId: number): Promise<number> {
  return new AccountDeletionRepo(pool).cancelCooling(userId, "冷静期内重新登录，申请已自动撤销");
}

/**
 * 执行注销（事务）：停用账号 → 吊销会话 → 匿名化 → 单据置 done。
 * force=false 时校验冷静期已结束、且无阻塞项。
 */
export async function executeAccountDeletion(
  pool: Pool,
  requestId: number,
  actor: string,
  note: string | null,
  options: { force?: boolean } = {},
): Promise<{ userId: number }> {
  const conn = await pool.getConnection();
  try {
    const [pre] = await conn.query<RowDataPacket[]>(
      "SELECT user_id FROM account_deletion_requests WHERE id = ? LIMIT 1",
      [requestId],
    );
    const preUserId = Number(pre[0]?.user_id ?? 0);
    const blockers = options.force ? [] : await checkDeletionBlockers(pool, preUserId);
    await conn.beginTransaction();
    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT id, user_id, status, cooling_until FROM account_deletion_requests WHERE id = ? FOR UPDATE",
      [requestId],
    );
    const req = rows[0];
    if (!req) throw Object.assign(new Error("申请单不存在"), { code: "ERR_NOT_FOUND" });
    if (String(req.status) === "done") throw Object.assign(new Error("该申请单已执行"), { code: "ERR_CONFLICT" });
    if (String(req.status) === "rejected") throw Object.assign(new Error("该申请单已被拒绝"), { code: "ERR_CONFLICT" });
    if (String(req.status) === "cancelled") throw Object.assign(new Error("该申请单已在冷静期内撤销"), { code: "ERR_CONFLICT" });

    const userId = Number(req.user_id);
    if (!options.force) {
      if (String(req.status) === "cooling" && req.cooling_until && new Date(req.cooling_until).getTime() > Date.now()) {
        throw Object.assign(new Error("仍在冷静期内，暂不能执行注销"), { code: "ERR_COOLING" });
      }
      if (blockers.length > 0) {
        throw Object.assign(new Error(`存在未结清事项：${blockers.join("；")}`), { code: "ERR_BLOCKED" });
      }
    }

    await conn.execute("UPDATE users SET account_status = 'disabled' WHERE id = ?", [userId]);
    await conn.execute("DELETE FROM refresh_tokens WHERE user_id = ?", [userId]);
    await conn.execute(
      "UPDATE users SET phone = NULL, email = NULL, display_name = NULL, nickname = NULL WHERE id = ?",
      [userId],
    );
    await conn.execute(
      `UPDATE account_deletion_requests
          SET status = 'done', handled_by = ?, handled_note = ?
        WHERE id = ?`,
      [actor, note, requestId],
    );
    await conn.commit();
    return { userId };
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

/** 冷静期到期处理：无阻塞项自动执行，有阻塞项转人工 */
export async function processDueCoolingDeletions(pool: Pool): Promise<{ executed: number; transferred: number }> {
  const repo = new AccountDeletionRepo(pool);
  const due = await repo.listCoolingDue(20);
  let executed = 0;
  let transferred = 0;
  for (const row of due) {
    try {
      const blockers = await checkDeletionBlockers(pool, Number(row.user_id));
      if (blockers.length === 0) {
        await executeAccountDeletion(pool, Number(row.id), "system:cooling", "冷静期到期自动执行", { force: true });
        executed += 1;
      } else {
        await pool.execute(
          `UPDATE account_deletion_requests
              SET status = 'pending', blockers = ?, handled_note = ?
            WHERE id = ?`,
          [JSON.stringify(blockers), `冷静期结束但存在未结清事项：${blockers.join("；")}`, row.id],
        );
        transferred += 1;
      }
    } catch (err) {
      console.error(`[account-deletion] 冷静期处理失败（申请单 ${row.id}）:`, (err as Error).message);
    }
  }
  return { executed, transferred };
}

let smtpMissingLogged = false;

/** 结果通知：邮箱优先；纯手机号走通知短信模板；都没有则标记 skipped */
export async function notifyAccountDeletionResults(
  pool: Pool,
  limit = 50,
): Promise<{ sent: number; skipped: number; failed: number }> {
  const repo = new AccountDeletionRepo(pool);
  const rows = await repo.listUnnotified(limit);
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const target = String(row.identifier ?? "").trim();
    const done = row.status === "done";
    const lines = done
      ? [
          `申请单号：${row.id}`,
          "你的账号已停用，登录会话已全部失效，手机号/邮箱等个人信息已删除或匿名化。",
          "订单、发票与税务记录按法律规定的期限保留。",
        ]
      : [
          `申请单号：${row.id}`,
          `未通过原因：${row.handled_note || "请联系客服了解详情"}`,
          "账号仍可正常使用，可处理后再次提交。",
        ];

    try {
      if (target.includes("@")) {
        if (!isEmailConfigured()) {
          if (!smtpMissingLogged) {
            console.warn("[account-deletion] SMTP 未配置，结果邮件暂不发送（保持待通知）");
            smtpMissingLogged = true;
          }
          continue;
        }
        await sendNotificationEmail(target, {
          subject: done ? "账号注销已完成" : "账号注销申请未通过",
          heading: done ? "账号注销已完成" : "账号注销申请未通过",
          lines,
        });
        await repo.markNotified(Number(row.id), "email");
        sent += 1;
      } else if (isSmsNoticeConfigured()) {
        const okSms = await sendSmsNotice(target, {
          status: done ? "已完成" : "未通过",
          name: String(row.id),
        });
        await repo.markNotified(Number(row.id), okSms ? "sms" : "skipped");
        if (okSms) sent += 1;
        else skipped += 1;
      } else {
        await repo.markNotified(Number(row.id), "skipped");
        skipped += 1;
      }
    } catch (err) {
      failed += 1;
      console.error(`[account-deletion] 结果通知失败（申请单 ${row.id}）:`, (err as Error).message);
    }
  }

  return { sent, skipped, failed };
}
