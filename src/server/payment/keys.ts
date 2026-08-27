import "server-only";
import crypto from "crypto";

/**
 * 支付密钥校验与 PEM 归一化
 * Payment key validation & PEM normalization
 *
 * @module server/payment/keys
 * @description 渠道注册前置校验：配置表/环境变量中的密钥若为占位符或非法内容，
 *              渠道视为"未开通"（不注册策略），避免下单时才在签名环节失败。
 */

/** 补全 PEM 格式（无 BEGIN/END 包裹时按 64 字符折行补齐） */
export function normalizePem(value: string, label: "PRIVATE KEY" | "PUBLIC KEY"): string {
  const text = String(value || "").trim();
  if (!text || text.includes("-----BEGIN")) return text;
  const body = text.replace(/\s+/g, "").match(/.{1,64}/g)?.join("\n") || text;
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
}

/** 私钥是否为可解析的非对称密钥（PKCS8/PKCS1 均可），占位符/示例值返回 false */
export function isParseablePrivateKey(pem: string): boolean {
  const text = String(pem || "").trim();
  if (!text) return false;
  try {
    crypto.createPrivateKey(normalizePem(text, "PRIVATE KEY"));
    return true;
  } catch {
    return false;
  }
}

/** 公钥是否为可解析的非对称公钥，占位符/示例值返回 false */
export function isParseablePublicKey(pem: string): boolean {
  const text = String(pem || "").trim();
  if (!text) return false;
  try {
    crypto.createPublicKey(normalizePem(text, "PUBLIC KEY"));
    return true;
  } catch {
    return false;
  }
}
