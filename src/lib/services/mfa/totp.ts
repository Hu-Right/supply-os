/**
 * TOTP（RFC 6238）实现 + 密钥加密 + 恢复码
 *
 * @module lib/services/mfa/totp
 * @description 不引入第三方 OTP 依赖：Base32 编解码 + HMAC-SHA1 动态截断即可。
 *              密钥落库前用 AES-256-GCM 加密（MFA_SECRET_KEY，缺省用 JWT_SECRET 派生）。
 *              恢复码只存 SHA-256 哈希（一次性，使用后从数组移除）。
 */
import crypto from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_PERIOD_SECONDS = 30;

// ── Base32 ──

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ── TOTP ──

/** 生成 20 字节随机密钥（Base32 展示给用户/App） */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secret: string, counter: number, digits = 6): string {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).toString();
  return code.padStart(digits, "0");
}

export function currentTimeStep(now = Date.now()): number {
  return Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);
}

export function generateTotpCode(secret: string, now = Date.now()): string {
  return hotp(secret, currentTimeStep(now));
}

/**
 * 验证 TOTP 动态码（允许前后各 1 个时间窗）。
 * @returns 命中的时间步；不匹配返回 null。调用方需自行做“时间步必须大于 last_time_step”防重放。
 */
export function verifyTotpCode(secret: string, code: string, now = Date.now()): number | null {
  const digits = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(digits)) return null;
  const step = currentTimeStep(now);
  for (let offset = -1; offset <= 1; offset += 1) {
    const candidateStep = step + offset;
    const expected = hotp(secret, candidateStep);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(digits))) return candidateStep;
  }
  return null;
}

/** otpauth:// URI（App 扫码/手动输入） */
export function buildOtpauthUri(secret: string, account: string, issuer = "云境国际采购平台"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ── 密钥加密（AES-256-GCM） ──

function encryptionKey(): Buffer {
  const base = process.env.MFA_SECRET_KEY || process.env.JWT_SECRET || "dev-insecure-mfa-key";
  return crypto.createHash("sha256").update(`mfa-secret:${base}`).digest();
}

/** 加密密钥：返回 iv:tag:cipher（base64） */
export function encryptMfaSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

/** 解密密钥；密文损坏返回 null */
export function decryptMfaSecret(payload: string): string | null {
  try {
    const [ivB64, tagB64, dataB64] = payload.split(":");
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ── 恢复码（一次性） ──

export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(crypto.randomBytes(5)).slice(0, 8);
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
}

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashRecoveryCode(code: string): string {
  return crypto.createHash("sha256").update(`mfa-recovery:${normalizeRecoveryCode(code)}`).digest("hex");
}
