/**
 * 核弹级兜底：Step 6 回填前，对桥接表 crm_bid_notice_unspsc_codes 做整表快照备份。
 * 独立于回填脚本的日志回退机制——万一日志/脚本回退都失灵，可从备份表整体恢复。
 *
 * 用法：
 *   node scripts/backup-bridge-table.mjs            建备份（若已存在则拒绝，避免覆盖）
 *   node scripts/backup-bridge-table.mjs --verify   仅校验源表与备份表行数是否一致
 *
 * 说明：CREATE TABLE ... AS SELECT 只复制列与数据（不含索引/主键），用于数据恢复足够。
 */
import mysql from "mysql2/promise";

const SRC = "crm_bid_notice_unspsc_codes";
const BAK = "crm_bid_notice_unspsc_codes_bak_20260730";
const VERIFY_ONLY = process.argv.includes("--verify");

const pool = mysql.createPool({
  host: "192.168.1.2", user: "root", password: "123456", database: "crm", connectionLimit: 2,
});

async function tableExists(name) {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
    [name]
  );
  return rows[0].c > 0;
}

async function rowCount(name) {
  const [rows] = await pool.query(`SELECT COUNT(*) AS c FROM ${name}`);
  return Number(rows[0].c);
}

const main = async () => {
  const hasBak = await tableExists(BAK);

  if (VERIFY_ONLY) {
    if (!hasBak) { console.log(`❌ 备份表 ${BAK} 不存在，尚未备份。`); return; }
    const [src, bak] = [await rowCount(SRC), await rowCount(BAK)];
    console.log(`源表 ${SRC}: ${src} 行`);
    console.log(`备份 ${BAK}: ${bak} 行`);
    console.log(src === bak
      ? `✅ 行数一致（${src}），备份完整。`
      : `⚠️ 行数不一致（源 ${src} vs 备份 ${bak}）——注意：源表可能在备份后有增量写入，属正常。`);
    return;
  }

  if (hasBak) {
    const bak = await rowCount(BAK);
    console.log(`⚠️ 备份表 ${BAK} 已存在（${bak} 行），拒绝覆盖。如需重建请先手动确认。`);
    return;
  }

  const srcBefore = await rowCount(SRC);
  console.log(`源表 ${SRC} 当前 ${srcBefore} 行，开始建整表快照 ${BAK} ...`);
  const t0 = Date.now();
  await pool.query(`CREATE TABLE ${BAK} AS SELECT * FROM ${SRC}`);
  const bakRows = await rowCount(BAK);
  console.log(`✅ 备份完成，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`源表 ${srcBefore} 行 → 备份表 ${bakRows} 行`);
  console.log(bakRows >= srcBefore
    ? `✅ 校验通过：备份行数 ≥ 建表时源行数（差异仅因备份期间的并发增量）。`
    : `❌ 校验异常：备份行数少于源表，请复查！`);
  console.log(`\n恢复方式（万一需要）：\n  TRUNCATE ${SRC}; INSERT INTO ${SRC} SELECT * FROM ${BAK};  -- 需 DBA 评估索引/约束`);
};

main()
  .then(async () => { await pool.end(); })
  .catch(async (e) => { console.error("ERROR:", e.message); await pool.end(); process.exit(1); });
