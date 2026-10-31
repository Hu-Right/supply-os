/**
 * service_catalog 支持 0 元商品（AI 写标书现阶段免费）—— 幂等 DDL + 数据修正
 *
 * 做什么：
 *   1) price_mode 枚举追加 'free'（追加在末尾，存量行的枚举序号不变，零数据风险）；
 *   2) chk_price_by_mode 由「standard_price > 0」放宽为「>= 0」——0 是真实定价（当前免费、
 *      后续可能收费），不再被防呆校验误判为"没填价"；NULL 仍只允许 token/project/quote/contact
 *      四种形态，"未定价冒充价格"的防线不废；
 *   3) svc_ai_bid_writing 由 contact 占位改为 free + 0.00 实价。
 *
 * 为什么直接改而不是绕：校验是前人防「缺价」的防呆，不是业务规则；用户口径明确
 * 「0 元就是 0 元」，真实定价应当进 standard_price，展示与对账都走同一价格字段。
 *
 * 用法：
 *   node scripts/tools/service-catalog-free-price-ddl.mjs            # 预检（只读，打印将执行的 DDL）
 *   node scripts/tools/service-catalog-free-price-ddl.mjs --apply --yes
 *
 * 回滚：UPDATE svc_ai_bid_writing 回 contact/NULL + 还原原 chk + 枚举去 'free'（见打印）。
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const YES = process.argv.includes("--yes");
if (APPLY && !YES) {
  console.error("✗ --apply 必须显式带 --yes（人工闸口）");
  process.exit(1);
}

const DB = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER || "root",
  password: (process.env.DB_PASSWORD || "").replace(/^['"]|['"]$/g, ""),
  database: process.env.DB_NAME || "crm",
  charset: "utf8mb4",
};

const ENUM_NEW = "'per_unit','per_time','per_year','token','project','quote','contact','free'";
const CHK_NEW = "((`price_mode` in ('token','project','quote','contact')) or ((`standard_price` is not null) and (`standard_price` >= 0)))";

async function main() {
  const conn = await mysql.createConnection(DB);
  try {
    // ── 现状探测（幂等：已改过的步骤自动跳过） ──
    const [col] = await conn.query(
      `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_catalog' AND COLUMN_NAME = 'price_mode'`,
    );
    const hasFree = /'free'/.test(col[0]?.COLUMN_TYPE ?? "");

    const [chk] = await conn.query(
      `SELECT cc.CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS cc
         JOIN information_schema.TABLE_CONSTRAINTS tc
           ON tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
        WHERE cc.CONSTRAINT_SCHEMA = DATABASE() AND cc.CONSTRAINT_NAME = 'chk_price_by_mode' AND tc.TABLE_NAME = 'service_catalog'`,
    );
    const chkCurrent = chk[0]?.CHECK_CLAUSE ?? "";
    const chkNeedsFix = !chkCurrent.includes(">= 0") && !chkCurrent.includes(">=0");

    const [row] = await conn.query(
      `SELECT service_code, name_zh, price_mode, standard_price, deliverable_note_zh FROM service_catalog WHERE service_code = 'svc_ai_bid_writing'`,
    );

    console.log("=== 现状 ===");
    console.log("price_mode 枚举含 free：", hasFree, `（${col[0]?.COLUMN_TYPE}）`);
    console.log("chk_price_by_mode 已放宽(>=0)：", !chkNeedsFix, `（${chkCurrent}）`);
    console.log("svc_ai_bid_writing：", row.length ? JSON.stringify(row[0]) : "（无此行）");

    const steps = [];
    if (!hasFree) steps.push(`ALTER TABLE service_catalog MODIFY COLUMN price_mode ENUM(${ENUM_NEW}) NOT NULL COMMENT '计价形态：…/free=当前免费（必配 0.00）'`);
    if (chkNeedsFix) steps.push("ALTER TABLE service_catalog DROP CONSTRAINT chk_price_by_mode");
    if (chkNeedsFix) steps.push(`ALTER TABLE service_catalog ADD CONSTRAINT chk_price_by_mode CHECK ${CHK_NEW.replace(/>=/g, ">= ")}`);
    if (row.length) steps.push(
      `UPDATE service_catalog SET price_mode='free', standard_price=0.00, deliverable_note_zh='基于平台模板与 AI 能力生成投标文件初稿，不含人工审核；现阶段免费（报价表 0 元），后续随项目发展可能收费，定价后改回实价形态' WHERE service_code='svc_ai_bid_writing'`,
    );

    console.log("\n=== 将执行 ===");
    for (const s of steps) console.log("  " + s);
    if (steps.length === 0) {
      console.log("  （无需变更，已是终态）");
      return;
    }
    if (!APPLY) {
      console.log("\n↩︎ 预检模式未执行。加 --apply --yes 落库。");
      return;
    }

    // DDL 隐式提交，无法包进单事务；逐句执行并打印进度，前置探测已保证可重入
    for (const s of steps) {
      await conn.query(s);
      console.log("  ✓ " + s.slice(0, 80) + (s.length > 80 ? "…" : ""));
    }

    const [after] = await conn.query(
      `SELECT service_code, name_zh, price_mode, standard_price FROM service_catalog WHERE service_code = 'svc_ai_bid_writing'`,
    );
    console.log("\n=== 终态 ===\n", JSON.stringify(after[0]));
    console.log("\n✅ 已落库。回滚口径：price_mode 改回 'contact' + standard_price=NULL；约束还原见预检打印的 chkCurrent 原句。");
  } catch (err) {
    console.error("❌ 失败：", err.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
