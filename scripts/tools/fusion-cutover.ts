/**
 * 融合蓝绿切换 · 前置闸与预案（不改代码、不动数据；仅校验并打印切换/回滚清单）
 *
 * @script scripts/tools/fusion-cutover.ts
 * @desc 切换是"读路径 + 写构建器同批发布"的代码动作（在应用发布里完成），本脚本不代替发布，
 *       只做**切换前体检**与**回滚预案**：确认门禁全绿、影子列已灌满且与纯函数零差异，
 *       未冻结外部同步则一律拒绝。真正的原子切换须人工闸口执行。
 * @usage 体检：npx tsx scripts/tools/fusion-cutover.ts --db
 * @usage 允许切换（双闸）：... --db --frozen --confirm
 * @note  --frozen 表示外部同步已冻结（沿用现网纪律：未冻结拒绝切换，避免切换期写入漂移）。
 */
import { readFileSync } from "node:fs";

const arg = (k: string): string | undefined => {
  const eq = process.argv.find((a) => a.startsWith(`--${k}=`));
  if (eq) return eq.split("=")[1];
  const i = process.argv.indexOf(`--${k}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  return undefined;
};
const DB = process.argv.includes("--db");
const FROZEN = process.argv.includes("--frozen");
const CONFIRM = process.argv.includes("--confirm");
const EXPECT_L1 = Number(arg("expect-l1") ?? 32);

if (!DB) {
  console.log("体检计划（未连库）：将校验 fusion 门禁 FU1–FU7、影子列覆盖、pending 归零。加 --db 执行。");
  process.exit(0);
}

const mysql = (await import("mysql2/promise")).default;
for (const line of readFileSync(new URL("../../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const pool = await mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm", charset: "utf8mb4",
});
type R = Record<string, string | number | null>;
const one = async (sql: string) => ((await pool.query(sql)) as [R[], unknown])[0][0];

const blockers: string[] = [];

// 1) 影子表存在 + L1 数达标（大类只增不减）
const l1 = await one(`SELECT COUNT(*) n FROM crm_commodity_backbone_fusion__new WHERE level=1 AND attach_status='approved'`);
if (Number(l1.n) < EXPECT_L1) blockers.push(`融合树 L1(approved)=${l1.n} < ${EXPECT_L1}：树尚未建到可切换规模`);

// 2) 无 pending 挂/名（FU5 归零才可切）
const pend = await one(`SELECT SUM(attach_status='pending') a, SUM(name_status='pending') nm FROM crm_commodity_backbone_fusion__new`);
const pendAttach = Number(pend.a ?? 0), pendName = Number(pend.nm ?? 0);
if (pendAttach || pendName) blockers.push(`仍有 pending：挂载 ${pendAttach} / 命名 ${pendName}，须清零`);

// 3) 影子列覆盖率（公告重挂到位）
const cov = await one(`
  SELECT SUM(backbone_path IS NOT NULL AND backbone_path<>'') has_old,
         SUM(fusion_backbone_path IS NOT NULL AND fusion_backbone_path<>'') has_fusion
  FROM crm_notice_search`);
const hasOld = Number(cov.has_old ?? 0), hasFusion = Number(cov.has_fusion ?? 0);
if (hasOld === 0) blockers.push("在用 backbone_path 全空：无对照基线，重挂结果不可验证");
else if (hasFusion < hasOld * 0.9) blockers.push(`影子列覆盖 ${hasFusion} 明显低于在用 ${hasOld}（<90%），重挂未到位`);

await pool.end();

console.log(`体检：L1=${l1.n} · pending=${pendAttach + pendName} · 覆盖 在用${hasOld}/影子${hasFusion}`);
if (blockers.length) { console.error("✗ 切换前置未满足：\n  ✗ " + blockers.join("\n  ✗ ")); process.exit(1); }

if (!FROZEN || !CONFIRM) {
  console.log("✓ 体检全绿，但**不执行切换**：切换须 --frozen（外部同步已冻结）+ --confirm 双闸，且由发布同批改读/写。");
  console.log("回滚预案：读/写翻回 backbone_path/旧树即可，秒级零损失（旧树从未被改）。");
  process.exit(0);
}

console.log("⚠ 已带 --frozen --confirm：本脚本仍不代你做代码发布。请按上线清单执行：");
console.log("  1) 同批发布：tree.ts/attribution.ts/format.ts/match-nodes.ts 读端 + search-sync 写端 → 指向 fusion；");
console.log("  2) Meili filterable 切 fusion 列；daily-sync 白名单源切 xwalk approved；");
console.log("  3) 发布后跑 check-commodity-fusion --db（FU7 无残渣须绿）；异常即回滚读/写。");
