// T-B6/T-E3 语义验证脚本（#11）：用专用测试 user_key 在自有表构造用例，验证
// ① INSERT IGNORE + uk_dedup 去重（D.7）② dismiss ×0.5 衰减 + 0.01 下限保护（E.3）
// ③ weight 软上限 LEAST(500) 封顶（T-E3）④ exclude_dismissed NOT IN 子查询排除（D.6）
// SQL 与 server.ts /api/notices/feedback、persistUserInterestCodes/decayUserInterestCodes 同构，
// 改动需同步两处。测试行仅写自有表，跑完全部清理。
import mysql from "mysql2/promise";

const pool = await mysql.createPool({
  host: "192.168.1.2",
  user: "root",
  password: "123456",
  database: "crm",
  connectionLimit: 2,
});

const TEST_USER = "__test_tb6@local";
const SESSION = "test-session-001";
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  → " + detail : ""}`);
  ok ? pass++ : fail++;
};

// 先清理可能的残留
await pool.execute(`DELETE FROM crm_user_reco_feedback WHERE user_key = ?`, [TEST_USER]);
await pool.execute(`DELETE FROM crm_user_interest_codes WHERE user_key = ?`, [TEST_USER]);

// 取一条真实公告 id 作外键值（只读）
const [[notice]] = await pool.query(`SELECT id FROM crm_bid_notices ORDER BY id DESC LIMIT 1`);
const NID = notice.id;

// ① INSERT IGNORE + uk_dedup：同 (user,notice,session,action) 二次写入应被忽略
const ins = () => pool.query(
  `INSERT IGNORE INTO crm_user_reco_feedback (user_key, notice_id, action, session_id, position)
   VALUES (?, ?, 'impression', ?, 3)`,
  [TEST_USER, NID, SESSION]
);
const [r1] = await ins();
const [r2] = await ins();
check("① 首次写入 affectedRows=1", r1.affectedRows === 1, `got ${r1.affectedRows}`);
check("① 重复写入被 uk_dedup 去重 affectedRows=0", r2.affectedRows === 0, `got ${r2.affectedRows}`);
// 不同 action 同 session 可写
const [r3] = await pool.query(
  `INSERT IGNORE INTO crm_user_reco_feedback (user_key, notice_id, action, session_id) VALUES (?, ?, 'click', ?)`,
  [TEST_USER, NID, SESSION]
);
check("① 同 session 不同 action 可写", r3.affectedRows === 1);

// ② dismiss ×0.5 衰减 + 下限（server.ts decayUserInterestCodes 同构 SQL）
await pool.execute(
  `INSERT INTO crm_user_interest_codes (user_key, code, level, source, weight) VALUES (?, '8010', 2, 'unlock_order', 0.02)`,
  [TEST_USER]
);
const decay = () => pool.execute(
  `UPDATE crm_user_interest_codes SET weight = GREATEST(0.01, weight * ?), updated_at = NOW()
   WHERE user_key = ? AND code IN ('8010')`,
  [0.5, TEST_USER]
);
await decay();
const [[w1]] = await pool.query(`SELECT weight FROM crm_user_interest_codes WHERE user_key = ? AND code = '8010'`, [TEST_USER]);
check("② dismiss ×0.5：0.02 → 0.01", Number(w1.weight) === 0.01, `got ${w1.weight}`);
await decay();
const [[w2]] = await pool.query(`SELECT weight FROM crm_user_interest_codes WHERE user_key = ? AND code = '8010'`, [TEST_USER]);
check("② 下限保护：再衰减仍 0.01 不为 0", Number(w2.weight) === 0.01, `got ${w2.weight}`);

// ③ weight 软上限：499.9 + 0.8 → LEAST 封 500（persistUserInterestCodes 同构 SQL）
await pool.execute(
  `INSERT INTO crm_user_interest_codes (user_key, code, level, source, weight) VALUES (?, '4310', 2, 'feedback_favorite', 499.9)`,
  [TEST_USER]
);
await pool.execute(
  `INSERT INTO crm_user_interest_codes (user_key, code, level, source, weight) VALUES (?, '4310', 2, 'feedback_favorite', 0.8)
   ON DUPLICATE KEY UPDATE weight = LEAST(500, weight + VALUES(weight)), updated_at = NOW()`,
  [TEST_USER]
);
const [[w3]] = await pool.query(`SELECT weight FROM crm_user_interest_codes WHERE user_key = ? AND code = '4310'`, [TEST_USER]);
check("③ 软上限：499.9+0.8 封顶 500", Number(w3.weight) === 500, `got ${w3.weight}`);

// ④ exclude_dismissed：写一条 dismiss 后，NOT IN 子查询应排除该公告
await pool.query(
  `INSERT IGNORE INTO crm_user_reco_feedback (user_key, notice_id, action, session_id) VALUES (?, ?, 'dismiss', ?)`,
  [TEST_USER, NID, SESSION]
);
const [visible] = await pool.query(
  `SELECT n.id FROM crm_bid_notices n
   WHERE n.id = ? AND n.id NOT IN (
     SELECT notice_id FROM crm_user_reco_feedback
     WHERE user_key = ? AND action = 'dismiss' AND created_at >= NOW() - INTERVAL 30 DAY)`,
  [NID, TEST_USER]
);
check("④ exclude_dismissed：dismiss 后该公告被排除", visible.length === 0, `rows=${visible.length}`);
// 其他用户不受影响
const [visibleOther] = await pool.query(
  `SELECT n.id FROM crm_bid_notices n
   WHERE n.id = ? AND n.id NOT IN (
     SELECT notice_id FROM crm_user_reco_feedback
     WHERE user_key = ? AND action = 'dismiss' AND created_at >= NOW() - INTERVAL 30 DAY)`,
  [NID, "__someone_else@local"]
);
check("④ 其他用户不受该 dismiss 影响", visibleOther.length === 1, `rows=${visibleOther.length}`);

// 清理测试行（仅自有表、仅本脚本专用 TEST_USER）
await pool.execute(`DELETE FROM crm_user_reco_feedback WHERE user_key = ?`, [TEST_USER]);
await pool.execute(`DELETE FROM crm_user_interest_codes WHERE user_key = ?`, [TEST_USER]);
const [[left1]] = await pool.query(`SELECT COUNT(*) AS n FROM crm_user_reco_feedback WHERE user_key = ?`, [TEST_USER]);
const [[left2]] = await pool.query(`SELECT COUNT(*) AS n FROM crm_user_interest_codes WHERE user_key = ?`, [TEST_USER]);
console.log(`\n清理完成：feedback 残留=${left1.n}，interest 残留=${left2.n}`);

await pool.end();
console.log(`\nT-B6/T-E3 语义验证：${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
