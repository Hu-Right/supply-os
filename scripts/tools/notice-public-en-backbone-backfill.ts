/**
 * 服务表新列回填/桥接（宽表退役 Phase 1）
 *
 * @module scripts/tools/notice-public-en-backbone-backfill
 * @description 把宽表独有的两件事搬进服务表，供「读源切到 notice_public」使用：
 *              ① 英文译文（`title_en` / `description_en`）：源 = notice_translations(lang='en')
 *              ② 品目骨架路径（`backbone_path`）：源 = notice_attribution_nodes（与宽表构建同一入口）
 *
 *              写库一律走 `notice-public/build.backfillPublicEnAndBackbone`（N1 红线：
 *              服务表唯一写入者是 build.ts）。本脚本只做缺口统计与调用。
 *              幂等，可反复跑；切换期可当**定时桥接作业**（新代码接管写路径后即可停）。
 *
 * 用法：
 *   npx tsx scripts/tools/notice-public-en-backbone-backfill.ts                # DRY：只报缺口
 *   npx tsx scripts/tools/notice-public-en-backbone-backfill.ts --apply        # 全量回填
 *   npx tsx scripts/tools/notice-public-en-backbone-backfill.ts --apply --recent=24   # 只补最近 24h 变更
 */
import { readFileSync } from "node:fs";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { backfillPublicEnAndBackbone } from "../../src/lib/services/notice-public/build";

const APPLY = process.argv.includes("--apply");
const RECENT_HOURS = Number((process.argv.find((a) => a.startsWith("--recent=")) ?? "").split("=")[1] || 0);

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  charset: "utf8mb4", connectionLimit: 3, enableKeepAlive: true,
});

const recentWhere = RECENT_HOURS > 0
  ? `AND p.updated_at >= UNIX_TIMESTAMP(NOW()) - ${RECENT_HOURS * 3600}`
  : "";

const [[gap]] = await pool.query<RowDataPacket[]>(
  `SELECT
     (SELECT COUNT(*) FROM notice_public p JOIN notice_translations t
        ON t.notice_id=p.notice_pk AND t.lang='en'
       WHERE (p.title_en IS NULL OR p.title_en='') AND t.title_tr IS NOT NULL AND t.title_tr<>'' ${recentWhere}) AS en_gap,
     (SELECT COUNT(*) FROM notice_public p WHERE p.backbone_path IS NULL ${recentWhere}) AS backbone_gap`,
);
console.log(
  `[backfill] 待补：英文标题 ${Number(gap.en_gap)} 行 · 骨架路径 ${Number(gap.backbone_gap)} 行${RECENT_HOURS ? `（最近 ${RECENT_HOURS}h）` : ""}`,
);

if (!APPLY) {
  console.log("[backfill] DRY：未写库（加 --apply 生效）");
  await pool.end();
  process.exit(0);
}

const r = await backfillPublicEnAndBackbone(pool, { recentHours: RECENT_HOURS });
console.log(`[backfill] 英文列写入 ${r.enWritten} 行 · 骨架列写入 ${r.backboneWritten} 行 · 扫描 ${r.scanned} 行`);

const [[after]] = await pool.query<RowDataPacket[]>(
  `SELECT (SELECT COUNT(*) FROM notice_public WHERE backbone_path IS NOT NULL) AS bb_filled,
          (SELECT COUNT(*) FROM notice_public WHERE title_en IS NOT NULL AND title_en<>'') AS en_filled`,
);
console.log(`[backfill] 现状：骨架 ${Number(after.bb_filled)} 行 · 英文标题 ${Number(after.en_filled)} 行`);
await pool.end();
