// 只读探针：查询 vip@qq.com 账号在兴趣/订阅/权益/解锁等表中的实际数据
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "192.168.1.2",
  user: "root",
  password: "123456",
  database: "crm",
  waitForConnections: true,
  connectionLimit: 2,
});

const USER_KEY = "vip@qq.com";

const q = async (label, sql, params = []) => {
  try {
    const [rows] = await pool.query(sql, params);
    console.log(`\n===== ${label} (${rows.length} rows) =====`);
    console.log(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.log(`\n===== ${label} ERROR =====`);
    console.log(err.message);
  }
};

await q(
  "crm_users 用户主表",
  "SELECT id, user_key, email, display_name, membership_tier, account_status, supplier_id, supplier_link_status, created_at FROM crm_users WHERE user_key = ?",
  [USER_KEY]
);

await q(
  "crm_notice_interests 显式兴趣/订阅公告",
  "SELECT id, user_id, notice_id, interest_type, source, note, created_at, updated_at FROM crm_notice_interests WHERE user_key = ? ORDER BY created_at DESC LIMIT 20",
  [USER_KEY]
);

await q(
  "crm_user_interest_codes 行为兴趣码画像",
  "SELECT id, user_id, code_id, code, level, source, weight, created_at, updated_at FROM crm_user_interest_codes WHERE user_key = ? ORDER BY weight DESC LIMIT 20",
  [USER_KEY]
);

await q(
  "crm_user_subscriptions 会员订阅",
  "SELECT id, user_id, plan_code, status, started_at, expires_at, created_at FROM crm_user_subscriptions WHERE user_key = ? ORDER BY id DESC LIMIT 20",
  [USER_KEY]
);

await q(
  "crm_user_entitlements 付费解锁权益",
  "SELECT id, user_id, source_order_no, plan_code, quota_total, quota_used, started_at, expires_at, status FROM crm_user_entitlements WHERE user_key = ? ORDER BY id DESC LIMIT 20",
  [USER_KEY]
);

await q(
  "crm_opportunity_unlocks 解锁流水",
  "SELECT id, user_id, opportunity_id, notice_id, unlock_type, price, unlocked_at FROM crm_opportunity_unlocks WHERE user_key = ? ORDER BY unlocked_at DESC LIMIT 20",
  [USER_KEY]
);

await q(
  "crm_user_industry_prefs 默认行业偏好",
  "SELECT id, user_id, level1_id, level2_id, level3_id, level4_id, level5_id, updated_at FROM crm_user_industry_prefs WHERE user_key = ?",
  [USER_KEY]
);

await q(
  "crm_payment_orders 支付订单",
  "SELECT id, order_no, plan_code, notice_id, amount, status, provider, created_at FROM crm_payment_orders WHERE user_key = ? ORDER BY id DESC LIMIT 10",
  [USER_KEY]
);

await pool.end();
