/**
 * 巡检：买家中文名必须纯中文（2026-10-31 用户口径：中文名就是纯中文）。
 *
 * 检查面（2026-11-26 起收窄到 active，理由见下）：
 *   ① buyer.name_zh —— 权威中文名（**仅 active 实体**）；
 *   ② notice_public.buyer_name_cn —— 服务表展示快照（**仅 active 实体的投影**）；
 *   ③ scripts/tools/buyer-name-zh-seed.tsv 台账（仓库内可版本化资产）。
 *
 * 为什么排除 inactive：`status='inactive'` 是实体合并/下线后的历史行，
 * 不展示、不参与匹配（entity-index 只装载 active），它们的旧中文名既不会再被用到，
 * 也不该让巡检永远红着。数量会作为信息行打印出来，便于人工掌握存量。
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
       FROM buyer
      WHERE status = 'active' AND name_zh IS NOT NULL AND name_zh <> ''`,
  );
  const b = (buyer as Array<{ total: number; mixed: number | null }>)[0];
  console.log(`buyer.name_zh（active）：${b.total} 条，含外文字母 ${b.mixed ?? 0} 条`);
  if (Number(b.mixed ?? 0) > 0) {
    failed = true;
    const [samples] = await pool.query(
      `SELECT buyer_id, name_zh FROM buyer
        WHERE status = 'active' AND name_zh IS NOT NULL AND name_zh <> ''
          AND name_zh REGEXP '[A-Za-z]' LIMIT 8`,
    );
    console.error("  样本:", JSON.stringify(samples));
  }

  // 信息性：历史下线行不拦截
  const [inactive] = await pool.query(
    `SELECT COUNT(*) n FROM buyer
      WHERE status <> 'active' AND name_zh IS NOT NULL AND name_zh <> ''
        AND name_zh REGEXP '[A-Za-z]'`,
  );
  console.log(`  （信息）历史非 active 行含外文字母：${Number((inactive as Array<{ n: number }>)[0].n)} 条，不拦截`);

  const [svc] = await pool.query(
    `SELECT COUNT(*) total,
            SUM(p.buyer_name_cn REGEXP '[A-Za-z]') mixed
       FROM notice_public p
       JOIN buyer b ON b.buyer_id = p.buyer_id
      WHERE b.status = 'active' AND p.buyer_name_cn IS NOT NULL AND p.buyer_name_cn <> ''`,
  );
  const s = (svc as Array<{ total: number; mixed: number | null }>)[0];
  console.log(`notice_public.buyer_name_cn（active 实体）：${s.total} 条，含外文字母 ${s.mixed ?? 0} 条`);
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
console.log("✓ 中文名纯度巡检通过（active 买家 / 其服务表快照 / 台账均无外文字母）");
