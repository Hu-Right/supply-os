/**
 * 行业树 × 供应商数据 · 闭环度量（只读，可反复执行）
 *
 * 用法：
 *   npm run check:industry-loop
 *   node scripts/gates/industry-loop-health.mjs [--json]     # 机器可读输出，供后续批次比对基线
 *
 * 它回答的是「树与数据互相咬合到哪」，与既有两道门分工不同：
 *   scripts/gates/check-taxonomy-invariants.ts  只管树自身结构不变量（I/C/X 系）
 *   scripts/gates/verify-industry-links.ts      只管挂靠质量（覆盖率/集中度/粒度）
 *   本脚本                                        管**缺口性质**：Q1 粗叶集、Q4 疑似保留分支、
 *                                          树利用率、`supplier_count` 漂移，并汇总 mine 产出的
 *                                          文本口径四象限（Q1a/Q1b/Q2/Q3）。
 *
 * 只读三层守卫：START TRANSACTION READ ONLY + 每条 SQL 过 assertReadOnlySql + 无 --apply 参数。
 * 阈值一律取自 lib/industry-loop.mjs 的 TH，不在本文件里散落数字。
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { TH, assertReadOnlySql, pct, createSubtreeLinks, findMaximalEmptyRoots } from "./lib/industry-loop.mjs";

/** 硬底线：今天实测成立且属"结构被改坏"级别的事实，跌破即 exit 1 */
const FLOORS = {
  /** 树只增不减：2026-10-10 基线 2,080（国标 1,972 + 自研 108） */
  minTreeNodes: 2080,
  /** 国标零挂靠分支不得低于此（低于说明有国标维度被删，而不是被填上） */
  minGbEmptyBranches: 300,
};

const LEVELS = ["section", "division", "group", "subclass", "extension"];
const LEVEL_CN = { section: "门类", division: "大类", group: "中类", subclass: "小类", extension: "自研" };

/**
 * 连接配置：必须显式给 DB_HOST / DB_NAME（来自 .env），缺失即拒跑。
 * 不留默认值——防止本脚本静默连到另一个实例（与 runtime 运维脚本同一守卫思路）。
 */
if (!process.env.DB_HOST || !process.env.DB_NAME) {
  console.error("[industry-loop] 缺 DB_HOST / DB_NAME，拒绝跑（避免误连错误的库）");
  process.exit(1);
}
const DB_CFG = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME,
};

/** 所有 SQL 过守卫；本脚本只允许 SELECT */
let conn;
const q = async (sql, args) => {
  assertReadOnlySql(sql);
  return (await conn.query(sql, args))[0];
};

/** 找最近的 mine 候选文件（文本口径四象限的唯一来源，没有就如实说没跑） */
function latestArtifact() {
  const dir = path.resolve(process.cwd(), "runtime");
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^industry-gap-candidates-\d{8}\.json$/.test(f))
    .sort()
    .reverse();
  if (!files.length) return null;
  const p = path.join(dir, files[0]);
  try {
    return { file: `runtime/${files[0]}`, data: JSON.parse(fs.readFileSync(p, "utf8")), mtime: fs.statSync(p).mtime };
  } catch {
    return { file: `runtime/${files[0]}`, data: null, mtime: fs.statSync(p).mtime };
  }
}

async function main() {
  conn = await mysql.createConnection({ ...DB_CFG, dateStrings: true, charset: "utf8mb4" });
  await q("START TRANSACTION READ ONLY");

  /* ── 1. 三口径人口 ── */
  const pop = (
    await q(`SELECT COUNT(*) total,
        SUM(verify_status='done' AND company <> '测试') visible,
        SUM(COALESCE(business_scope,'')<>'' OR COALESCE(products,'')<>'') has_evidence,
        SUM(industry_code IS NOT NULL AND industry_code<>'') coded,
        SUM((industry_code IS NULL OR industry_code='') AND (COALESCE(business_scope,'')<>'' OR COALESCE(products,'')<>'')) uncoded_with_evidence
      FROM supplier`)
  )[0];

  /* ── 2. 挂靠聚合（一次全表 GROUP BY，不做 2,080 次相关子查询） ── */
  const relTot = (
    await q(`SELECT COUNT(*) rows_all, COUNT(DISTINCT supplier_id) sups, COUNT(DISTINCT industry_code) codes FROM crm_supplier_industry_rel`)
  )[0];
  const linkRows = await q(`SELECT industry_code, COUNT(*) direct_links FROM crm_supplier_industry_rel GROUP BY industry_code`);
  const directByCode = new Map(linkRows.map((r) => [r.industry_code, Number(r.direct_links)]));

  /* ── 3. 树本体 + 在 JS 里算子树累计（O(N)，比递归 CTE 便宜且可控） ── */
  const nodes = await q(`SELECT code, level, source, name_zh, parent_code, supplier_count FROM crm_industry_nodes`);
  const childrenByParent = new Map();
  const byCode = new Map();
  for (const n of nodes) {
    byCode.set(n.code, n);
    if (!n.parent_code) continue;
    if (!childrenByParent.has(n.parent_code)) childrenByParent.set(n.parent_code, []);
    childrenByParent.get(n.parent_code).push(n);
  }
  const subLinks = createSubtreeLinks(childrenByParent, directByCode);

  const util = new Map();
  for (const lv of LEVELS) util.set(lv, { total: 0, used: 0 });
  let drift = 0;
  const q1Coarse = [];
  for (const n of nodes) {
    const direct = directByCode.get(n.code) ?? 0;
    const u = util.get(n.level);
    if (u) {
      u.total++;
      if (direct > 0) u.used++;
    }
    if (Number(n.supplier_count) !== direct) drift++;

    const kidsSum = (childrenByParent.get(n.code) ?? []).reduce((a, c) => a + subLinks(c.code), 0);
    if (direct >= TH.q1MinDirect && kidsSum === 0) q1Coarse.push({ code: n.code, name: n.name_zh, level: n.level, direct });
  }

  q1Coarse.sort((a, b) => b.direct - a.direct);
  // Q4 的 SQL 半口径：国标节点整片（含自身）零挂靠的最上层空根；文本证据那半由 mine 补
  const gbEmptyRoots = findMaximalEmptyRoots(nodes, { byCode, childrenByParent }, directByCode, subLinks).roots;
  const gbEmptyCount = gbEmptyRoots.length;
  const gbEmptyByLevel = new Map();
  for (const n of gbEmptyRoots) gbEmptyByLevel.set(n.level, (gbEmptyByLevel.get(n.level) ?? 0) + 1);

  /* ── 4. 文本口径四象限：读 mine 产物，不谎报 ── */
  const art = latestArtifact();

  /* ── 输出 ── */
  const lines = [];
  const out = (s = "") => lines.push(s);
  out(`[industry-loop] ${DB_CFG.host}:${DB_CFG.port}/${DB_CFG.database}（只读·START TRANSACTION READ ONLY）`);
  out(`\n1) 三口径人口`);
  out(`   全目录 ${num(pop.total)} 家（缺口挖掘口径）· 有业务证据 ${num(pop.has_evidence)} 家（原料池上限）`);
  out(`   已有主行业码 ${num(pop.coded)} 家（${pct(Number(pop.coded) / Number(pop.total))}）· 未挂码但有证据 ${num(pop.uncoded_with_evidence)} 家`);
  out(`   门户可见 ${num(pop.visible)} 家（消费展示口径，样本太小，本脚本不设覆盖率硬线）`);
  out(`\n2) 树利用率（该层"有直接挂靠"节点 / 该层节点）`);
  for (const lv of LEVELS) {
    const u = util.get(lv);
    out(`   ${String(LEVEL_CN[lv]).padEnd(4)} ${String(u.used).padStart(5)} / ${String(u.total).padStart(5)} = ${pct(u.total ? u.used / u.total : 0)}`);
  }
  out(`\n3) Q1 粗叶集（直接挂靠 ≥ ${TH.q1MinDirect} 且整片子孙零挂靠；Q1a/Q1b 的分界要子名命中率，见 mine）：${q1Coarse.length} 个`);
  for (const c of q1Coarse.slice(0, 10)) out(`   ${c.code} ${String(LEVEL_CN[c.level]).padEnd(3)} ${String(c.direct).padStart(6)} ${c.name}`);
  out(`\n4) Q4 疑似保留分支（国标节点整片零挂靠；文本证据那半由 mine 确认）：${gbEmptyCount} 个最上层空根`);
  out(`   ${[...gbEmptyByLevel].map(([lv, n]) => `${LEVEL_CN[lv]} ${n}`).join(" · ")}`);
  out(`\n5) 闭环健康度`);
  out(`   rel ${num(relTot.rows_all)} 行 / ${num(relTot.sups)} 家 / 用到 ${relTot.codes} 个码（树共 ${nodes.length}）`);
  out(`   supplier_count 列与实测漂移 ${drift} 个节点（本脚本一律实时聚合，不读该列；刷新属写操作，另批处理）`);
  out(`\n6) 文本口径四象限（读最近一次 mine 产物）`);
  if (art?.data) {
    const s = art.data.summary ?? {};
    out(`   来源 ${art.file}（生成于 ${art.data.generatedAt ?? "未知"}）`);
    out(`   Q1a 子层空转 ${s.Q1a ?? "?"} 个粗码 · Q1b 下切候选 ${s.Q1b ?? "?"} 条 · Q2 新增维度候选 ${s.Q2 ?? "?"} 条 · Q3 死钩子 ${s.Q3 ?? "?"}（自研 ${s.Q3Self ?? "?"} / 国标 ${s.Q3Gb ?? "?"}）`);
    out(`   接线可释放供应商 ≈ ${num(s.attachableSuppliers ?? 0)} 家（把已有码挂上去，不需要造新节点）`);
  } else {
    out(`   未产出——先跑 npm run mine:industry-gap（本项不谎报为 0）`);
  }

  /* ── 判定 ── */
  const breaches = [];
  if (nodes.length < FLOORS.minTreeNodes) breaches.push(`树节点 ${nodes.length} < 底线 ${FLOORS.minTreeNodes}（树被删过）`);
  if (gbEmptyCount < FLOORS.minGbEmptyBranches) breaches.push(`国标空分支 ${gbEmptyCount} < 底线 ${FLOORS.minGbEmptyBranches}（有国标维度被移除）`);
  if (art?.data) {
    const cands = art.data.candidates ?? [];
    const fromQ4 = cands.filter((c) => c.pool === "Q4").length;
    if (fromQ4) breaches.push(`候选清单混入 Q4 ${fromQ4} 条（保留分支不得自动生成候选）`);
    const badParent = cands.filter((c) => c.suggestedParentCode && !["group", "subclass"].includes(c.parentLevel));
    if (badParent.length) breaches.push(`候选里有 ${badParent.length} 条父级非法（自研层只能挂中类/小类，镜像 I5/I6）`);
  }
  const misses = [];
  if (!art) misses.push("尚无候选文件，四象限只有 SQL 半口径");
  else if (art.data && !((art.data.summary?.Q1a ?? 0) + (art.data.summary?.Q3 ?? 0)))
    misses.push("接线清单为空（Q1a+Q3=0，可能子名/自研词表口径退化）");
  if (art?.data && !((art.data.summary?.Q1b ?? 0) + (art.data.summary?.Q2 ?? 0)))
    misses.push("造码候选为 0（本轮无可动缺口，需人工复核是否判据过严）");

  out(`\n──────── 门禁判定 ────────`);
  out(breaches.length ? `✗ 底线击穿 ${breaches.length} 项：\n   - ${breaches.join("\n   - ")}` : `✓ 底线 ${Object.keys(FLOORS).length} 项 + 候选合法性全部成立`);
  out(misses.length ? `· 目标线未达 ${misses.length} 项（补数/复跑口径，不阻断）：\n   - ${misses.join("\n   - ")}` : `✓ 目标线全部达标`);

  console.log(lines.join("\n"));
  if (process.argv.includes("--json")) {
    console.log(
      JSON.stringify(
        {
          populations: pop,
          utilization: Object.fromEntries([...util].map(([k, v]) => [k, v])),
          q1Coarse,
          gbEmptyBranches: gbEmptyCount,
          supplierCountDriftNodes: drift,
          rel: relTot,
          artifact: art ? { file: art.file, generatedAt: art.data?.generatedAt, summary: art.data?.summary ?? null } : null,
          breaches,
          misses,
        },
        null,
        2,
      ),
    );
  }
  await conn.query("ROLLBACK");
  await conn.end();
  if (breaches.length) process.exit(1);
}

const num = (x) => Number(x ?? 0).toLocaleString("en-US");

main().catch((err) => {
  console.error("[industry-loop] 异常:", err);
  process.exit(1);
});
