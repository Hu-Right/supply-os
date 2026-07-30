/**
 * 重置测试账号 vip@qq.com 至“保留会员的全新初始态”（写库，需 --execute）。
 *
 * 决策（已与用户确认）：
 *  - 保留会员：membership_tier 保持 'vip'；crm_user_subscriptions、crm_user_entitlements 不删；
 *    但 crm_user_entitlements.quota_used 重置为 0（额度恢复满格）。
 *  - crm_users: display_name→'vip'（邮箱前缀）、supplier_id→NULL、supplier_link_status→'none'、
 *    updated_at→NOW()；保留 password_hash（仍可登录）、membership_tier、account_status、email/user_key/id/created_at。
 *  - 删除其余 10 张行为/历史/供应商/支付订单表中该用户全部行（双键表用 user_key OR user_id 双保险）。
 *  - 不备份（用户明确选择直接删除）。
 *
 * 全程单事务：任一步失败即整体回滚，主表与关联表要么全改要么全不改。
 * 用法：node scripts/reset-vip-account.mjs            仅预演（默认）
 *       node scripts/reset-vip-account.mjs --execute  正式写库
 */
import mysql from "mysql2/promise";

const EXECUTE = process.argv.includes("--execute");
const USER_KEY = "vip@qq.com";

const pool = mysql.createPool({
  host: "192.168.1.2", user: "root", password: "123456", database: "crm", connectionLimit: 2,
});

// 删除名单：保留会员，故不含 crm_user_subscriptions / crm_user_entitlements
const DUAL_KEY = [
  "crm_payment_orders",
  "crm_opportunity_unlocks", "crm_user_notice_views", "crm_notice_interests",
  "crm_user_interest_codes", "crm_user_reco_feedback", "crm_supplier_claims",
];
const KEY_ONLY = ["crm_user_industry_prefs", "crm_reco_weight_profile", "crm_user_search_log"];

console.log(`模式: ${EXECUTE ? "EXECUTE（写库）" : "DRY-RUN（只预演，不写库）"}`);

const [[before]] = await pool.query(
  "SELECT id, display_name, membership_tier, account_status, supplier_id, supplier_link_status FROM crm_users WHERE user_key = ?",
  [USER_KEY]
);
if (!before) { console.log("未找到账号，终止。"); await pool.end(); process.exit(1); }
const userId = before.id;
console.log("重置前主表:", JSON.stringify(before));

// 预览各表待删行数
let totalToDelete = 0;
for (const t of [...DUAL_KEY, ...KEY_ONLY]) {
  const isDual = DUAL_KEY.includes(t);
  const sql = isDual
    ? `SELECT COUNT(*) AS c FROM ${t} WHERE user_key = ? OR user_id = ?`
    : `SELECT COUNT(*) AS c FROM ${t} WHERE user_key = ?`;
  const [[r]] = await pool.query(sql, isDual ? [USER_KEY, userId] : [USER_KEY]);
  if (Number(r.c) > 0) console.log(`  待删 ${t.padEnd(26)}: ${r.c} 行`);
  totalToDelete += Number(r.c);
}
console.log(`关联表待删合计: ${totalToDelete} 行`);

if (!EXECUTE) {
  console.log("\n[dry-run] 未写入任何数据。确认无误后加 --execute 正式执行。");
  await pool.end();
  process.exit(0);
}

// ===== 正式执行：单事务 =====
const conn = await pool.getConnection();
try {
  await conn.beginTransaction();
  let deleted = 0;
  for (const t of DUAL_KEY) {
    const [r] = await conn.execute(`DELETE FROM ${t} WHERE user_key = ? OR user_id = ?`, [USER_KEY, userId]);
    if (r.affectedRows) console.log(`  已删 ${t.padEnd(26)}: ${r.affectedRows} 行`);
    deleted += r.affectedRows;
  }
  for (const t of KEY_ONLY) {
    const [r] = await conn.execute(`DELETE FROM ${t} WHERE user_key = ?`, [USER_KEY]);
    if (r.affectedRows) console.log(`  已删 ${t.padEnd(26)}: ${r.affectedRows} 行`);
    deleted += r.affectedRows;
  }
  const [ur] = await conn.execute(
    `UPDATE crm_users
     SET display_name = 'vip', supplier_id = NULL, supplier_link_status = 'none', updated_at = NOW()
     WHERE user_key = ?`,
    [USER_KEY]
  );
  // 保留会员但额度恢复满格：quota_used → 0
  const [er] = await conn.execute(
    "UPDATE crm_user_entitlements SET quota_used = 0, updated_at = NOW() WHERE user_key = ?",
    [USER_KEY]
  );
  await conn.commit();
  console.log(`\n✅ 事务提交：删除关联表 ${deleted} 行，主表更新 ${ur.affectedRows} 行，权益额度重置 ${er.affectedRows} 行`);
} catch (e) {
  await conn.rollback();
  console.error("❌ 出错已回滚，未改动任何数据:", e.message);
  conn.release();
  await pool.end();
  process.exit(2);
}
conn.release();

// 复验
const [[after]] = await pool.query(
  "SELECT id, user_key, email, display_name, password_hash IS NOT NULL AS has_pwd, membership_tier, account_status, supplier_id, supplier_link_status FROM crm_users WHERE user_key = ?",
  [USER_KEY]
);
console.log("\n重置后主表:", JSON.stringify(after));
let remain = 0;
for (const t of [...DUAL_KEY, ...KEY_ONLY]) {
  const [[r]] = await pool.query(`SELECT COUNT(*) AS c FROM ${t} WHERE user_key = ?`, [USER_KEY]);
  remain += Number(r.c);
}
console.log(`关联表残留行数: ${remain}（应为 0）`);
console.log(remain === 0 ? "✅ 账号已恢复初始态。" : "⚠ 仍有残留，请复查。");

await pool.end();
