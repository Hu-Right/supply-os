/**
 * 退订令牌校验（门户侧）
 *
 * 与 intelligence-daily `server/src/modules/outreach/unsubToken.ts` 同构：
 * token = base64url(`${email}|${tenant}`) + "." + HMAC-SHA256(payload, UNSUBSCRIBE_SECRET)
 * 两个仓库必须配置同一个 UNSUBSCRIBE_SECRET；校验无状态、不查库。
 */
import crypto from "node:crypto";

/** 退订邮箱归一：去空白 + 小写（与发送侧 pickPrimaryEmail 产出一致） */
export function normalizeUnsubEmail(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

export interface UnsubTokenPayload {
  email: string;
  tenantId: number;
}

/** 校验 token；签名不对、载荷损坏、邮箱非法一律返回 null */
export function verifyUnsubToken(
  token: string,
  secret: string | undefined = process.env.UNSUBSCRIBE_SECRET,
): UnsubTokenPayload | null {
  const key = String(secret ?? "");
  if (!key) return null;
  const raw = String(token || "").trim();
  const dot = raw.lastIndexOf(".");
  if (dot <= 0 || dot === raw.length - 1) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);

  let payload: string;
  try {
    payload = Buffer.from(body, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expected = crypto.createHmac("sha256", key).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const sep = payload.lastIndexOf("|");
  if (sep <= 0) return null;
  const email = normalizeUnsubEmail(payload.slice(0, sep));
  const tenantId = Number(payload.slice(sep + 1));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Number.isInteger(tenantId)) return null;
  return { email, tenantId };
}