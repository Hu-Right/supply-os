/**
 * 融合树 · HS 离线构建器（真实 HS 数据 → 内核铺骨架 → 自检 → 隔离产物）
 *
 * @script scripts/tools/fusion-build-hs.ts
 * @desc 读本地真实 HS 数据（runtime/fusion-lab/data/harmonized-system.csv，来自 datasets/harmonized-system，
 *   列 section,hscode,description,parent,level），按**章(2位)→品目(4位)→子目(6位)**用 fusion-ingest 铺结构正确骨架：
 *   每个 HS 章 = 一棵 HS 主轴子树（L1），section 作 group 溯源。全树用 collectEdgeViolations 复核（同标准应 0 fatal）。
 *   ⚠ HS 名仅英文、语义中文与"HS 章挂到哪个大类"的单树 crosswalk 留人审——本器只出 pending 骨架，不并树、不猜语义。
 * @usage npx tsx scripts/tools/fusion-build-hs.ts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { scaffoldSubtree, type StdRecord } from "../../src/lib/services/commodity/fusion-ingest";
import { collectEdgeViolations, type FusionRow } from "../../src/lib/services/commodity/fusion-tree";
import { stdLevel } from "../../src/lib/services/commodity/fusion-standards";

const SRC = join(process.cwd(), "runtime/fusion-lab/data/harmonized-system.csv");
const OUT_DIR = join(process.cwd(), "runtime/fusion-lab");
if (!existsSync(SRC)) { console.error(`✗ 缺 HS 数据 ${SRC}（先取 harmonized-system.csv）`); process.exit(1); }

/** 极简 CSV 解析（尊重双引号；本表无换行内嵌引号） */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (ch === "," && !inQ) { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

const data = parseCsv(readFileSync(SRC, "utf8"));
const header = data[0];
const iSection = header.indexOf("section"), iCode = header.indexOf("hscode"), iDesc = header.indexOf("description");
const recs = data.slice(1).map((r) => ({
  section: r[iSection] ?? "", code: (r[iCode] ?? "").trim(), desc: r[iDesc] ?? "",
})).filter((r) => /^\d{2,6}$/.test(r.code));

// 按章分组
const chapters = new Map<string, { section: string; rows: typeof recs }>();
for (const r of recs) {
  const ch = r.code.slice(0, 2);
  if (!chapters.has(ch)) chapters.set(ch, { section: r.section, rows: [] });
  chapters.get(ch)!.rows.push(r);
}

const allNodes: FusionRow[] = [];
const allXwalk: Array<{ node_code: string; std: string; std_code: string }> = [];
let seq = 0, orphans = 0;
const notes: string[] = [];
for (const [ch, grp] of [...chapters.entries()].sort()) {
  seq += 1;
  const rootCode = `UGT-${String(seq).padStart(3, "0")}`;
  // 只把比章更深的码(4/6位)当 records；章本身是 root axis
  const records: StdRecord[] = grp.rows
    .filter((r) => r.code.length > 2 && stdLevel("hs", r.code) > 0)
    .map((r) => ({ code: r.code, name_en: r.desc, name_zh: "" }));
  const res = scaffoldSubtree({ rootCode, axisStd: "hs", rootAxisCode: ch, groupCode: `HS-${grp.section}`, records });
  orphans += res.orphans.length;
  for (const n of res.nodes) { allNodes.push(n); allXwalk.push({ node_code: n.code, std: "hs", std_code: n.axis_code }); }
}

const viol = collectEdgeViolations(allNodes);
const fatals = viol.filter((v) => v.fatal.length);
const lv = new Map<number, number>();
for (const n of allNodes) lv.set(n.level, (lv.get(n.level) ?? 0) + 1);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "hs-skeleton.json"), JSON.stringify(allNodes), "utf8");
writeFileSync(join(OUT_DIR, "hs-xwalk.json"), JSON.stringify(allXwalk), "utf8");
const lines = [
  "=== HS 离线构建报告（真实数据·本地·隔离·pending）===",
  `HS 数据行: ${recs.length} · 章数(L1): ${seq}`,
  `HS 骨架节点: ${allNodes.length} · 分层: ${[...lv.entries()].sort((a, b) => a[0] - b[0]).map(([l, c]) => `L${l}=${c}`).join(" · ")}`,
  `xwalk(hs): ${allXwalk.length}`,
  `自检 collectEdgeViolations: fatal=${fatals.length}${fatals.length ? " ⇒ " + fatals.slice(0, 5).map((f) => f.code + "[" + f.fatal.join("|") + "]").join(" ; ") : "（0）"}`,
  `orphan: ${orphans} · 中文/单树并入=待人审`,
  `产物: runtime/fusion-lab/hs-skeleton.json · hs-xwalk.json`,
  ...(notes.length ? ["备注:", ...notes.map((n) => "  " + n)] : []),
];
const txt = lines.join("\n");
writeFileSync(join(OUT_DIR, "hs-report.txt"), txt, "utf8");
console.log(txt);
