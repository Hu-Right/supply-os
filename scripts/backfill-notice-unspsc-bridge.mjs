/**
 * 公采公告桥接表回填 / 修正脚本
 *
 * 背景：分类筛选依赖 crm_bid_notice_unspsc_codes 的 level1_id~level5_id 存
 * crm_unspsc_codes.id。当前存在两类缺口导致公告在分类筛选下不可见：
 *   动作 A（UPDATE）：已有桥接行但 levelN_id 是脏值（''、字母 'B'、两位码 '42'），
 *                     按行内 code 在类目树重新解析，修正为正确的祖先 id 链。
 *   动作 B（INSERT）：完全没有桥接行，但主表 crm_bid_notices.unspsc_codes JSON
 *                     有码，解析后展开为桥接行。
 *
 * 用法：
 *   node scripts/backfill-notice-unspsc-bridge.mjs --dry-run        预演，不写库（默认建议先跑）
 *   node scripts/backfill-notice-unspsc-bridge.mjs --dry-run -a     只预演动作 A
 *   node scripts/backfill-notice-unspsc-bridge.mjs --dry-run -b     只预演动作 B
 *   node scripts/backfill-notice-unspsc-bridge.mjs --execute        正式执行（写库）
 *   node scripts/backfill-notice-unspsc-bridge.mjs --rollback <日志文件>   回滚
 *
 * 安全设计：
 *   - 默认 dry-run；必须显式 --execute 才写库
 *   - 幂等：动作 B 用 INSERT IGNORE（依赖已有唯一索引 uk_notice_code(notice_id, code)）；
 *          动作 A 只改 levelN_id 列，重跑结果相同
 *   - 分批提交（BATCH=500），可 Ctrl+C 中断后重跑
 *   - 全程日志写 scripts/backfill-log-<时间戳>.jsonl，含动作 A 的原值与动作 B 的新行 id，
 *     可用 --rollback 精确还原
 *   - 单公告码数上限 MAX_CODES_PER_NOTICE，防止异常 JSON 灌入海量行
 */
import mysql from "mysql2/promise";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const DRY_RUN = !args.includes("--execute");
const ONLY_A = args.includes("-a") || args.includes("--only-a");
const ONLY_B = args.includes("-b") || args.includes("--only-b");
const ROLLBACK_IDX = args.indexOf("--rollback");
const ROLLBACK_FILE = ROLLBACK_IDX >= 0 ? args[ROLLBACK_IDX + 1] : null;

const BATCH = 500;
const MAX_CODES_PER_NOTICE = 50;
const STD_L1 = ["100", "101", "102", "103", "104", "105", "106", "107", "108", "109"];

const pool = mysql.createPool({
  host: "192.168.1.2",
  user: "root",
  password: "123456",
  database: "crm",
  waitForConnections: true,
  connectionLimit: 4,
});

const logPath = path.join(
  "scripts",
  `backfill-log-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`
);
let logStream = null;
const writeLog = (obj) => {
  if (DRY_RUN) return;
  if (!logStream) logStream = fs.createWriteStream(logPath, { flags: "a" });
  logStream.write(JSON.stringify(obj) + "\n");
};

// ───────────────────────────── 类目树加载 ─────────────────────────────
/** code -> node，同时按 8 位补零形态建立别名索引 */
const byCode = new Map();
const byId = new Map();

async function loadTree() {
  const [rows] = await pool.query(
    "SELECT id, code, level, parent_id, COALESCE(title, title_zh, '') AS name FROM crm_unspsc_codes"
  );
  for (const r of rows) {
    const node = {
      id: Number(r.id),
      code: String(r.code),
      level: Number(r.level) || 0,
      parentId: r.parent_id == null ? null : Number(r.parent_id),
      name: String(r.name || ""),
    };
    byId.set(node.id, node);
    byCode.set(node.code, node);
  }
  // 别名：'43230000' 已是 8 位；补零形态兼容 '4323' / '432300' 之类写法
  for (const node of byId.values()) {
    if (/^\d{8}$/.test(node.code)) {
      const trimmed = node.code.replace(/(00)+$/, "");
      if (trimmed && trimmed !== node.code && !byCode.has(trimmed)) {
        byCode.set(trimmed, node);
      }
    }
  }
  console.log(`[tree] 类目节点 ${byId.size} 个（含别名索引 ${byCode.size} 个 key）`);
}

/** 解析一个 code 字符串为节点；支持字母大类、8 位数字码、去零短码 */
function resolveNode(raw) {
  const code = String(raw || "").trim().toUpperCase();
  if (!code) return null;
  if (byCode.has(code)) return byCode.get(code);
  if (/^\d+$/.test(code)) {
    const padded = code.padEnd(8, "0").slice(0, 8);
    if (byCode.has(padded)) return byCode.get(padded);
  }
  return null;
}

/** 沿 parent_id 回溯，返回 { level1_id..level5_id } 字符串（缺失为 ''） */
function ancestorIds(node) {
  const slots = { level1_id: "", level2_id: "", level3_id: "", level4_id: "", level5_id: "" };
  let cur = node;
  const guard = new Set();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    if (cur.level >= 1 && cur.level <= 5) {
      slots[`level${cur.level}_id`] = String(cur.id);
    }
    cur = cur.parentId == null ? null : byId.get(cur.parentId) || null;
  }
  return slots;
}

// ───────────────────────── 动作 A：修正脏 levelN_id ─────────────────────────
async function actionA() {
  console.log("\n===== 动作 A：修正 levelN_id 脏值 =====");
  const [rows] = await pool.query(
    `SELECT id, notice_id, code, code_id, level, level1_id, level2_id, level3_id, level4_id, level5_id
     FROM crm_bid_notice_unspsc_codes
     WHERE level1_id = '' OR level1_id IS NULL OR level1_id NOT IN (?)
     ORDER BY id`,
    [STD_L1]
  );
  console.log(`[A] 候选脏行 ${rows.length} 行`);

  const stats = { total: rows.length, fixable: 0, unresolvable: 0, alreadyOk: 0, updated: 0 };
  const unresolvedCodes = new Map();
  const batch = [];

  for (const row of rows) {
    const node = resolveNode(row.code);
    if (!node) {
      stats.unresolvable++;
      unresolvedCodes.set(row.code, (unresolvedCodes.get(row.code) || 0) + 1);
      continue;
    }
    const slots = ancestorIds(node);
    if (!slots.level1_id) {
      stats.unresolvable++;
      unresolvedCodes.set(`${row.code}(无level1祖先)`, 1);
      continue;
    }
    const unchanged =
      String(row.level1_id || "") === slots.level1_id &&
      String(row.level2_id || "") === slots.level2_id &&
      String(row.level3_id || "") === slots.level3_id &&
      String(row.level4_id || "") === slots.level4_id &&
      String(row.level5_id || "") === slots.level5_id;
    if (unchanged) {
      stats.alreadyOk++;
      continue;
    }
    stats.fixable++;
    batch.push({ row, slots, node });

    if (!DRY_RUN && batch.length >= BATCH) {
      stats.updated += await flushA(batch);
      batch.length = 0;
    }
  }
  if (!DRY_RUN && batch.length) stats.updated += await flushA(batch);

  console.log("[A] 统计:", JSON.stringify(stats));
  if (unresolvedCodes.size) {
    const top = [...unresolvedCodes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    console.log("[A] 无法解析的 code TOP10:", JSON.stringify(top));
  }
  if (DRY_RUN) {
    // 预演：受益公告数（这些脏行涉及的、当前完全查不到的公告）
    const [[benefit]] = await pool.query(
      `SELECT COUNT(*) AS c FROM crm_bid_notices n
       WHERE EXISTS (SELECT 1 FROM crm_bid_notice_unspsc_codes b WHERE b.notice_id = n.id)
         AND NOT EXISTS (SELECT 1 FROM crm_bid_notice_unspsc_codes b2
                         WHERE b2.notice_id = n.id AND b2.level1_id IN (?))
         AND (n.is_expired = 0 OR n.is_expired IS NULL)
         AND (n.deadline_ts IS NULL OR IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts/1000), n.deadline_ts) >= UNIX_TIMESTAMP(NOW()))`,
      [STD_L1]
    );
    console.log(`[A] 预计救回（当前完全不可见的有效公告）: ${benefit.c} 条`);
  }
  return stats;
}

async function flushA(batch) {
  const conn = await pool.getConnection();
  let n = 0;
  try {
    await conn.beginTransaction();
    for (const { row, slots } of batch) {
      writeLog({
        action: "A",
        bridge_id: Number(row.id),
        before: {
          level1_id: row.level1_id, level2_id: row.level2_id, level3_id: row.level3_id,
          level4_id: row.level4_id, level5_id: row.level5_id,
        },
        after: slots,
      });
      await conn.query(
        `UPDATE crm_bid_notice_unspsc_codes
         SET level1_id = ?, level2_id = ?, level3_id = ?, level4_id = ?, level5_id = ?
         WHERE id = ?`,
        [slots.level1_id, slots.level2_id, slots.level3_id, slots.level4_id, slots.level5_id, row.id]
      );
      n++;
    }
    await conn.commit();
    console.log(`[A] 已提交 ${n} 行`);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  return n;
}

// ─────────────────── 动作 B：为无桥接行公告插入桥接行 ───────────────────
async function actionB() {
  console.log("\n===== 动作 B：回填无桥接行公告 =====");
  const sec = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts/1000), n.deadline_ts)";
  const active = `(n.is_expired = 0 OR n.is_expired IS NULL) AND (n.deadline_ts IS NULL OR ${sec} >= UNIX_TIMESTAMP(NOW()))`;
  const [notices] = await pool.query(
    `SELECT n.id, n.source_channel, n.unspsc_codes
     FROM crm_bid_notices n
     WHERE ${active}
       AND NOT EXISTS (SELECT 1 FROM crm_bid_notice_unspsc_codes b WHERE b.notice_id = n.id)
       AND n.unspsc_codes IS NOT NULL AND n.unspsc_codes <> '' AND n.unspsc_codes <> '[]' AND n.unspsc_codes <> 'null'
     ORDER BY n.id`
  );
  console.log(`[B] 候选公告 ${notices.length} 条`);

  const stats = {
    notices: notices.length,
    parsedOk: 0, jsonError: 0, noResolvable: 0,
    rowsPlanned: 0, rowsInserted: 0,
    letterOnlyNotices: 0, numericNotices: 0, cappedNotices: 0,
  };
  const byChannel = new Map();
  const unresolvedCodes = new Map();
  let pending = [];

  for (const notice of notices) {
    // crm_bid_notices.unspsc_codes 是 MySQL json 列，mysql2 已自动解析为数组；
    // 仅当驱动返回字符串时才需要手动 parse（兼容两种情形）
    let parsed = notice.unspsc_codes;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        stats.jsonError++;
        continue;
      }
    }
    const rawCodes = Array.isArray(parsed)
      ? parsed.map((x) => (typeof x === "string" ? x : x && x.code)).filter(Boolean)
      : [];
    if (rawCodes.length === 0) {
      stats.jsonError++;
      continue;
    }

    const seen = new Set();
    const rows = [];
    let hasNumeric = false;
    for (const raw of rawCodes) {
      if (rows.length >= MAX_CODES_PER_NOTICE) {
        stats.cappedNotices++;
        break;
      }
      const node = resolveNode(raw);
      if (!node) {
        unresolvedCodes.set(String(raw), (unresolvedCodes.get(String(raw)) || 0) + 1);
        continue;
      }
      if (seen.has(node.code)) continue;
      seen.add(node.code);
      const slots = ancestorIds(node);
      if (!slots.level1_id) continue;
      if (/^\d/.test(node.code)) hasNumeric = true;
      rows.push({
        notice_id: String(notice.id),
        code_id: node.id,
        code: node.code,
        name: node.name,
        level: node.level,
        ...slots,
      });
    }

    if (rows.length === 0) {
      stats.noResolvable++;
      continue;
    }
    stats.parsedOk++;
    if (hasNumeric) stats.numericNotices++;
    else stats.letterOnlyNotices++;
    stats.rowsPlanned += rows.length;
    const ch = notice.source_channel || "(null)";
    byChannel.set(ch, (byChannel.get(ch) || 0) + 1);

    pending.push(...rows);
    if (!DRY_RUN && pending.length >= BATCH) {
      stats.rowsInserted += await flushB(pending);
      pending = [];
    }
  }
  if (!DRY_RUN && pending.length) stats.rowsInserted += await flushB(pending);

  console.log("[B] 统计:", JSON.stringify(stats));
  console.log(
    "[B] 受益公告渠道分布 TOP10:",
    JSON.stringify([...byChannel.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10))
  );
  if (unresolvedCodes.size) {
    const top = [...unresolvedCodes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    console.log("[B] 类目树中查不到的 code TOP10:", JSON.stringify(top));
  }
  return stats;
}

async function flushB(rows) {
  const conn = await pool.getConnection();
  let inserted = 0;
  try {
    await conn.beginTransaction();
    for (const r of rows) {
      const [res] = await conn.query(
        `INSERT IGNORE INTO crm_bid_notice_unspsc_codes
           (notice_id, code_id, code, name, level, level1_id, level2_id, level3_id, level4_id, level5_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [r.notice_id, r.code_id, r.code, r.name, r.level,
         r.level1_id, r.level2_id, r.level3_id, r.level4_id, r.level5_id]
      );
      if (res.affectedRows > 0 && res.insertId) {
        writeLog({ action: "B", bridge_id: Number(res.insertId), notice_id: r.notice_id, code: r.code });
        inserted++;
      }
    }
    await conn.commit();
    console.log(`[B] 已提交 ${inserted} 行`);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  return inserted;
}

// ───────────────────────────── 回滚 ─────────────────────────────
async function rollback(file) {
  if (!fs.existsSync(file)) throw new Error(`日志文件不存在: ${file}`);
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
  const inserts = [];
  const updates = [];
  for (const line of lines) {
    const e = JSON.parse(line);
    if (e.action === "B") inserts.push(e.bridge_id);
    else if (e.action === "A") updates.push(e);
  }
  console.log(`[rollback] 待删除插入行 ${inserts.length} 条，待还原更新行 ${updates.length} 条`);

  const conn = await pool.getConnection();
  try {
    for (let i = 0; i < inserts.length; i += BATCH) {
      const chunk = inserts.slice(i, i + BATCH);
      await conn.query("DELETE FROM crm_bid_notice_unspsc_codes WHERE id IN (?)", [chunk]);
      console.log(`[rollback] 已删除 ${Math.min(i + BATCH, inserts.length)}/${inserts.length}`);
    }
    for (let i = 0; i < updates.length; i += BATCH) {
      const chunk = updates.slice(i, i + BATCH);
      for (const e of chunk) {
        const b = e.before;
        await conn.query(
          `UPDATE crm_bid_notice_unspsc_codes
           SET level1_id = ?, level2_id = ?, level3_id = ?, level4_id = ?, level5_id = ?
           WHERE id = ?`,
          [b.level1_id ?? "", b.level2_id ?? "", b.level3_id ?? "",
           b.level4_id ?? "", b.level5_id ?? "", e.bridge_id]
        );
      }
      console.log(`[rollback] 已还原 ${Math.min(i + BATCH, updates.length)}/${updates.length}`);
    }
  } finally {
    conn.release();
  }
  console.log("[rollback] 完成");
}

// ───────────────────────────── 主流程 ─────────────────────────────
const main = async () => {
  if (ROLLBACK_FILE) {
    await rollback(ROLLBACK_FILE);
    return;
  }
  console.log(`模式: ${DRY_RUN ? "DRY-RUN（只统计，不写库）" : "EXECUTE（写库）"}`);
  if (!DRY_RUN) console.log(`日志文件: ${logPath}`);

  await loadTree();

  const before = await snapshot();
  console.log("执行前快照:", JSON.stringify(before));

  if (!ONLY_B) await actionA();
  if (!ONLY_A) await actionB();

  if (!DRY_RUN) {
    const after = await snapshot();
    console.log("执行后快照:", JSON.stringify(after));
    console.log(
      `分类可筛出公告: ${before.visible} → ${after.visible}（+${after.visible - before.visible}）`
    );
  } else {
    console.log("\n[dry-run] 未写入任何数据。确认无误后用 --execute 正式执行。");
  }
};

async function snapshot() {
  const sec = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts/1000), n.deadline_ts)";
  const active = `(n.is_expired = 0 OR n.is_expired IS NULL) AND (n.deadline_ts IS NULL OR ${sec} >= UNIX_TIMESTAMP(NOW()))`;
  const [[tot]] = await pool.query(`SELECT COUNT(*) AS c FROM crm_bid_notices n WHERE ${active}`);
  const [[vis]] = await pool.query(
    `SELECT COUNT(*) AS c FROM crm_bid_notices n
     INNER JOIN (SELECT DISTINCT notice_id FROM crm_bid_notice_unspsc_codes WHERE level1_id IN (?)) f
       ON f.notice_id = n.id WHERE ${active}`,
    [STD_L1]
  );
  const [[rows]] = await pool.query("SELECT COUNT(*) AS c FROM crm_bid_notice_unspsc_codes");
  return { total: Number(tot.c), visible: Number(vis.c), bridgeRows: Number(rows.c) };
}

main()
  .then(async () => {
    if (logStream) logStream.end();
    await pool.end();
  })
  .catch(async (e) => {
    console.error("ERROR:", e.message);
    if (logStream) logStream.end();
    await pool.end();
    process.exit(1);
  });
