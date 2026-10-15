/**
 * crm_bid_notices 精简作业 · 阶段一/阶段二共用口子
 *
 * 收敛动因：对账窗口算法、NULL 可区分指纹、进度条这三段若在两阶段脚本里各写一份，
 * 阶段一与阶段二就会用「看着一样其实不一样」的判据去签字——那是最坏的一种漂移
 * （同「SQL 列清单分隔符只能有一个出处」红线口径）。
 *
 * 只读工具函数为主；写操作留在阶段脚本里，便于逐条审 SQL。
 */
import { createConnection } from "mysql2/promise";

export const conn = () =>
  createConnection({
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME ?? "crm",
    charset: "utf8mb4",
    // 回填与对账是长语句；不设上限就由调用方的 MAX_EXECUTION_TIME 兜
    multipleStatements: false,
  });

export const fatal = (msg) => {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
};

/** ASCII 进度条：长作业必须有可见反馈，不做静默等待 */
export function makeProgress(total, label) {
  const started = Date.now();
  let lastPct = -1;
  return (done) => {
    const pct = Math.min(100, Math.round((done / Math.max(1, total)) * 100));
    if (pct === lastPct) return;
    lastPct = pct;
    const w = 28;
    const fill = Math.round((pct / 100) * w);
    const sec = ((Date.now() - started) / 1000).toFixed(0);
    process.stdout.write(`\r  ${label} [${"#".repeat(fill)}${"-".repeat(w - fill)}] ${String(pct).padStart(3)}%  ${done}/${total}  ${sec}s   `);
  };
}

/** 现网列元信息（含生成列标记），顺序即物理序 */
export async function columnsOf(c, table) {
  const [rows] = await c.query(
    `SELECT COLUMN_NAME name, DATA_TYPE type, UPPER(EXTRA) extra, COLUMN_COMMENT comment
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
    [table],
  );
  return rows;
}

/** 索引 → 列序列（含前缀长度与索引类型，用于结构自检与 FULLTEXT 重建） */
export async function indexesOf(c, table) {
  const [rows] = await c.query(
    `SELECT INDEX_NAME name, SEQ_IN_INDEX seq, COLUMN_NAME col, NON_UNIQUE nu,
            INDEX_TYPE itype, SUB_PART sub, COLLATION coll
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [table],
  );
  const map = new Map();
  for (const r of rows) {
    const cur = map.get(r.name) ?? { name: r.name, nonUnique: Number(r.nu), type: r.itype, cols: [] };
    cur.cols.push({ col: r.col, sub: r.sub, coll: r.coll });
    map.set(r.name, cur);
  }
  return map;
}

export async function tableExists(c, table) {
  const [rows] = await c.query(
    `SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  return Number(rows[0].n) > 0;
}

/**
 * 按主键窗口切片（本表 id 稀疏：实测 id ∈ [423, 1786524111] 而只有 64.5 万行，
 * 用「固定 id 步长」会空转几十万个窗口；这里按行数取窗口边界，扫描成本恒定）。
 */
export async function* idWindows(c, base, size) {
  let cursor = 0;
  for (;;) {
    const [rows] = await c.query(
      `SELECT MIN(id) lo, MAX(id) hi, COUNT(*) n FROM (SELECT id FROM \`${base}\` WHERE id > ? ORDER BY id LIMIT ${size}) t`,
      [cursor],
    );
    const w = rows[0];
    if (!w || w.lo == null) break;
    yield { lo: Number(w.lo), hi: Number(w.hi), n: Number(w.n) };
    cursor = Number(w.hi);
  }
}

/**
 * 行指纹表达式（NULL 与空串必须可区分：每列前面挂一个标记字节，
 * 否则 CONCAT_WS 跳过 NULL 会让两者同码 —— 对账假通过）。
 */
export function rowFingerprintExpr(cols) {
  const term = (c) =>
    `IF(\`${c}\` IS NULL, CHAR(1 USING utf8mb4), CONCAT(CHAR(2 USING utf8mb4), IFNULL(CAST(\`${c}\` AS CHAR), '')))`;
  return `SUM(CRC32(CONCAT(${cols.map(term).join(", ")})))`;
}

/** 逐片比较两表：行数与列指纹都必须相等，返回片数；不一致直接抛错（带定位信息） */
export async function reconcile(c, base, other, cols, size, label) {
  const fp = rowFingerprintExpr(cols);
  const [[{ n: baseRows }]] = await c.query(`SELECT COUNT(*) n FROM \`${base}\``);
  const total = Math.max(1, Math.ceil(Number(baseRows) / size));
  const report = makeProgress(total, label);
  let slices = 0;
  for await (const w of idWindows(c, base, size)) {
    const sql = (t) => `SELECT COUNT(*) n, ${fp} fp FROM \`${t}\` WHERE \`id\` BETWEEN ${w.lo} AND ${w.hi}`;
    // 走同一连接就串行发：Promise.all 在这里不会变快（mysql2 内部排队），反而让报错难归因
    const a = (await c.query(sql(base)))[0][0];
    const b = (await c.query(sql(other)))[0][0];
    slices++;
    if (Number(a.n) !== Number(b.n) || String(a.fp) !== String(b.fp)) {
      throw new Error(
        `内容对账不一致：id ∈ [${w.lo},${w.hi}] ${base} n=${a.n} fp=${a.fp} · ${other} n=${b.n} fp=${b.fp}\n` +
          `  最常见原因不是数据错值，而是这一轮期间本表又被写了（本库是云生产库）：` +
          `等下一轮同步间隙重跑，或先冻结同步再 --rollback + --build`,
      );
    }
    report(slices);
  }
  process.stdout.write("\n");
  return slices;
}
