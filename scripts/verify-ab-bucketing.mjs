// T-B10 只读探针：与 server.ts A/B 分桶 + 指标 SQL 同构，实测：
// ① FNV-1a 分桶稳定性（同 key 恒同桶）② 放量 0 全员 control（默认关闭/一键回退）
// ③ 分桶均匀性（10% 放量下 1 万随机 key 落桶比例）④ 指标 SQL 只读执行且 <5s
// 规则若在 server.ts 侧变更，本脚本须同步修改
import mysql from "mysql2/promise";

const pool = mysql.createPool({ host: "192.168.1.2", user: "root", password: "123456", database: "crm" });

let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}  → ${detail}`); ok ? pass++ : fail++; };

// ── 同构：server.ts fnv1a32 / recoVariant ──
const fnv1a32 = (input) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};
const recoVariant = (userKey, pct) =>
  pct > 0 && fnv1a32(userKey) % 100 < pct ? "treatment" : "control";

// ① 同 key 恒同桶：同一批 key 重复计算 1000 次结果一致
const sampleKeys = ["user_a@test.com", "13800138000", "guest_x", "用户中文键", "s_key_123"];
let stable = true;
for (const key of sampleKeys) {
  const first = recoVariant(key, 50);
  for (let i = 0; i < 1000; i++) {
    if (recoVariant(key, 50) !== first) { stable = false; break; }
  }
}
check("同一 user_key 桶恒定（50% 放量 ×1000 次重算）", stable, `${sampleKeys.length} 个样本 key`);

// ② 放量 0 → 全员 control（实验默认关闭；改回 0 即一键回退）
let allControl = true;
for (let i = 0; i < 10000; i++) {
  if (recoVariant(`u_${i}`, 0) !== "control") { allControl = false; break; }
}
check("放量 0 时 1 万 key 全员 control", allControl, "默认关闭/一键回退口径");

// ③ 分桶均匀性：10% 放量下 1 万随机 key，treatment 占比应在 8%~12%
let treatmentCnt = 0;
for (let i = 0; i < 10000; i++) {
  if (recoVariant(`user_${i}_${(i * 7919) % 997}`, 10) === "treatment") treatmentCnt++;
}
const ratio = treatmentCnt / 10000;
check("10% 放量下 treatment 占比 8%~12%", ratio >= 0.08 && ratio <= 0.12, `${(ratio * 100).toFixed(2)}%`);

// ④ 指标 SQL：与 /api/admin/reco-ab-metrics 同构，只读执行无错且 <5s
const t0 = Date.now();
try {
  const [rows] = await pool.query(
    `SELECT
       COALESCE(variant, 'control') AS variant,
       COUNT(DISTINCT user_key) AS users,
       SUM(action = 'impression') AS impressions,
       SUM(action = 'click') AS clicks,
       SUM(action = 'unlock') AS unlocks,
       SUM(action = 'dismiss') AS dismisses,
       ROUND(SUM(action = 'click') / NULLIF(SUM(action = 'impression'), 0), 4) AS ctr,
       ROUND(SUM(action = 'unlock') / NULLIF(SUM(action = 'impression'), 0), 4) AS unlock_rate,
       ROUND(SUM(action = 'dismiss') / NULLIF(SUM(action = 'impression'), 0), 4) AS dismiss_rate,
       ROUND(AVG(CASE WHEN action = 'unlock' THEN position END), 2) AS avg_unlock_position
     FROM crm_user_reco_feedback
     WHERE created_at >= NOW() - INTERVAL ? DAY
     GROUP BY COALESCE(variant, 'control')
     ORDER BY variant`,
    [30]
  );
  const elapsed = Date.now() - t0;
  console.log(`  [指标 SQL] ${rows.length} 个桶（${elapsed}ms）`, rows.length ? JSON.stringify(rows) : "（反馈表暂无数据，空结果合法）");
  check("指标 SQL 只读执行无错且 <5s", elapsed < 5000, `${elapsed}ms`);
} catch (err) {
  check("指标 SQL 只读执行无错且 <5s", false, err.message);
}

console.log(`\nT-B10 A/B 分桶验证：${pass} PASS / ${fail} FAIL`);
await pool.end();
process.exit(fail ? 1 : 0);
