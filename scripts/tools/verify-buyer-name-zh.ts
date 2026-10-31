/**
 * 巡检：买家中文名必须纯中文（2026-10-31 用户口径：中文名就是纯中文）。
 *
 * 检查面：
 *   ① buyer.name_zh —— 权威中文名；
 *   ② notice_public.buyer_name_cn —— 服务表展示快照（投影应等于 ①）；
 *   ③ scripts/tools/buyer-name-zh-seed.tsv 台账（仓库内可版本化资产）。
 *
 * 只读，不写库。有外文字母即 exit 1（CI/运维巡检用；不接入 lint，因需连库）。
 *
 * 用法：npx tsx scripts/tools/verify-buyer-name-zh.ts
 */
import { readFileSync, existsSync } from "node:fs";
import mysql from "mysql2/promise";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm",
  charset: "utf8mb4",
  connectionLimit: 2,
});

const LATIN = /[A-Za-z]/;
let failed = false;

try {
  const [buyer] = await pool.query(
    `SELECT COUNT(*) total,
            SUM(name_zh REGEXP '[A-Za-z]') mixed
       FROM buyer WHERE name_zh IS NOT NULL AND name_zh <> ''`,
  );
  const b = (buyer as Array<{ total: number; mixed: number | null }>)[0];
  console.log(`buyer.name_zh：${b.total} 条，含外文字母 ${b.mixed ?? 0} 条`);
  if (Number(b.mixed ?? 0) > 0) {
    failed = true;
    const [samples] = await pool.query(
      `SELECT buyer_id, name_zh FROM buyer
        WHERE name_zh IS NOT NULL AND name_zh <> '' AND name_zh REGEXP '[A-Za-z]' LIMIT 8`,
    );
    console.error("  样本:", JSON.stringify(samples));
  }

  const [svc] = await pool.query(
    `SELECT COUNT(*) total,
            SUM(buyer_name_cn REGEXP '[A-Za-z]') mixed
       FROM notice_public WHERE buyer_name_cn IS NOT NULL AND buyer_name_cn <> ''`,
  );
  const s = (svc as Array<{ total: number; mixed: number | null }>)[0];
  console.log(`notice_public.buyer_name_cn：${s.total} 条，含外文字母 ${s.mixed ?? 0} 条`);
  if (Number(s.mixed ?? 0) > 0) failed = true;

  const ledger = "scripts/tools/buyer-name-zh-seed.tsv";
  if (existsSync(ledger)) {
    const bad = readFileSync(ledger, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim() && LATIN.test(line.split("\t").at(-1) ?? ""));
    console.log(`${ledger}：含外文字母 ${bad.length} 行`);
    if (bad.length > 0) failed = true;
  }
} finally {
  await pool.end();
}

if (failed) {
  console.error("✗ 中文名纯度巡检未通过：中文名必须纯中文（不允许任何外文字母）");
  process.exit(1);
}
console.log("✓ 中文名纯度巡检通过（buyer.name_zh / 服务表快照 / 台账均无外文字母）");
