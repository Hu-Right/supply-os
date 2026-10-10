/**
 * 供应商行业挂靠质量门禁（只读，可反复执行）
 *
 * 用法：
 *   npx tsx scripts/verify-industry-links.ts            # 打印全部指标 + 按底线判定
 *   npx tsx scripts/verify-industry-links.ts --gate     # 额外把「目标线」也计入失败
 *   npm run check:industry-links / check:industry-links:strict
 *
 * 它度量的是「树建好之后，供应商到底挂上去了没有、挂得对不对」，与
 * scripts/check-taxonomy-invariants.ts（只管树自身结构不变量）分工不同。
 *
 * 两级阈值，刻意分开：
 *   FLOORS 底线：2026-10-09 实测已成立、且门户消费链路直接依赖的事实。跌破=链路被改坏，
 *     硬失败 exit 1，可常驻。门禁今天就是绿的，红了就是真红。
 *   TARGETS 目标线：用户要求的终态（覆盖率高、不坍缩、新兴产业可用），当前未达标，
 *     且补数是后台的数据工作，不是本仓库的代码缺陷——所以只报不红，避免一座常驻红灯
 *     把「数据没填够」和「代码写坏了」混成同一种噪音。达标后用 --gate 升硬。
 */
import "dotenv/config";
import mysql2 from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";
import { DbConfigSchema } from "../../src/lib/db/db-config.js";

const DB_CFG = DbConfigSchema.parse({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "crm",
});

const IND = "`crm_industry_nodes`";

/** 目标线：终态要求，未达只报不红；--gate 时计入失败 */
const TARGETS = {
  /** 门户可见供应商（verify_status='done'）有主行业码的比例 */
  portalCoverage: 0.6,
  /** 单个行业节点承载供应商占已挂靠的最大比例（防"一个节点吞掉全部"） */
  maxTop1Share: 0.25,
  /** 20 个门类里必须真的有挂靠的门类数 */
  minSectionsUsed: 12,
  /** 24 个自研新兴节点里必须有挂靠的数量（新兴产业要能用） */
  minExtensionUsed: 8,
  /** 挂靠落在小类或自研叶子的行数比例（打标粒度要"具体"） */
  minLeafShare: 0.3,
};

/**
 * 底线：2026-10-09 实测成立，门户 P2 消费链路直接依赖它们。
 * 每一项括号里是当日实测值；跌破说明挂靠数据被改写或删除，属真故障。
 */
const FLOORS = {
  /** 挂靠表行数下限（实测 21,218；留 5% 波动，防批量重算中途失败清空） */
  minRelRows: 20000,
  /** 有挂靠的门类数下限（实测 19/20，标准口径要求门类层可用） */
  minSectionsUsed: 10,
  /** 门户覆盖率下限（实测 36.1%；再低说明可见供应商与挂靠脱钩） */
  minPortalCoverage: 0.3,
  /** 主行业码同时出现在挂靠表的比例（实测 100%，卡片主标签与多标签必须自洽） */
  minPrimaryInRel: 0.99,
  /** 小类层必须仍有挂靠（实测 1,029 行 / 995 家；归零=粒度整体坍缩到粗层） */
  minSubclassRows: 1,
};

async function main() {
  const conn = await mysql2.createConnection({ ...DB_CFG, dateStrings: true });
  const q = async (sql: string) => (await conn.query(sql))[0] as RowDataPacket[];
  const one = async (sql: string) => (await q(sql))[0];

  /* ── 1. 覆盖率 ── */
  const cover = await one(`SELECT
      COUNT(*) total,
      SUM(verify_status='done') done,
      SUM(industry_code IS NOT NULL AND industry_code<>'') coded,
      SUM(verify_status='done' AND industry_code IS NOT NULL AND industry_code<>'') done_coded,
      SUM(verify_status='done' AND industry IS NOT NULL AND industry<>'') done_text
    FROM supplier`);
  const portalCoverage = Number(cover.done) ? Number(cover.done_coded) / Number(cover.done) : 0;

  /* ── 2. 挂靠表本体量与层级分布 ── */
  const rel = await one(`SELECT COUNT(*) rows_all, COUNT(DISTINCT supplier_id) sups, COUNT(DISTINCT industry_code) codes FROM crm_supplier_industry_rel`);
  const byLevel = await q(`SELECT t.level, COUNT(*) rows_n, COUNT(DISTINCT r.supplier_id) sups
    FROM crm_supplier_industry_rel r JOIN ${IND} t ON t.code = r.industry_code
    GROUP BY t.level ORDER BY rows_n DESC`);
  const leafRows = byLevel.filter((x) => x.level === "subclass" || x.level === "extension").reduce((a, b) => a + Number(b.rows_n), 0);
  const leafShare = Number(rel.rows_all) ? leafRows / Number(rel.rows_all) : 0;

  /* ── 3. 头部集中度 ── */
  const top = await q(`SELECT r.industry_code, t.name_zh, t.level, COUNT(DISTINCT r.supplier_id) sups
    FROM crm_supplier_industry_rel r JOIN ${IND} t ON t.code = r.industry_code
    GROUP BY r.industry_code, t.name_zh, t.level ORDER BY sups DESC LIMIT 10`);
  const top1Share = Number(rel.sups) ? Number(top[0]?.sups ?? 0) / Number(rel.sups) : 0;
  const top10Share = Number(rel.sups) ? top.reduce((a, b) => a + Number(b.sups), 0) / Number(rel.sups) : 0;

  /* ── 4. 门类偏度（子树去重口径） ── */
  const sections = await q(`WITH RECURSIVE cl AS (
      SELECT code anc, code node FROM ${IND} WHERE level='section'
      UNION ALL SELECT cl.anc, n.code FROM ${IND} n JOIN cl ON n.parent_code = cl.node)
    SELECT s.code, s.name_zh, (SELECT COUNT(DISTINCT r.supplier_id) FROM cl JOIN crm_supplier_industry_rel r ON r.industry_code = cl.node WHERE cl.anc = s.code) sups
    FROM ${IND} s WHERE s.level='section' ORDER BY sups DESC`);
  const sectionsUsed = sections.filter((s) => Number(s.sups) > 0).length;
  const maxSectionShare = Number(rel.sups) ? Number(sections[0]?.sups ?? 0) / Number(rel.sups) : 0;

  /* ── 5. 自研新兴节点可用性 ── */
  const ext = await q(`SELECT t.code, t.name_zh, (SELECT COUNT(*) FROM crm_supplier_industry_rel r WHERE r.industry_code = t.code) direct
    FROM ${IND} t WHERE t.source='self' ORDER BY direct DESC`);
  const extUsed = ext.filter((x) => Number(x.direct) > 0).length;
  // 分母动态取数：扩树后总节点/自研节点会变，写死 1996、24 会失真误导
  const treeTot = await one(`SELECT COUNT(*) n FROM ${IND}`);
  const selfTot = ext.length;

  /* ── 6. 每供应商码数分布（多行业表达是否在用） ── */
  const perSup = await one(`SELECT
      SUM(n = 1) one_code, SUM(n BETWEEN 2 AND 3) two_three, SUM(n > 3) over_three, MAX(n) max_n, ROUND(AVG(n),2) avg_n
    FROM (SELECT supplier_id, COUNT(DISTINCT industry_code) n FROM crm_supplier_industry_rel GROUP BY supplier_id) x`);

  /* ── 7. 主行业码与挂靠表是否自洽（门户卡片靠它同时展示主标签与多标签）── */
  const primaryInRel = await one(`SELECT
      COUNT(*) coded,
      SUM(EXISTS(SELECT 1 FROM crm_supplier_industry_rel r
                  WHERE r.supplier_id = s.id AND r.industry_code = s.industry_code)) in_rel
    FROM supplier s WHERE s.industry_code IS NOT NULL AND s.industry_code <> ''`);
  const inRelShare = Number(primaryInRel.coded) ? Number(primaryInRel.in_rel) / Number(primaryInRel.coded) : 1;

  /* ── 8. 门户现用行业文本的脏度（P2 要替掉的东西）── */
  const text = await one(`SELECT
      COUNT(DISTINCT NULLIF(TRIM(industry),'')) distinct_values,
      SUM(industry IS NULL OR TRIM(industry)='') empty_text
    FROM supplier WHERE verify_status='done'`);
  const alignable = await one(`SELECT
      COUNT(*) done_with_text,
      SUM(EXISTS(SELECT 1 FROM ${IND} t WHERE t.name_zh = TRIM(s.industry))) matched_by_name
    FROM supplier s WHERE s.verify_status='done' AND s.industry IS NOT NULL AND TRIM(s.industry)<>''`);
  const topText = await q(`SELECT TRIM(industry) v, COUNT(*) n FROM supplier
    WHERE verify_status='done' AND industry IS NOT NULL AND TRIM(industry)<>'' GROUP BY v ORDER BY n DESC LIMIT 8`);

  /* ── 输出 ── */
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  console.log(`[industry-links] ${DB_CFG.host}:${DB_CFG.port}/${DB_CFG.database}`);
  console.log(`\n1) 覆盖率：目录可见(verify_status=done) ${cover.done} 家，其中已有行业码 ${cover.done_coded} 家 = ${pct(portalCoverage)}（目标 ≥ ${pct(TARGETS.portalCoverage)}）`);
  console.log(`   全表 ${cover.total} 家有码 ${cover.coded}；可见但仅有自由文本 ${cover.done_text} 家`);
  console.log(`\n2) 挂靠：${rel.rows_all} 行 / ${rel.sups} 家 / 用到 ${rel.codes} 个节点（树共 ${treeTot.n} → 利用率 ${pct(Number(rel.codes) / Number(treeTot.n))}）`);
  for (const b of byLevel) console.log(`     ${String(b.level).padEnd(10)} 行 ${String(b.rows_n).padStart(6)} · 去重供应商 ${b.sups}`);
  console.log(`   叶子层（小类+自研）占比 ${pct(leafShare)}（目标 ≥ ${pct(TARGETS.minLeafShare)}）`);
  console.log(`\n3) 集中度：TOP1 ${top[0]?.name_zh ?? "—"} ${top[0]?.sups ?? 0} 家 = ${pct(top1Share)}（目标 ≤ ${pct(TARGETS.maxTop1Share)}）；TOP10 累计 ${pct(top10Share)}`);
  console.log(`\n4) 门类偏度：${sectionsUsed}/20 个门类有挂靠（目标 ≥ ${TARGETS.minSectionsUsed}）；最大门类 ${sections[0]?.name_zh ?? "—"} 占 ${pct(maxSectionShare)}`);
  console.log(`   ${sections.slice(0, 6).map((s) => `${s.name_zh}:${s.sups}`).join("  ")}`);
  console.log(`\n5) 新兴产业：${extUsed}/${selfTot} 个自研节点有直接挂靠（目标 ≥ ${TARGETS.minExtensionUsed}）`);
  console.log(`   ${ext.slice(0, 6).map((x) => `${x.name_zh}:${x.direct}`).join("  ")}`);
  console.log(`\n6) 每供应商码数：1 个 ${perSup.one_code} / 2-3 个 ${perSup.two_three} / >3 个 ${perSup.over_three}（最多 ${perSup.max_n}，均值 ${perSup.avg_n}）`);
  console.log(`\n7) 主码自洽：有主码 ${primaryInRel.coded} 家，其中主码已入挂靠表 ${primaryInRel.in_rel} 家 = ${pct(inRelShare)}（底线 ≥ ${pct(FLOORS.minPrimaryInRel)}）`);
  console.log(`\n8) 门户现用行业文本：distinct ${text.distinct_values} 种，空 ${text.empty_text} 家；已挂靠码与文本名可对齐 ${alignable.matched_by_name}/${alignable.done_with_text}`);
  console.log(`   高频文本：${topText.map((r) => `${r.v}(${r.n})`).join("  ")}`);

  const subclassRows = Number(byLevel.find((b) => b.level === "subclass")?.rows_n ?? 0);

  /* ── 判定：底线硬失败，目标线只报（--gate 时一并计入失败）── */
  const breaches: string[] = [];
  if (Number(rel.rows_all) < FLOORS.minRelRows) breaches.push(`挂靠行数 ${rel.rows_all} < 底线 ${FLOORS.minRelRows}`);
  if (sectionsUsed < FLOORS.minSectionsUsed) breaches.push(`有挂靠门类 ${sectionsUsed} < 底线 ${FLOORS.minSectionsUsed}`);
  if (portalCoverage < FLOORS.minPortalCoverage) breaches.push(`门户覆盖率 ${pct(portalCoverage)} < 底线 ${pct(FLOORS.minPortalCoverage)}`);
  if (inRelShare < FLOORS.minPrimaryInRel) breaches.push(`主码入挂靠表比例 ${pct(inRelShare)} < 底线 ${pct(FLOORS.minPrimaryInRel)}`);
  if (subclassRows < FLOORS.minSubclassRows) breaches.push(`小类层挂靠行 ${subclassRows} < 底线 ${FLOORS.minSubclassRows}（粒度已整体坍缩）`);

  const misses: string[] = [];
  if (portalCoverage < TARGETS.portalCoverage) misses.push(`覆盖率 ${pct(portalCoverage)} < ${pct(TARGETS.portalCoverage)}`);
  if (top1Share > TARGETS.maxTop1Share) misses.push(`TOP1 占比 ${pct(top1Share)} > ${pct(TARGETS.maxTop1Share)}`);
  if (sectionsUsed < TARGETS.minSectionsUsed) misses.push(`有挂靠门类 ${sectionsUsed} < ${TARGETS.minSectionsUsed}`);
  if (extUsed < TARGETS.minExtensionUsed) misses.push(`新兴节点有挂靠 ${extUsed} < ${TARGETS.minExtensionUsed}`);
  if (leafShare < TARGETS.minLeafShare) misses.push(`叶子层占比 ${pct(leafShare)} < ${pct(TARGETS.minLeafShare)}`);

  console.log(`\n──────── 门禁判定 ────────`);
  console.log(breaches.length
    ? `✗ 底线击穿 ${breaches.length} 项（链路被改坏，必须修）：\n  - ${breaches.join("\n  - ")}`
    : `✓ 底线 ${Object.keys(FLOORS).length} 项全部成立`);
  console.log(misses.length
    ? `· 目标线未达 ${misses.length} 项（后台补数口径，不阻断）：\n  - ${misses.join("\n  - ")}`
    : `✓ 目标线全部达标，可把 check:industry-links:strict 接进部署后校验`);

  const fail = breaches.length > 0 || (process.argv.includes("--gate") && misses.length > 0);
  await conn.end();
  if (process.argv.includes("--gate") || breaches.length) process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error("[industry-links] 异常:", err);
  process.exit(1);
});
