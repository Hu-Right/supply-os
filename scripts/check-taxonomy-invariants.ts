/**
 * 分类树不变量探针（只读，可反复执行）
 *
 * 用法：npx tsx scripts/check-taxonomy-invariants.ts
 *
 * 行业面 crm_industry_nodes 与品目面 crm_commodity_nodes 的结构约定落地为可执行门禁，
 * 口径与 docs/数据库设计/crm_industry_nodes-行业面主表.md、crm_commodity_nodes-品目面字典表.md 一致：
 *   I 行业面：码长即层级 · 父指针闭合且等于码前缀 · 不跳级 · 自研层只挂中类或更细 · 英文名齐全 · 词表封闭
 *   C 品目面：码形 UGT-C-+8位 · 父指针闭合 · 词表封闭
 *   X 跨面：两面码段不相交 · 挂靠与主行业码零孤儿零串面
 *
 * 退出码：全部为 0 → 0；任一违规或查询异常 → 1（可接进部署后校验）
 */
import "dotenv/config";
import mysql2 from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";
import { DbConfigSchema } from "../src/lib/db/db-config.js";

// 与 src/lib/db/pool.ts 同一组环境变量；脚本侧独立建池，避免依赖 Next 运行时
const DB_CFG = DbConfigSchema.parse({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "crm",
});

const IND = "`crm_industry_nodes`";
const COM = "`crm_commodity_nodes`";

const CHECKS: Array<{ name: string; sql: string }> = [
  // ── 行业面 ──
  {
    name: "I1 父指针悬空（应为 0）",
    sql: `SELECT COUNT(*) n FROM ${IND} c LEFT JOIN ${IND} p ON p.code = c.parent_code
          WHERE c.parent_code IS NOT NULL AND c.parent_code <> '' AND p.code IS NULL`,
  },
  {
    name: "I2 门类以外缺父（应为 0）",
    sql: `SELECT COUNT(*) n FROM ${IND} WHERE level <> 'section' AND (parent_code IS NULL OR parent_code = '')`,
  },
  {
    name: "I3 码长与层级不符（应为 0；UGT-I- 后 2/4/6/8/8 位）",
    sql: `SELECT COUNT(*) n FROM ${IND} WHERE NOT (code LIKE 'UGT-I-%' AND CHAR_LENGTH(code) = CASE level
            WHEN 'section' THEN 8 WHEN 'division' THEN 10 WHEN 'group' THEN 12
            WHEN 'subclass' THEN 14 WHEN 'extension' THEN 14 ELSE 0 END)`,
  },
  {
    name: "I4 父码不等于自身码去掉末两级（应为 0，码制自洽）",
    sql: `SELECT COUNT(*) n FROM ${IND} WHERE level <> 'section'
            AND parent_code <> CONCAT('UGT-I-', LEFT(SUBSTRING(code, 7), CHAR_LENGTH(SUBSTRING(code, 7)) - 2))`,
  },
  {
    name: "I5 跳级挂接（应为 0：division→section、group→division、subclass/extension→group）",
    sql: `SELECT COUNT(*) n FROM ${IND} c JOIN ${IND} p ON p.code = c.parent_code
          WHERE (c.level = 'division' AND p.level <> 'section')
             OR (c.level = 'group' AND p.level <> 'division')
             OR (c.level = 'subclass' AND p.level <> 'group')
             OR (c.level = 'extension' AND p.level NOT IN ('group','subclass'))`,
  },
  {
    name: "I6 自研延伸层挂成粗层或挂到门类（应为 0）",
    sql: `SELECT COUNT(*) n FROM ${IND} WHERE source = 'self' AND level <> 'extension'`,
  },
  {
    name: "I7 英文名缺失（应为 0）",
    sql: `SELECT COUNT(*) n FROM ${IND} WHERE name_en IS NULL OR name_en = ''`,
  },
  {
    name: "I8 src_code 形态非法（应为 0）",
    sql: `SELECT COUNT(*) n FROM ${IND} WHERE NOT (CASE level
            WHEN 'section' THEN src_code REGEXP '^[A-Z]$'
            WHEN 'division' THEN src_code REGEXP '^[0-9]{2}$'
            WHEN 'group' THEN src_code REGEXP '^[0-9]{3}$'
            WHEN 'subclass' THEN src_code REGEXP '^[0-9]{4}$'
            WHEN 'extension' THEN src_code REGEXP '^X[0-9]{2}$'
            ELSE FALSE END)`,
  },
  {
    name: "I9 词表越界（source/level/status 应为 0 行违规）",
    sql: `SELECT COUNT(*) n FROM ${IND} WHERE source NOT IN ('gb','self')
            OR level NOT IN ('section','division','group','subclass','extension')
            OR status NOT IN (0,1)`,
  },
  // ── 品目面 ──
  {
    name: "C1 父指针悬空（应为 0）",
    sql: `SELECT COUNT(*) n FROM ${COM} c LEFT JOIN ${COM} p ON p.code = c.parent_code
          WHERE c.parent_code IS NOT NULL AND c.parent_code <> '' AND p.code IS NULL`,
  },
  {
    name: "C2 码形非 UGT-C-+8 位数字（应为 0）",
    sql: `SELECT COUNT(*) n FROM ${COM} WHERE NOT (code REGEXP '^UGT-C-[0-9]{8}$')`,
  },
  {
    name: "C3 src_code 非 8 位数字（应为 0，白名单按此列校验）",
    sql: `SELECT COUNT(*) n FROM ${COM} WHERE NOT (src_code REGEXP '^[0-9]{8}$')`,
  },
  {
    name: "C4 词表越界（source/level/status 应为 0 行违规）",
    sql: `SELECT COUNT(*) n FROM ${COM} WHERE source <> 'unspsc'
            OR level NOT IN ('segment','family','class','commodity') OR status NOT IN (0,1)`,
  },
  // ── 跨面与挂靠 ──
  {
    name: "X1 两面码段相交（应为 0）",
    sql: `SELECT COUNT(*) n FROM ${IND} i JOIN ${COM} c ON c.code = i.code`,
  },
  {
    name: "X2 行业挂靠孤儿（应为 0）",
    sql: `SELECT COUNT(*) n FROM crm_supplier_industry_rel r LEFT JOIN ${IND} t ON t.code = r.industry_code WHERE t.code IS NULL`,
  },
  {
    name: "X3 行业挂靠串到品目面（应为 0）",
    sql: `SELECT COUNT(*) n FROM crm_supplier_industry_rel r JOIN ${COM} t ON t.code = r.industry_code`,
  },
  {
    name: "X4 主行业码孤儿（应为 0）",
    sql: `SELECT COUNT(*) n FROM supplier s WHERE s.industry_code IS NOT NULL AND s.industry_code <> ''
            AND NOT EXISTS (SELECT 1 FROM ${IND} t WHERE t.code = s.industry_code)`,
  },
];

async function main() {
  console.log(`[check-taxonomy] 连接 ${DB_CFG.host}:${DB_CFG.port}/${DB_CFG.database} ...`);
  const pool = mysql2.createPool({ ...DB_CFG, connectionLimit: 2, dateStrings: true });
  let bad = 0;
  try {
    for (const c of CHECKS) {
      try {
        const [rows] = await pool.query(c.sql);
        const n = Number((rows as RowDataPacket[])[0]?.n ?? -1);
        if (n !== 0) bad++;
        console.log(`  ${n === 0 ? "✓" : "✗"} ${c.name} = ${n}`);
      } catch (err) {
        bad++;
        console.log(`  ✗ ${c.name} 查询失败: ${(err as Error).message}`);
      }
    }
  } finally {
    await pool.end();
  }
  console.log(bad === 0 ? "[check-taxonomy] 全部不变量成立" : `[check-taxonomy] ${bad} 项违规`);
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("[check-taxonomy] 异常:", err);
  process.exit(1);
});
