/**
 * 融合骨架生成器（P1→P2 机械闭环；默认 --demo 零现网，真实模式只读）
 *
 * @script scripts/tools/fusion-scaffold.ts
 * @desc 消费 fusion-ingest.scaffoldSubtree：给定"主轴标准 + 根 + 该标准一批记录"，铺出结构绝对正确的
 *       pending 骨架 CSV（列同 fusion-approvals 模板），供**人工逐条正名/裁定**后交 fusion-apply-approvals 入库。
 *       工具本身不写库、不判语义——名字原样搬运输入、状态一律 pending；缺中间层只报 orphan 不自动补。
 * @usage 自证（不连库，用合成样例）：npx tsx scripts/tools/fusion-scaffold.ts --demo
 * @usage 真实（只读源表）：... --db --std unspsc --src crm_std_raw --root-code UGT-043 --root-axis 10 --group UGT-G-07
 */
import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { scaffoldSubtree, type StdRecord } from "../../src/lib/services/commodity/fusion-ingest";
import { FUSION_STDS, type StdKey } from "../../src/lib/services/commodity/fusion-standards";

const arg = (k: string): string | undefined => {
  const eq = process.argv.find((a) => a.startsWith(`--${k}=`));
  if (eq) return eq.split("=")[1];
  const i = process.argv.indexOf(`--${k}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  return undefined;
};
const DEMO = process.argv.includes("--demo");
const DB = process.argv.includes("--db");
const OUT = arg("out") ?? "runtime/fusion-skeleton.pending.csv";

const CSV_HEADER = "node_code,parent_code,axis_std,axis_code,group_code,name_zh,name_en,std,codes,relation";
const toCsvRow = (n: { code: string; parent_code: string; axis_std: string; axis_code: string; group_code: string; name_zh?: string; name_en?: string }) =>
  [n.code, n.parent_code, n.axis_std, n.axis_code, n.group_code, n.name_zh ?? "", n.name_en ?? "", n.axis_std, n.axis_code, "primary"].join(",");

function emit(nodes: ReturnType<typeof scaffoldSubtree>["nodes"], orphans: ReturnType<typeof scaffoldSubtree>["orphans"]) {
  // 骨架全部 pending：apply 前必须人工把每条 name/父子 审定（此 CSV 只是草稿）
  const body = nodes.map(toCsvRow).join("\n");
  const text = `# 融合骨架草稿(pending)：请人工逐条正名/确认父子后，交 fusion-apply-approvals 入库\n# orphan ${orphans.length} 条：\n` +
    orphans.map((o) => `#   ${o.code}: ${o.reason}`).join("\n") + `\n${CSV_HEADER}\n${body}\n`;
  writeFileSync(OUT, text, "utf8");
  console.log(`✓ 骨架 ${nodes.length} 节点 · orphan ${orphans.length} → ${OUT}（均为 pending，待人工审定）`);
}

if (DEMO) {
  // 合成样例，仅证明机械链路（不代表真实标准语义）
  const records: StdRecord[] = [
    { code: "1001", name_zh: "示例族A" },
    { code: "1002", name_zh: "示例族B" },
    { code: "100120", name_zh: "示例类A1" },
    { code: "10012005", name_zh: "示例商品A1x" },
    { code: "99999999", name_zh: "非法/游离" },
  ];
  const res = scaffoldSubtree({ rootCode: "UGT-043", axisStd: "unspsc", rootAxisCode: "10", groupCode: "UGT-G-07", records });
  emit(res.nodes, res.orphans);
  process.exit(0);
}

if (!DB || !arg("std") || !arg("src") || !arg("root-code") || !arg("root-axis") || !arg("group")) {
  console.log("用法见文件头。真实只读模式需 --db --std --src --root-code --root-axis --group；或 --demo 自证。");
  process.exit(0);
}

const std = arg("std") as StdKey;
if (!FUSION_STDS.includes(std)) { console.error(`✗ --std 须为 ${FUSION_STDS.join("/")}`); process.exit(1); }
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
const rows = (await pool.query(`SELECT code, name_zh, name_en FROM \`${arg("src")}\``) as [R[], unknown])[0];
await pool.end();
const records: StdRecord[] = rows.map((r) => ({ code: String(r.code), name_zh: String(r.name_zh ?? ""), name_en: r.name_en == null ? undefined : String(r.name_en) }));
const res = scaffoldSubtree({ rootCode: arg("root-code")!, axisStd: std, rootAxisCode: arg("root-axis")!, groupCode: arg("group")!, records });
emit(res.nodes, res.orphans);
