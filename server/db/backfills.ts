/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import type { RowDataPacket } from "mysql2/promise";

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

  process.env.PAYMENT_MODE = "live";
  process.env.ALIPAY_APP_ID = alipay.app_id || process.env.ALIPAY_APP_ID || "";
  process.env.ALIPAY_PRIVATE_KEY = alipay.private_key_ref || process.env.ALIPAY_PRIVATE_KEY || "";
  process.env.ALIPAY_PUBLIC_KEY = alipay.public_key || process.env.ALIPAY_PUBLIC_KEY || "";
  process.env.ALIPAY_NOTIFY_URL = alipay.notify_url || process.env.ALIPAY_NOTIFY_URL || "";
  process.env.ALIPAY_RETURN_URL = alipay.return_url || process.env.ALIPAY_RETURN_URL || "";
  process.env.ALIPAY_SANDBOX = alipay.mode === "sandbox" ? "true" : "false";
  return true;
}
