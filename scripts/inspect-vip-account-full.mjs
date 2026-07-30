// 只读全量勘察：vip@qq.com 在所有用户关联表中的行数与样本（不写库）
// 覆盖 server.ts backfillUserIds + ensureProcurementSchema 中全部按 user_key/user_id 关联的表
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "192.168.1.2", user: "root", password: "123456", database: "crm", connectionLimit: 2,
});

const USER_KEY = "vip@qq.com";

// 每张表按 user_key 关联（所有相关表都含 user_key 列）；标注是否另有 user_id 列
const TABLES = [
  { name: "crm_user_subscriptions", hasUserId: true },
  { name: "crm_payment_orders", hasUserId: true },
  { name: "crm_user_entitlements", hasUserId: true },
  { name: "crm_opportunity_unlocks", hasUserId: true },
  { name: "crm_user_notice_views", hasUserId: true },
  { name: "crm_notice_interests", hasUserId: true },
  { name: "crm_user_interest_codes", hasUserId: true },
  { name: "crm_user_reco_feedback", hasUserId: true },
  { name: "crm_supplier_claims", hasUserId: true },
  { name: "crm_user_industry_prefs", hasUserId: false },
  { name: "crm_reco_weight_profile", hasUserId: false },
  { name: "crm_user_search_log", hasUserId: false },
];

console.log("========== crm_users 主表当前状态 ==========");
const [[u]] = await pool.query(
  `SELECT id, user_key, email, display_name, password_hash IS NOT NULL AS has_pwd,
          membership_tier, account_status, supplier_id, supplier_link_status, created_at, updated_at
   FROM crm_users WHERE user_key = ?`, [USER_KEY]
);
console.log(JSON.stringify(u, null, 2));
const userId = u?.id ?? null;
console.log(`\n解析得 user_id = ${userId}`);

console.log("\n========== 各关联表行数（按 user_key）==========");
let grand = 0;
for (const t of TABLES) {
  try {
    const [[r]] = await pool.query(`SELECT COUNT(*) AS c FROM ${t.name} WHERE user_key = ?`, [USER_KEY]);
    const c = Number(r.c);
    grand += c;
    // 若有 user_id 列，额外核对是否存在 user_key 匹配但 user_id 不等的行（数据一致性检查）
    let idNote = "";
    if (t.hasUserId && userId != null) {
      const [[m]] = await pool.query(
        `SELECT SUM(user_id <=> ?) AS same, SUM(user_id IS NULL) AS nullid, COUNT(*) AS tot
         FROM ${t.name} WHERE user_key = ?`, [userId, USER_KEY]
      );
      idNote = ` | user_id匹配:${Number(m.same)||0} null:${Number(m.nullid)||0}/${Number(m.tot)||0}`;
    }
    console.log(`  ${t.name.padEnd(28)} : ${c} 行${idNote}`);
  } catch (e) {
    console.log(`  ${t.name.padEnd(28)} : ERROR ${e.message}`);
  }
}
console.log(`\n关联表合计（不含主表）: ${grand} 行`);

// 额外：有无按 user_id 关联但 user_key 不同/为空的遗漏行（双键不一致的极端情况）
if (userId != null) {
  console.log("\n========== 按 user_id 反查（防 user_key 为空的遗漏）==========");
  for (const t of TABLES.filter((x) => x.hasUserId)) {
    try {
      const [[r]] = await pool.query(
        `SELECT COUNT(*) AS c FROM ${t.name} WHERE user_id = ? AND (user_key <> ? OR user_key IS NULL)`,
        [userId, USER_KEY]
      );
      if (Number(r.c) > 0) console.log(`  ⚠ ${t.name}: ${r.c} 行 user_id=${userId} 但 user_key≠${USER_KEY}`);
    } catch { /* 忽略无 user_id 列的表 */ }
  }
  console.log("  （以上若无输出，则不存在双键不一致的遗漏行）");
}

await pool.end();
