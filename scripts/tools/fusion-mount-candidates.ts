/**
 * 融合挂载 · 候选生成（只读，产 pending 建议，绝不写库、绝不自主挂父子）
 *
 * @script scripts/tools/fusion-mount-candidates.ts
 * @desc 给定某父节点与一份"某标准原始料表"，列出可挂到该父下的候选子，并预演 FU1（形制）/FU4（单调归属）
 *       是否成立，输出一份 pending 建议供**人工逐条裁定**。本脚本不入库；入库走 fusion-apply-approvals.ts。
 * @usage npx tsx scripts/tools/fusion-mount-candidates.ts --db --std unspsc --parent UGT-043 --src crm_std_raw_unspsc
 * @note  默认无 --db 即"打印计划不连库"，安全。FU4 只在父 axis_code 已知时预演，跨标准候选交人工判。
 */
import { readFileSync } from "node:fs";
import { isFusionNode, fusionNodeLevel, chainOfFusionNode } from "../../src/lib/services/commodity/fusion-path";

const arg = (k: string): string | undefined => {
  const eq = process.argv.find((a) => a.startsWith(`--${k}=`));
  if (eq) return eq.split("=")[1];
  const i = process.argv.indexOf(`--${k}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  return undefined;
};
const DB = process.argv.includes("--db");
const std = arg("std") as string | undefined;      // unspsc|hs|cpc|eclss
const parent = arg("parent") as string | undefined; // UGT-…
const src = arg("src") as string | undefined;       // 原始料表：(std_code,name_zh,name_en,std_parent)

const fail = (m: string) => { console.error(`✗ ${m}`); process.exit(1); };
if (!isFusionNode(parent ?? "")) fail(`--parent 非合法融合码（UGT-<3位×层>）：${parent}`);

if (!DB) {
  console.log(`计划（未连库）：从 ${src ?? "<原始料表>"} 取 std=${std} 的子候选，预演挂到父 ${parent}（L${fusionNodeLevel(parent)}）下`);
  console.log("输出为 pending 建议，需人工逐条裁定后用 fusion-apply-approvals 入库。加 --db 才实际读料表。");
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
  database: process.env.DB_NAME ?? "crm", charset: "utf8mb4", dateStrings: true,
});
type R = Record<string, string | number | null>;
const q = async (sql: string, a?: unknown[]) => ((await pool.query(sql, a)) as [R[], unknown])[0];

if (!src || !std) { console.log("缺少 --src/--std：无料可读，退出 0"); await pool.end(); process.exit(0); }

// 父在主轴标准里的规范码（FU4 单调归属基线）
const prows = await q(
  `SELECT axis_std, axis_code FROM crm_commodity_backbone_fusion__new WHERE code=?`,
  [parent],
);
const pAxis = prows[0] ? { std: String(prows[0].axis_std), code: String(prows[0].axis_code) } : null;

// 读该标准的"下一层"原始料（std_parent = 父的 axis_code 的直接子；无父信息则全表交人工分层）
const children = await q(
  `SELECT std_code, name_zh, name_en FROM \`${src}\` WHERE std_parent=?`,
  [pAxis?.code ?? ""],
);

const out: Array<Record<string, unknown>> = [];
for (const c of children) {
  const childAxisCode = String(c.std_code);
  // FU4 预演：同标准才比前缀；不同标准（父非本 std）标记 need_human
  const axisOk = pAxis ? (std === pAxis.std ? childAxisCode.startsWith(pAxis.code) : null) : null;
  out.push({
    suggested_parent: parent,
    parent_level: fusionNodeLevel(parent ?? ""),
    std,
    std_code: childAxisCode,
    name_zh: c.name_zh,
    name_en: c.name_en,
    fu4_axis_prefix_ok: axisOk,       // true/false；null=跨标准需人工判
    attach_status: "pending",         // 一律 pending，绝不自动 approved
    ancestors_preview: chainOfFusionNode(parent).join(","),
  });
}
console.log(JSON.stringify(out, null, 0));
console.log(`// 候选 ${out.length} 条，全部 pending；需人工逐条裁定（脚本不自主挂父子）。`);
await pool.end();
