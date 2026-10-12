/**
 * 融合树 · 离线实验室构建器（本地真实数据 → 真建一棵 → 内核自检 → 隔离产物）
 *
 * @script scripts/tools/fusion-build-lab.ts
 * @desc 用本地真实数据（runtime 里的 crm_commodity_nodes 退役留底 + 大类段归属留底）**离线**构建融合树：
 *   ① 解析旧树里真实 UNSPSC 码 + 中英名（不猜、不造）；
 *   ② 把每个 UNSPSC 段(segment) 铺成一个融合 L1 子树，group_code 取其**唯一旧大类**（段⊆旧大类 ⇒ 大类只增不减）；
 *   ③ 段下族/类/商品用 fusion-ingest.scaffoldSubtree 依官方 stdParentCode 铺结构正确的骨架；
 *   ④ 全树用 fusion-tree.collectEdgeViolations 复核（同标准应 0 fatal）；
 *   ⑤ 产物写 runtime/fusion-lab/（gitignored，不进 app、不碰生产库、不入库）。
 * @usage npx tsx scripts/tools/fusion-build-lab.ts
 * @note 纯本地：只读 runtime dump + 写 runtime/fusion-lab。attach/name 一律 pending（语义正名留人审）。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { scaffoldSubtree, type StdRecord } from "../../src/lib/services/commodity/fusion-ingest";
import { collectEdgeViolations, type FusionRow } from "../../src/lib/services/commodity/fusion-tree";
import { stdLevel } from "../../src/lib/services/commodity/fusion-standards";

const LEGACY = join(process.cwd(), "runtime/commodity-legacy-dump-2026-10-11T15-58-44-746Z.sql");
const GROUPSEG = join(process.cwd(), "runtime/commodity-group-segments-dump-2026-10-11T17-36-15-103Z.sql");
const OUT_DIR = join(process.cwd(), "runtime/fusion-lab");

// ── 1) 解析大类段归属：segment(2位) → group_code ──
function parseGroupSegments(): Map<string, string> {
  const m = new Map<string, string>();
  const sql = readFileSync(GROUPSEG, "utf8");
  // 行内 VALUES：('NN', 'UGT-G-xx', ...) 或 INSERT ... ('10','UGT-G-07',...)
  for (const piece of sql.split(/,\s*\(/).join("(").matchAll(/\(([^)]*)\)/g)) {
    const cells = piece[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
    if (cells.length >= 2 && /^\d{2}$/.test(cells[0]) && /^UGT-G-\d+$/.test(cells[1])) m.set(cells[0], cells[1]);
  }
  return m;
}

// ── 2) 解析旧树：真实 UNSPSC 码 + 中英名（按 `),('` 切行）──
function parseLegacy(): Map<string, { zh: string; en: string; level: string }> {
  const text = readFileSync(LEGACY, "utf8");
  const out = new Map<string, { zh: string; en: string; level: string }>();
  for (const raw of text.split("),('")) {
    const f = raw.split("','");
    if (f.length < 8) continue;
    const unspsc = f[2]?.replace(/^\(/, "").replace(/^'|'$/g, "");
    const source = f[3];
    const level = f[4];
    const zh = f[6];
    const en = f[7]?.replace(/'.*$/, "");
    if (!unspsc || !/^\d{8}$/.test(unspsc) || source !== "unspsc") continue;
    out.set(unspsc, { zh: zh ?? "", en: en ?? "", level: level ?? "" });
  }
  return out;
}

const segToGroup = parseGroupSegments();
const legacy = parseLegacy();

// 按段聚合记录（族=前4补0、类=前6补0、商品=8位；各级都建，父链靠 std 前缀）
const bySeg = new Map<string, StdRecord[]>();
for (const [code, meta] of legacy) {
  const seg = code.slice(0, 2);
  if (!bySeg.has(seg)) bySeg.set(seg, []);
  bySeg.get(seg)!.push({ code, name_zh: meta.zh, name_en: meta.en });
}

// ── 3) 每段铺一棵；L1 code = UGT-<3位序号> ──
const allNodes: FusionRow[] = [];
const allXwalk: Array<{ node_code: string; std: string; std_code: string }> = [];
const segments = [...bySeg.keys()].sort();
let l1Seq = 0;
const report: string[] = [];
let totalOrphans = 0;

for (const seg of segments) {
  l1Seq += 1;
  const rootCode = `UGT-${String(l1Seq).padStart(3, "0")}`;
  const group = segToGroup.get(seg) ?? "";
  if (!group) { report.push(`段 ${seg} 无旧大类归属，group_code 置空（交人审）`); }
  // 族/类/商品都作为记录喂 scaffold（scaffold 会用 stdParentCode 逐层推父）
  const recs = bySeg.get(seg)!;
  // 只保留 UNSPSC 合法层级（2/4/6/8 位由 stdLevel 判）
  const records: StdRecord[] = recs.filter((r) => stdLevel("unspsc", r.code) > 0);
  const res = scaffoldSubtree({ rootCode, axisStd: "unspsc", rootAxisCode: seg, groupCode: group || "UGT-G-??", records });
  totalOrphans += res.orphans.length;
  // 根补上真实段名（段级码 = seg 补零到 8；从 legacy 找 seg*000000 之类，或留空待审）
  for (const n of res.nodes) {
    allNodes.push(n);
    allXwalk.push({ node_code: n.code, std: "unspsc", std_code: n.axis_code });
  }
}

// ── 4) 全树内核自检 ──
const viol = collectEdgeViolations(allNodes);
const fatals = viol.filter((v) => v.fatal.length);

// ── 5) 统计 + 隔离产物 ──
const levelCounts = new Map<number, number>();
for (const n of allNodes) levelCounts.set(n.level, (levelCounts.get(n.level) ?? 0) + 1);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "fusion-tree.json"), JSON.stringify(allNodes), "utf8");
writeFileSync(join(OUT_DIR, "fusion-xwalk.json"), JSON.stringify(allXwalk), "utf8");

const lines: string[] = [];
lines.push("=== 融合树离线构建报告（真实数据·本地·隔离）===");
lines.push(`旧树解析到 UNSPSC 码: ${legacy.size}`);
lines.push(`段(L1)数: ${segments.length}（≥32 大类由段细化；映射到旧大类 ${segToGroup.size} 段归属）`);
lines.push(`融合节点总数: ${allNodes.length}`);
lines.push(`分层级计数: ${[...levelCounts.entries()].sort((a, b) => a[0] - b[0]).map(([l, c]) => `L${l}=${c}`).join(" · ")}`);
lines.push(`xwalk 行: ${allXwalk.length}`);
lines.push(`结构自检 collectEdgeViolations: fatal=${fatals.length}${fatals.length ? " ⇒ " + fatals.slice(0, 5).map((f) => f.code + "[" + f.fatal.join("|") + "]").join(" ; ") : "（0，单调归属天然成立）"}`);
lines.push(`需人工/crosswalk（human）边: ${viol.filter((v) => v.human.length && !v.fatal.length).length}`);
lines.push(`scaffold orphan（缺中间层等，交人审）: ${totalOrphans}`);
lines.push(`产物: runtime/fusion-lab/fusion-tree.json · fusion-xwalk.json（未入库、未碰生产）`);
if (report.length) lines.push("备注:\n  " + report.join("\n  "));

const txt = lines.join("\n");
writeFileSync(join(OUT_DIR, "build-report.txt"), txt, "utf8");
console.log(txt);
