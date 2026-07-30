// Step 2 验收探针：按修复后 buildNoticeUnspscFilter 的真实 SQL 语义逐项核对
// 只读脚本，可反复执行
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "192.168.1.2",
  user: "root",
  password: "123456",
  database: "crm",
  waitForConnections: true,
  connectionLimit: 4,
});

// 与 /api/notices 一致的有效公告条件
const sec = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";
const active = `(n.is_expired = 0 OR n.is_expired IS NULL) AND (n.deadline_ts IS NULL OR ${sec} >= UNIX_TIMESTAMP(NOW()))`;

// 复刻修复后函数生成的 JOIN
function fixedFilter(level, id) {
  if (level >= 1 && level <= 5) {
    return {
      join: `INNER JOIN (SELECT DISTINCT notice_id FROM crm_bid_notice_unspsc_codes WHERE level${level}_id = ?) f ON f.notice_id = n.id`,
      param: String(id),
    };
  }
  return {
    join: `INNER JOIN (SELECT DISTINCT notice_id FROM crm_bid_notice_unspsc_codes WHERE code_id = ?) f ON f.notice_id = n.id`,
    param: id,
  };
}

async function countBy(level, id) {
  const { join, param } = fixedFilter(level, id);
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM crm_bid_notices n ${join} WHERE ${active}`,
    [param]
  );
  return Number(rows[0].c);
}

const run = async () => {
  // 1. 总数基线（不带分类过滤）
  const [[totalRow]] = await pool.query(
    `SELECT COUNT(*) AS c FROM crm_bid_notices n WHERE ${active}`
  );
  console.log("1.有效公告总数（不选分类）:", Number(totalRow.c));

  // 2. A~J 十大类逐项命中
  const [segs] = await pool.query(
    "SELECT id, code, title_zh FROM crm_unspsc_codes WHERE level = 1 ORDER BY code"
  );
  let sum = 0;
  const perSeg = [];
  for (const s of segs) {
    const c = await countBy(1, s.id);
    sum += c;
    perSeg.push({ code: s.code, id: s.id, cnt: c });
  }
  console.log("2.十大类命中:", JSON.stringify(perSeg));
  console.log("2a.各类相加:", sum);

  // 3. 去重总数（至少挂一个大类的公告）
  const [[dedup]] = await pool.query(
    `SELECT COUNT(*) AS c FROM crm_bid_notices n
     INNER JOIN (SELECT DISTINCT notice_id FROM crm_bid_notice_unspsc_codes
       WHERE level1_id IN ('100','101','102','103','104','105','106','107','108','109')) f
       ON f.notice_id = n.id WHERE ${active}`
  );
  console.log("3.去重总数(挂≥1大类):", Number(dedup.c), " 差额(跨类重复计入):", sum - Number(dedup.c));

  // 4. 二级 / 三级 / 四级 抽样
  const [[lv2]] = await pool.query(
    "SELECT id, code, level, title_zh FROM crm_unspsc_codes WHERE code = '81000000' AND level = 2 LIMIT 1"
  );
  const [[lv3]] = await pool.query(
    "SELECT id, code, level, title_zh FROM crm_unspsc_codes WHERE code = '81100000' AND level = 3 LIMIT 1"
  );
  const [[lv4]] = await pool.query(
    "SELECT id, code, level, title_zh FROM crm_unspsc_codes WHERE code = '81101500' AND level = 4 LIMIT 1"
  );
  for (const c of [lv2, lv3, lv4]) {
    if (!c) continue;
    console.log(
      `4.level${c.level} ${c.code} ${c.title_zh} 命中:`,
      await countBy(c.level, c.id)
    );
  }

  // 5. level 6/7 兜底路径
  const [deep] = await pool.query(
    "SELECT id, code, level FROM crm_unspsc_codes WHERE level IN (6,7) ORDER BY level, code"
  );
  for (const d of deep) {
    console.log(`5.level${d.level} ${d.code} (code_id兜底) 命中:`, await countBy(d.level, d.id));
  }

  // 6. 跨类可见性：取一条同时挂 E(104) 和 J(109) 的公告，验证两类都能查到
  const [[ej]] = await pool.query(
    `SELECT b.notice_id FROM crm_bid_notice_unspsc_codes b
     INNER JOIN crm_bid_notices n ON n.id = b.notice_id
     WHERE ${active} AND b.level1_id = '104'
       AND EXISTS (SELECT 1 FROM crm_bid_notice_unspsc_codes b2
                   WHERE b2.notice_id = b.notice_id AND b2.level1_id = '109')
     LIMIT 1`
  );
  if (ej) {
    const nid = ej.notice_id;
    for (const [segCode, segId] of [["E", 104], ["J", 109]]) {
      const { join, param } = fixedFilter(1, segId);
      const [[hit]] = await pool.query(
        `SELECT COUNT(*) AS c FROM crm_bid_notices n ${join} WHERE ${active} AND n.id = ?`,
        [param, nid]
      );
      console.log(`6.跨类公告 ${nid} 在 ${segCode} 大类下可见:`, Number(hit.c) === 1);
    }
    // 单类内去重检查：该公告在 J 下的桥接行数 vs 结果行数
    const [[bridgeRows]] = await pool.query(
      "SELECT COUNT(*) AS c FROM crm_bid_notice_unspsc_codes WHERE notice_id = ? AND level1_id = '109'",
      [nid]
    );
    console.log(`6a.该公告在 J 下桥接行数=${bridgeRows.c}，结果集出现次数应为 1（DISTINCT 去重）`);
  } else {
    console.log("6.未找到 E+J 跨类活跃公告样本");
  }

  // 7. 现行(修复前)逻辑对照：两位码串撞 level1_id
  const [oldHits] = await pool.query(
    `SELECT COUNT(*) AS c FROM crm_bid_notices n
     INNER JOIN (SELECT DISTINCT notice_id FROM crm_bid_notice_unspsc_codes
       WHERE level1_id IN ('10','11','12','13','14','15')) f ON f.notice_id = n.id
     WHERE ${active}`
  );
  console.log("7.修复前逻辑(A大类前缀撞level1_id)命中:", Number(oldHits[0].c), "（对照：修复后 A =", perSeg[0].cnt, "）");

  await pool.end();
};

run().catch(async (e) => {
  console.error("ERROR:", e.message);
  await pool.end();
  process.exit(1);
});
