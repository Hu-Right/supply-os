// 只读探针：验证分类筛选修复方案（按 id 关联 levelN_id）的实际效果
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "192.168.1.2",
  user: "root",
  password: "123456",
  database: "crm",
  connectionLimit: 2,
});

const sec = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts/1000), n.deadline_ts)";
const active = `(n.is_expired = 0 OR n.is_expired IS NULL) AND (n.deadline_ts IS NULL OR ${sec} >= UNIX_TIMESTAMP(NOW()))`;

// 1. 桥接表列结构（确认是否有 level5_id / code_id）
const [cols] = await pool.query("SHOW COLUMNS FROM crm_bid_notice_unspsc_codes");
console.log("1.桥接表列:", cols.map((c) => `${c.Field}(${c.Type})`).join(", "));

// 2. crm_unspsc_codes 的 level 分布（确认树的层级语义）
const [levels] = await pool.query(
  "SELECT level, COUNT(*) AS c, MIN(code) AS sample_min, MAX(code) AS sample_max FROM crm_unspsc_codes GROUP BY level ORDER BY level"
);
console.log("2.类目表 level 分布:", JSON.stringify(levels, null, 1));

// 3. 取大类 J 下的一个二级类目（如 81 段），验证修复方案在 level2 上的命中
const [seg81] = await pool.query(
  "SELECT id, code, level, parent_id, title_zh FROM crm_unspsc_codes WHERE code LIKE '81%' ORDER BY LENGTH(code), code LIMIT 3"
);
console.log("3.81 段类目样本:", JSON.stringify(seg81, null, 1));

if (seg81.length) {
  const target = seg81[0]; // 应为 81000000 / level2
  // 3a. 修复方案：level{level}_id = id
  const col = `level${target.level}_id`;
  const [fixed] = await pool.query(
    `SELECT COUNT(DISTINCT n.id) AS c
     FROM crm_bid_notices n
     INNER JOIN (SELECT DISTINCT notice_id FROM crm_bid_notice_unspsc_codes WHERE ${col} = ?) f ON f.notice_id = n.id
     WHERE ${active}`,
    [target.id]
  );
  console.log(`3a.修复方案 ${col}=${target.id} (${target.code}) 命中:`, fixed[0].c);

  // 3b. 现行逻辑：prefix '81'(长度2) → level1_id IN ('81')
  const [current] = await pool.query(
    `SELECT COUNT(DISTINCT n.id) AS c
     FROM crm_bid_notices n
     INNER JOIN (SELECT DISTINCT notice_id FROM crm_bid_notice_unspsc_codes WHERE level1_id IN ('81')) f ON f.notice_id = n.id
     WHERE ${active}`
  );
  console.log("3b.现行逻辑 level1_id IN ('81') 命中:", current[0].c);

  // 3c. 兜底方案：b.code LIKE '81%'
  const [like] = await pool.query(
    `SELECT COUNT(DISTINCT n.id) AS c
     FROM crm_bid_notices n
     INNER JOIN (SELECT DISTINCT notice_id FROM crm_bid_notice_unspsc_codes WHERE code LIKE '81%') f ON f.notice_id = n.id
     WHERE ${active}`
  );
  console.log("3c.兜底 code LIKE '81%' 命中:", like[0].c);
}

// 4. 三级类目验证（8110 家族）
const [fam] = await pool.query(
  "SELECT id, code, level, title_zh FROM crm_unspsc_codes WHERE code LIKE '8110%' ORDER BY LENGTH(code), code LIMIT 2"
);
console.log("4.8110 家族样本:", JSON.stringify(fam, null, 1));
if (fam.length) {
  const t = fam[0];
  const col = `level${t.level}_id`;
  const [fixed] = await pool.query(
    `SELECT COUNT(DISTINCT n.id) AS c
     FROM crm_bid_notices n
     INNER JOIN (SELECT DISTINCT notice_id FROM crm_bid_notice_unspsc_codes WHERE ${col} = ?) f ON f.notice_id = n.id
     WHERE ${active}`,
    [t.id]
  );
  console.log(`4a.修复方案 ${col}=${t.id} (${t.code}) 命中:`, fixed[0].c);
}

// 5. levelN_id 脏数据规模：level1_id 不是合法类目 id（100~109）的行数
const [dirty] = await pool.query(
  "SELECT SUM(level1_id NOT IN ('100','101','102','103','104','105','106','107','108','109')) AS dirty_rows, COUNT(*) AS total_rows FROM crm_bid_notice_unspsc_codes"
);
console.log("5.level1_id 脏数据规模:", JSON.stringify(dirty));

// 6. 脏行中 code 列是否可用（兜底 LIKE 的可行性）
const [dirtySample] = await pool.query(
  `SELECT notice_id, code, code_id, level1_id FROM crm_bid_notice_unspsc_codes
   WHERE level1_id NOT IN ('100','101','102','103','104','105','106','107','108','109') LIMIT 5`
);
console.log("6.脏行样本:", JSON.stringify(dirtySample, null, 1));

await pool.end();
