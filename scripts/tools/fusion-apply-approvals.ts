/**
 * 融合挂载 · 人审结论入库（搬运，不自主判父子）
 *
 * @script scripts/tools/fusion-apply-approvals.ts
 * @desc 读入**人工逐条裁定后的 CSV**，把 approved 的挂载结论写入影子表：节点行 + xwalk 行。
 *       脚本只做"搬运 + 入库前机检（FU1 形制 / FU3 一码一爹 / FU4 单调归属）"，红一条即整行拒绝并回报，
 *       绝不自行决定某子该挂某父（父子关系来自人审 CSV）。
 * @csv  node_code,parent_code,axis_std,axis_code,group_code,name_zh,name_en,std,codes[;分隔],relation
 *       —— 每行一个节点；codes 为该节点并入的外部码（主轴那条记 primary，其余 alias）。
 * @usage dry（默认，只校验不写）：npx tsx scripts/tools/fusion-apply-approvals.ts --in approvals.csv
 * @usage 正式写影子表：... --in approvals.csv --db --confirm
 */
import { readFileSync } from "node:fs";
import { isFusionNode, fusionNodeLevel } from "../../src/lib/services/commodity/fusion-path";

const arg = (k: string): string | undefined => {
  const eq = process.argv.find((a) => a.startsWith(`--${k}=`));
  if (eq) return eq.split("=")[1];
  const i = process.argv.indexOf(`--${k}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  return undefined;
};
const DB = process.argv.includes("--db");
const CONFIRM = process.argv.includes("--confirm");
const IN = arg("in");

const NODE_TABLE = "crm_commodity_backbone_fusion__new";
const XWALK_TABLE = "crm_commodity_fusion_xwalk__new";

if (!IN) { console.error("✗ 缺 --in <csv>"); process.exit(1); }
const lines = readFileSync(IN, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
const parse = (l: string) => {
  const [node_code, parent_code, axis_std, axis_code, group_code, name_zh, name_en, std, codes, relation] = l.split(",");
  return { node_code, parent_code, axis_std, axis_code, group_code, name_zh, name_en, std, codes: (codes || "").split(";").filter(Boolean), relation: relation || "primary" };
};

const problems: string[] = [];
const rows = lines.map((l, i) => {
  const r = parse(l);
  if (!isFusionNode(r.node_code)) problems.push(`#${i} node_code 形制非法：${r.node_code}`);
  else if (fusionNodeLevel(r.node_code) !== (r.parent_code ? fusionNodeLevel(r.parent_code) + 1 : 1))
    problems.push(`#${i} 层级与父不连续：${r.node_code}（父 ${r.parent_code || "L1"}）`);
  if (r.parent_code && r.node_code.slice(0, r.node_code.length - 3) !== r.parent_code)
    problems.push(`#${i} 父码≠去末3位：${r.node_code} vs ${r.parent_code}`);
  return r;
});
if (problems.length) { console.error("✗ CSV 机检未过：\n  " + problems.join("\n  ")); process.exit(1); }

console.log(`CSV 解析 ${rows.length} 个节点，全部通过纯本地机检（FU1 形制/层级连续）`);
if (!DB || !CONFIRM) {
  console.log("DRY：未写库。正式入库需同时加 --db --confirm（且此时外部同步/门禁须已就绪）。");
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

let okNodes = 0, okXwalk = 0; const rejected: string[] = [];
for (const r of rows) {
  // FU4 入库前复检：同标准才比 axis 前缀（父须在库里已存在）
  if (r.parent_code) {
    const pr = await q(`SELECT axis_std, axis_code FROM \`${NODE_TABLE}\` WHERE code=?`, [r.parent_code]);
    if (!pr.length) { rejected.push(`${r.node_code}：父 ${r.parent_code} 不在库（须先挂父）`); continue; }
    if (String(pr[0].axis_std) === r.axis_std && !r.axis_code.startsWith(String(pr[0].axis_code))) {
      rejected.push(`${r.node_code}：axis_code ${r.axis_code} 跳出父单调范围（FU4 红）`); continue;
    }
  }
  try {
    await q(
      `INSERT INTO \`${NODE_TABLE}\` (code,parent_code,level,depth,group_code,axis_std,axis_code,name_zh,name_en,attach_status,name_status)
       VALUES (?,?,?,?,?,?,?,?,?,'approved','approved')`,
      [r.node_code, r.parent_code || "", fusionNodeLevel(r.node_code), fusionNodeLevel(r.node_code),
       r.group_code, r.axis_std, r.axis_code, r.name_zh, r.name_en || ""],
    );
    okNodes += 1;
  } catch (e) { rejected.push(`${r.node_code}：节点插入失败 ${(e as Error).message}`); continue; }

  for (const code of r.codes) {
    // FU3 一码一爹：已存在即拒绝（不覆盖他节点归属）
    const dup = await q(`SELECT node_code FROM \`${XWALK_TABLE}\` WHERE std=? AND std_code=?`, [r.std, code]);
    if (dup.length) { rejected.push(`${r.node_code}/${r.std}:${code}：该外部码已归属 ${dup[0].node_code}（FU3 两个爹）`); continue; }
    await q(
      `INSERT INTO \`${XWALK_TABLE}\` (node_code,std,std_code,relation,status) VALUES (?,?,?,?,'approved')`,
      [r.node_code, r.std, code, r.relation],
    );
    okXwalk += 1;
  }
}
await pool.end();
console.log(`✓ 入库：节点 ${okNodes} · xwalk ${okXwalk}`);
if (rejected.length) { console.error(`✗ 拒绝 ${rejected.length} 条：\n  ${rejected.join("\n  ")}`); process.exit(1); }
