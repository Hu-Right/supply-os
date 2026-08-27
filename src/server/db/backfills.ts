/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { isParseablePrivateKey, normalizePem } from "../payment/keys";

export async function backfillUserIds(dbPool: any) {
  const tables = [
    "crm_user_subscriptions",
    "crm_payment_orders",
    "crm_user_entitlements",
    "crm_opportunity_unlocks",
    "crm_user_notice_views",
    "crm_notice_interests",
    "crm_user_interest_codes",
    "crm_supplier_claims",
  ];

  for (const table of tables) {
    await dbPool.execute(
      `UPDATE ${table} target
       INNER JOIN crm_users u ON u.user_key = target.user_key
       SET target.user_id = u.id
       WHERE target.user_id IS NULL`
    );
  }
}

export async function backfillUnspscCodeIds(dbPool: any) {
  for (const table of ["crm_bid_notice_unspsc_codes", "crm_bid_opportunity_unspsc_codes"]) {
    await dbPool.execute(
      `UPDATE ${table} bridge
       INNER JOIN crm_unspsc_codes code ON code.code = bridge.code
       SET bridge.code_id = code.id
       WHERE bridge.code_id IS NULL OR bridge.code_id = 0`
    );
  }
}

/**
 * 清洗行业偏好存量脏数据：置空曾被前端静默持久化的推断层级 L4/L5。
 * 现行策略只持久化用户在 UI 中确认过的 L1~L3；残留的 L4/L5 会让
 * resolveUserIndustryProfile 解析出 deepestLevel=5，把行业匹配锁定在
 * 可能错误的推断分支上（且按最深级起探）。
 * 幂等：仅更新非 NULL 行，清洗完成后后续执行零影响行。
 * @returns 受影响行数（>0 时调用方应失效统一搜索缓存）
 */
export async function backfillIndustryPrefsL45Null(dbPool: any): Promise<number> {
  const [result] = await dbPool.execute(
    `UPDATE crm_user_industry_prefs
     SET level4_id = NULL, level5_id = NULL
     WHERE level4_id IS NOT NULL OR level5_id IS NOT NULL`
  );
  return Number((result as { affectedRows?: number })?.affectedRows || 0);
}

export async function hydratePaymentEnvFromDb(dbPool: any) {
  const [rows] = await dbPool.query(
    `SELECT provider, mode, app_id, notify_url, return_url, public_key, private_key_ref, is_active
     FROM crm_payment_provider_configs
     WHERE provider = 'alipay' AND is_active = 1
     ORDER BY id DESC
     LIMIT 1`
  );
  const alipay = (rows as RowDataPacket[])[0];
  if (!alipay) return false;

  // 私钥不可解析（占位符/示例值）时不注入 env、不切 live：
  // 否则下单才在签名环节失败，订单已落库但二维码/支付链接为空
  if (!isParseablePrivateKey(String(alipay.private_key_ref || ""))) {
    console.warn("[hydratePaymentEnvFromDb] crm_payment_provider_configs 中支付宝私钥无法解析，渠道保持未开通；请在后台配置真实商户密钥");
    return false;
  }

  // 配置表可能存裸 base64 密钥体（无 BEGIN/END）：注入前归一化为标准 PEM，
  // alipay-sdk 内部要求 PEM 头存在，否则签名时报 DECODER unsupported
  process.env.PAYMENT_MODE = "live";
  process.env.ALIPAY_APP_ID = alipay.app_id || process.env.ALIPAY_APP_ID || "";
  process.env.ALIPAY_PRIVATE_KEY = normalizePem(String(alipay.private_key_ref || ""), "PRIVATE KEY") || process.env.ALIPAY_PRIVATE_KEY || "";
  process.env.ALIPAY_PUBLIC_KEY = normalizePem(String(alipay.public_key || ""), "PUBLIC KEY") || process.env.ALIPAY_PUBLIC_KEY || "";
  process.env.ALIPAY_NOTIFY_URL = alipay.notify_url || process.env.ALIPAY_NOTIFY_URL || "";
  process.env.ALIPAY_RETURN_URL = alipay.return_url || process.env.ALIPAY_RETURN_URL || "";
  process.env.ALIPAY_SANDBOX = alipay.mode === "sandbox" ? "true" : "false";
  return true;
}
