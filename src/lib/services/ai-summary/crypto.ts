/**
 * 用户 LLM API Key 加解密（AES-256-GCM）
 *
 * @module lib/services/ai-summary/crypto
 * @description api_key 落库前加密、读取后解密。密钥从 LLM_KEY_SECRET 派生
 *              （SHA-256 → 32 字节）。密文格式：base64(iv):base64(tag):base64(ciphertext)。
 */
import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

function getKey(): Buffer {
  const secret = process.env.LLM_KEY_SECRET;
  if (!secret || !secret.trim()) {
    throw new Error("LLM_KEY_SECRET_NOT_CONFIGURED");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

/** 明文 API Key → 加密串 */
export function encryptApiKey(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

/** 加密串 → 明文 API Key（篡改/密钥错误抛错） */
export function decryptApiKey(payload: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("INVALID_CIPHER_FORMAT");
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
