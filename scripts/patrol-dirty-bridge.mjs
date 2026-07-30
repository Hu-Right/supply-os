/**
 * 脏行巡检告警（线 D / Step 9）——只读，不写库、不改代码。
 *
 * 用途：Step 6 回填后、CRM 侧管线整改前的复发监控。桥接表 level1_id 正常值域是
 * 类目大类 id 100~109；若出现两位码前缀（'10'/'42'/'81'…）、字母、空串，即为脏行。
 * 本脚本统计脏行存量、形态归因、近期增量，并按阈值给出告警级别，供每日巡检/定时调用。
 *
 * 用法：
 *   node scripts/patrol-dirty-bridge.mjs               默认巡检（近 1 天增量为复发判据）
 *   node scripts/patrol-dirty-bridge.mjs --since 3      近 3 天新增脏行视为复发
 *   node scripts/patrol-dirty-bridge.mjs --json         追加一行 JSON 汇总（便于采集/告警对接）
 *
 * 退出码：0=正常（无新增脏行）；1=WARN（有新增但未超阈值）；2=CRITICAL（新增超阈值）。
 * 已知无解基线：R5 源头缺码约 395 行（无法解析码），不计入复发判断。
 */
import mysql from "mysql2/promise";

const args = process.argv.slice(2);
const sinceIdx = args.indexOf("--since");
const SINCE_DAYS = sinceIdx >= 0 ? Math.max(1, Number(args[sinceIdx + 1]) || 1) : 1;
const AS_JSON = args.includes("--json");

// 阈值：近 SINCE_DAYS 天新增脏行数 —— 超过 CRITICAL 判严重，[1, CRITICAL] 判警告
const CRITICAL_THRESHOLD = 500;

const pool = mysql.createPool({
  host: "192.168.1.2", user: "root", password: "123456", database: "crm", connectionLimit: 2,
});

const STD = "('100','101','102','103','104','105','106','107','108','109')";
const dirty = `(level1_id = '' OR level1_id IS NULL OR level1_id NOT IN ${STD})`;

async function main() {
  // 1. 存量脏行总数 + 占比
  const [[tot]] = await pool.query("SELECT COUNT(*) AS c FROM crm_bid_notice_unspsc_codes");
  const [[d]] = await pool.query(
    `SELECT COUNT(*) AS c FROM crm_bid_notice_unspsc_codes WHERE ${dirty}`
  );
  const dirtyTotal = Number(d.c);
  const pct = ((dirtyTotal / Number(tot.c)) * 100).toFixed(3);

  // 2. 形态归因（区分 server.ts 前缀指纹 / 字母 / 空）
  const [[shape]] = await pool.query(
    `SELECT
       SUM(code REGEXP '^[0-9]+$' AND level1_id = LEFT(code,2)) AS prefix_pattern,
       SUM(level1_id REGEXP '^[A-Za-z]$') AS letter_pattern,
       SUM(level1_id = '' OR level1_id IS NULL) AS empty_pattern
     FROM crm_bid_notice_unspsc_codes WHERE ${dirty}`
  );

  // 3. 复发判据：近 SINCE_DAYS 天新增脏行（按 created_at）
  const [[recent]] = await pool.query(
    `SELECT COUNT(*) AS c FROM crm_bid_notice_unspsc_codes
     WHERE ${dirty} AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [SINCE_DAYS]
  );
  const newDirty = Number(recent.c);

  // 4. 最新一条脏行（用于定位复发来源）
  const [latestRows] = await pool.query(
    `SELECT notice_id, code, level1_id, created_at FROM crm_bid_notice_unspsc_codes
     WHERE ${dirty} AND created_at IS NOT NULL ORDER BY created_at DESC LIMIT 1`
  );

  // 判级
  let level = "OK", exitCode = 0;
  if (newDirty > CRITICAL_THRESHOLD) { level = "CRITICAL"; exitCode = 2; }
  else if (newDirty > 0) { level = "WARN"; exitCode = 1; }

  console.log("========== 桥接表脏行巡检 ==========");
  console.log(`桥接表总行数: ${Number(tot.c)}`);
  console.log(`脏行存量: ${dirtyTotal}（占比 ${pct}%）`);
  console.log(`  ├ 码前缀形态(server.ts 指纹): ${Number(shape.prefix_pattern) || 0}`);
  console.log(`  ├ 字母形态: ${Number(shape.letter_pattern) || 0}`);
  console.log(`  └ 空值形态: ${Number(shape.empty_pattern) || 0}`);
  console.log(`近 ${SINCE_DAYS} 天新增脏行: ${newDirty}（复发判据，阈值 CRITICAL>${CRITICAL_THRESHOLD}）`);
  if (latestRows[0]) {
    const r = latestRows[0];
    const ct = r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at;
    console.log(`最新脏行: notice_id=${r.notice_id} code=${r.code} level1_id="${r.level1_id}" @ ${ct}`);
  }
  console.log(`\n>>> 告警级别: ${level}`);
  if (level === "OK") {
    console.log("    近窗口无新增脏行，CRM 侧写入口径正常（或管线已整改）。");
  } else if (level === "WARN") {
    console.log("    检测到新增脏行，疑似 CRM 侧管线仍以码前缀写入 —— 请核对移交文档改动 1。");
  } else {
    console.log("    新增脏行超阈值，CRM 侧管线大概率未整改 —— 需立即介入，否则将持续稀释回填成果。");
  }

  if (AS_JSON) {
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      bridgeRows: Number(tot.c), dirtyTotal, dirtyPct: Number(pct),
      prefixPattern: Number(shape.prefix_pattern) || 0,
      letterPattern: Number(shape.letter_pattern) || 0,
      emptyPattern: Number(shape.empty_pattern) || 0,
      sinceDays: SINCE_DAYS, newDirty, level,
    }));
  }

  await pool.end();
  process.exit(exitCode);
}

main().catch(async (e) => {
  console.error("ERROR:", e.message);
  await pool.end();
  process.exit(3);
});
