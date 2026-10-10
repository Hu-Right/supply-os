/**
 * 行业面 · 缺口挖掘（只读，绝不写库）
 *
 * 用法：
 *   npm run mine:industry-gap
 *   node scripts/gates/industry-gap-mine.mjs [--q2-min 20] [--top 80]
 *
 * 产出（`runtime/` 按仓规不入库）：
 *   runtime/industry-gap-candidates-YYYYMMDD.json   机器可读，交人工勾选后另存 approved 再进造码脚本
 *   runtime/industry-gap-candidates-YYYYMMDD.md     评审表（带勾选列）
 *
 * 四象限（判据见 lib/industry-loop.mjs 与 docs/adr/0005）：
 *   Q1a 子层空转 → 接线清单（往已有子码下钻，不造码）
 *   Q1b 粗叶堆肉 → 下切候选（造码）
 *   Q2  无处安放 → 新增维度候选（造码）
 *   Q3  钩子死挂 → 接线清单（词表接 X 码，不造码）
 *   Q4  目录无主体 → 保留登记（永不自动生成候选）
 *
 * 只读三层守卫：START TRANSACTION READ ONLY + 每条 SQL 过 assertReadOnlySql + 本文件无任何写库分支。
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import {
  TH,
  assertReadOnlySql,
  normalizeEvidence,
  buildTreeIndex,
  buildCoveredGrams,
  buildNameGramIndex,
  createMatcher,
  descendantNameTokens,
  isQ1CoarseLeaf,
  splitQ1ByDerivable,
  isQ3DeadNode,
  findMaximalEmptyRoots,
  canHangExtension,
  tailSlotsFree,
  isRedundantVsParent,
  absorbOverlaps,
  pruneFragmentGrams,
  extractGrams,
  pickSamples,
  pct,
} from "./lib/industry-loop.mjs";

/** 主体形式、登记用词与罗列虚词：不是行业维度，含这些字的词簇直接拒（子串判定，不是全等） */
const STOP_SUBSTR = [
  "有限", "公司", "集团", "合伙", "个体", "工贸", "实业", "贸易", "进出口", "代理", "批发", "零售", "销售",
  "依法", "备案", "注册", "许可", "经营", "范围", "项目", "成立", "于", "年", "月", "日",
  "所有", "产品", "主营", "位于", "本公", "我公", "第一", "第二", "一类", "二类", "三类", "上述", "其他", "以及",
];

if (!process.env.DB_HOST || !process.env.DB_NAME) {
  console.error("[gap-mine] 缺 DB_HOST / DB_NAME，拒绝跑（避免误连错误的库）");
  process.exit(1);
}
const DB_CFG = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME,
  charset: "utf8mb4",
};
const argNum = (flag, dft) => {
  const i = process.argv.indexOf(flag);
  return i > 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : dft;
};
const Q2_MIN = argNum("--q2-min", TH.candidateMinSuppliers);
const TOP_N = argNum("--top", TH.mineTopN);
const REVIEW_CAP = argNum("--cap", TOP_N * 2); // 带样本与交叉验证的评审上限；超出部分只给词+计数，不丢数据

let conn;
const q = async (sql, args) => {
  assertReadOnlySql(sql);
  return (await conn.query(sql, args))[0];
};

const num = (x) => Number(x ?? 0).toLocaleString("en-US");
const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const OUT_JSON = path.resolve("runtime", `industry-gap-candidates-${day}.json`);
const OUT_MD = path.resolve("runtime", `industry-gap-candidates-${day}.md`);

/** Map<key, Set> 取或建 */
const pushSet = (map, key, val) => {
  let s = map.get(key);
  if (!s) {
    s = new Set();
    map.set(key, s);
  }
  s.add(val);
  return s;
};
/** 词簇计数：同一供应商只算一次（extractGrams 每篇已去重），uncoded 记录「至今无主码」的那部分 */
const bump = (map, gram, isUncoded) => {
  const v = map.get(gram) ?? { n: 0, uncoded: 0 };
  v.n++;
  if (isUncoded) v.uncoded++;
  map.set(gram, v);
};

async function loadTree() {
  const nodes = await q(`SELECT code, src_code, level, source, name_zh, parent_code, description FROM crm_industry_nodes`);
  const links = await q(`SELECT industry_code, COUNT(*) direct_links FROM crm_supplier_industry_rel GROUP BY industry_code`);
  return { nodes, directByCode: new Map(links.map((r) => [r.industry_code, Number(r.direct_links)])) };
}

/** 分块拉证据文本：67k 行一次性灌进内存会到 40MB+，按 id 切片稳得多 */
async function loadDocs() {
  const docs = [];
  let lastId = 0;
  for (;;) {
    const rows = await q(
      `SELECT id, company, products, business_scope, industry_code
         FROM supplier
        WHERE id > ? AND (COALESCE(business_scope,'') <> '' OR COALESCE(products,'') <> '')
        ORDER BY id LIMIT ${Number(TH.fetchChunkSize)}`,
      [lastId],
    );
    if (!rows.length) break;
    for (const r of rows) {
      const text = normalizeEvidence(`${r.products ?? ""} ${String(r.business_scope ?? "").slice(0, TH.scopeTruncateChars)}`);
      if (text.length >= TH.minEvidenceChars) docs.push({ id: Number(r.id), company: r.company, code: r.industry_code || "", text, state: null });
    }
    lastId = Number(rows[rows.length - 1].id);
    if (rows.length < TH.fetchChunkSize) break;
  }
  return docs;
}

/**
 * 词簇 → 造码候选。四道闸（前四道在 lib 的纯函数里，可单测）：
 *   ① 拒主体/登记用词（子串）② 支撑数门槛 ③ 碎片修剪（更长串同支撑则本词是碎片）
 *   ④ 「已被类目表达」剔除（双向包含），最后互为子串吞并 + 与父同义 + 挂载合法性
 * 评审上限之外的 survivor 只计词与家数，保证「全面」不把长尾从报告里默默掉掉。
 */
function gramCandidates(counts, { parent, covered, idx, secondPassDocs, codesBySupplier }) {
  const { survivors, dropped } = pruneFragmentGrams(counts, {
    minSuppliers: Q2_MIN,
    covered,
    nameMatcher: idx.name,
    reject: (g) => STOP_SUBSTR.some((s) => g.includes(s)),
  });
  survivors.sort((a, b) => b.suppliers - a.suppliers);
  const { kept, absorbed } = absorbOverlaps(survivors);
  const parentTokens = parent ? [...(idx.nameTokensByCode.get(parent.code) ?? []), ...descendantNameTokens(idx, parent.code, 1)] : [];
  const usedTails = parent ? (idx.childrenByParent.get(parent.code) ?? []).length : 0;
  return {
    dropped,
    survivorCount: survivors.length,
    truncated: kept.length > REVIEW_CAP,
    absorbed: absorbed.map((a) => ({ term: a.term, absorbedBy: a.absorbedBy, suppliers: a.suppliers })),
    list: kept
      .slice(0, REVIEW_CAP)
      .map((c) => buildCandidate(c, { parent, parentTokens, usedTails, idx, secondPassDocs, codesBySupplier }))
      .filter(Boolean),
    tail: kept.slice(REVIEW_CAP).map((c) => ({ term: c.term, suppliers: c.suppliers, uncoded: c.uncoded, note: "超出评审上限，仅计数；需细看可抬高 --cap 重跑" })),
  };
}

/** 单条候选：补样本、用**已挂码分布**反验它是不是新维度、判挂载合法性、写可复算的 gapNote */
function buildCandidate(c, { parent, parentTokens, usedTails, idx, secondPassDocs, codesBySupplier }) {
  if (isRedundantVsParent(c.term, parentTokens)) return null;
  const hits = [];
  for (const d of secondPassDocs) {
    if (d.text.includes(c.term)) hits.push(d);
  }
  const samples = pickSamples(hits);
  if (samples.length < TH.minCandidateSuppliers) return null;

  /* 数据反验：这个词背书的供应商已经挂在哪些码上？集中在少数几个码 → 更像那些码的品目/材料侧面，不是新行业维度 */
  const attachCounts = new Map();
  for (const d of hits) {
    for (const code of codesBySupplier.get(d.id) ?? []) attachCounts.set(code, (attachCounts.get(code) ?? 0) + 1);
  }
  const topAttached = [...attachCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([code, n]) => ({ code, name: idx.byCode.get(code)?.name_zh ?? "", suppliers: n }));
  const codedShare = hits.length ? (hits.filter((d) => d.code).length / hits.length).toFixed(2) : "0.00";
  const facetShare = topAttached.length && hits.length ? topAttached[0].suppliers / hits.length : 0;
  const parentLevel = parent?.level ?? null;
  const legalParent = parent && canHangExtension(parentLevel) ? parent.code : null;
  return {
    pool: parent ? "Q1b" : "Q2",
    kind: "造码",
    term: c.term,
    suggestedParentCode: legalParent,
    parentLevel: parent ? parentLevel : null,
    nameZhSuggested: c.term,
    nameEnSuggested: "",
    nameStatus: "建议名由词簇直出，英文名待补（命名交人工/外部大模型，勾选后回填）",
    evidence: {
      suppliers: c.suppliers,
      ofWhichUncoded: c.uncoded,
      codedShare: Number(codedShare),
      codesDistinct: attachCounts.size,
      topAttached,
      fields: "products + business_scope(前 1000 字)",
      samples,
    },
    gapNote: parent
      ? `粗码「${parent.name_zh}」承载 ${parent.direct} 家且整片子孙零挂靠，现有子名仅能解释 ${pct(parent.share, 0)}；词簇「${c.term}」在其供应商证据里出现 ${c.suppliers} 家（其中 ${c.uncoded} 家至今无主行业码）`
      : `全树 ${idx.allTokens.length} 个名/释义分词均命不中这批文本；词簇「${c.term}」在 ${c.suppliers} 家供应商的证据里出现（其中 ${c.uncoded} 家无主行业码）`,
    risk: {
      redundantVsParent: false,
      overlapWithExisting: [...idx.name.scanDetail(c.term).keys()],
      parentTailSlotsUsed: usedTails,
      parentTailFull: parent ? !tailSlotsFree(usedTails) : false,
      parentNeedsHuman: parent && !canHangExtension(parentLevel) ? "父为门类/大类，自研延伸层不得直接挂其下（镜像 I5/I6），需先定位到具体中类" : null,
      facetHint:
        !parent && facetShare >= 0.4 && topAttached.length
          ? `这批供应商 ${pct(facetShare, 0)} 已集中在「${topAttached[0].name}」${topAttached[0].code}——先核它是否该归该码（或归品目面），别急着造新行业码`
          : null,
      taggingHint:
        !parent && Number(codedShare) <= 0.3
          ? `这批供应商 ${pct(1 - Number(codedShare), 0)} 至今无主行业码：属打标欠账，先补码再判是否真缺维度`
          : null,
    },
  };
}

async function main() {
  const t0 = Date.now();
  conn = await mysql.createConnection(DB_CFG);
  await q("START TRANSACTION READ ONLY");
  console.log(`[gap-mine] ${DB_CFG.host}:${DB_CFG.port}/${DB_CFG.database}（只读）· 造码候选门槛 ${Q2_MIN} 家 · 每池上限 ${TOP_N} 条`);

  const { nodes, directByCode } = await loadTree();
  const idx = buildTreeIndex(nodes);
  const covered = buildCoveredGrams(idx);
  const selfCodes = new Set(nodes.filter((n) => n.source === "self").map((n) => n.code));
  /** 空根与子树合计一次算完：Q4 用 roots，Q1 粗叶集用 subLinks */
  const { roots: gbEmptyRoots, sub: subLinks } = findMaximalEmptyRoots(nodes, idx, directByCode);
  const rootCodeSet = new Set(gbEmptyRoots.map((n) => n.code));
  /** 归因用的宽词表：名整串 + 核心字块（只用整串会把 X31「第三方检验检测认证TIC」这类长名节点漏成死节点） */
  const gramIdx = buildNameGramIndex(nodes);
  console.log(`  树 ${nodes.length} 节点 · 名分词 ${idx.allTokens.length} · 覆盖片段 ${covered.size} · 核心字块 ${gramIdx.gramCount}（保留 ${gramIdx.keptGrams} 条）· 国标空根 ${gbEmptyRoots.length}`);

  const docs = await loadDocs();
  const docsById = new Map(docs.map((d) => [d.id, d]));
  console.log(`  证据文本 ${num(docs.length)} 家`);

  /* ── 第一遍（每篇一次扫描）：三态归类 + Q2 词簇 + 归因字块的语料频率 ── */
  const selfEvidence = new Map();
  const rootMention = new Map();
  const q2Grams = new Map();
  const gramFreq = new Map([...gramIdx.keptOwners.keys()].map((g) => [g, 0])); // 字块→多少家文本提到它
  let byName = 0;
  let descOnly = 0;
  let unmatched = 0;
  for (const d of docs) {
    const nameDetail = idx.name.scanDetail(d.text);
    const isUncoded = !d.code;
    for (const g of gramIdx.matcher.scan(d.text)) gramFreq.set(g, (gramFreq.get(g) ?? 0) + 1);
    if (nameDetail.size > 0) {
      d.state = "by-name";
      byName++;
      continue;
    }
    if (idx.desc.scanDetail(d.text).size > 0) {
      d.state = "desc-only";
      descOnly++;
      continue;
    }
    d.state = "unmatched";
    unmatched++;
    for (const g of extractGrams(d.text)) bump(q2Grams, g, isUncoded);
  }
  console.log(`  三态归类：名命中 ${num(byName)} · 仅释义 ${num(descOnly)} · 全不命中 ${num(unmatched)}（Q2 原料池）`);

  /* ── 归因词表第二道语料门：字块在树上不泛（lib 已卡）+ 在文本里也不泛（这里卡）── */
  const dfCap = docs.length * TH.maxAttrGramFreqShare;
  const attrEntries = [];
  let droppedByFreq = 0;
  for (const [gram, codes] of gramIdx.keptOwners) {
    const n = gramFreq.get(gram) ?? 0;
    if (n < TH.q3MinEvidenceSuppliers || n > dfCap) {
      droppedByFreq++;
      continue;
    }
    for (const code of codes) attrEntries.push({ token: gram, code });
  }
  const attrMatcher = createMatcher(attrEntries);
  console.log(`  归因字块：保留 ${attrEntries.length} 条（语料频率门剔除 ${droppedByFreq} 个字块，上限 ${pct(TH.maxAttrGramFreqShare, 0)} 文本）`);

  /* 死钩子/空根归因走宽词表，三态归类走严词表（整串名）——前者要高召回，后者要高精度 */
  for (const d of docs) {
    for (const [, hit] of attrMatcher.scanDetail(d.text)) {
      for (const code of hit.codes) {
        if (selfCodes.has(code)) pushSet(selfEvidence, code, d.id);
        if (rootCodeSet.has(code)) pushSet(rootMention, code, d.id);
      }
    }
  }

  const attachBacklog = [];
  const q4Reserved = [];
  /** 接线可释放的**去重**供应商（一个供应商可能命中多个死码，不能按命中次数相加） */
  const attachUnion = new Set();

  /* ── Q3：自研节点零挂靠但有文本证据 → 接线，不造码 ── */
  let selfUnverified = 0;
  for (const n of nodes) {
    if (n.source !== "self") continue;
    const direct = directByCode.get(n.code) ?? 0;
    const ids = selfEvidence.get(n.code) ?? new Set();
    if (!isQ3DeadNode(n, direct, ids.size)) {
      if (direct === 0) selfUnverified++; // 既没挂靠又凑不出 50 家证据：不静默丢弃，单独计数
      continue;
    }
    const uncoded = [...ids].filter((id) => !docsById.get(id)?.code).length;
    for (const id of ids) attachUnion.add(id);
    attachBacklog.push({
      pool: "Q3",
      kind: "接线",
      nodeSource: "self",
      code: n.code,
      name: n.name_zh,
      level: n.level,
      directLinks: direct,
      evidenceSuppliers: ids.size,
      ofWhichUncoded: uncoded,
      suggestedKw: idx.nameTokensByCode.get(n.code) ?? [],
      samples: pickSamples([...ids].slice(0, TH.maxSamples).map((id) => docsById.get(id))),
      gapNote: `自研延伸层「${n.name_zh}」直接挂靠 ${direct}，但证据文本命中 ${ids.size} 家（其中 ${uncoded} 家至今无主行业码）→ 缺的是打标词表接上这个 X 码，不是再造节点`,
    });
  }

  /* ── Q4：空根被文本提及的属「接线机会」，没提及的才是「目录无此主体」 ── */
  for (const n of gbEmptyRoots) {
    const ids = rootMention.get(n.code) ?? new Set();
    if (ids.size >= TH.q3MinEvidenceSuppliers) {
      for (const id of ids) attachUnion.add(id);
      attachBacklog.push({
        pool: "Q3",
        kind: "接线",
        nodeSource: "gb",
        code: n.code,
        name: n.name_zh,
        level: n.level,
        directLinks: 0,
        evidenceSuppliers: ids.size,
        ofWhichUncoded: [...ids].filter((id) => !docsById.get(id)?.code).length,
        suggestedKw: idx.nameTokensByCode.get(n.code) ?? [],
        samples: pickSamples([...ids].slice(0, TH.maxSamples).map((id) => docsById.get(id))),
        gapNote: `国标分支「${n.name_zh}」整片零挂靠，但文本命中 ${ids.size} 家 → 属打标未接已有码，不算树缺维度`,
      });
    } else {
      q4Reserved.push({ code: n.code, name: n.name_zh, level: n.level, mentionSuppliers: ids.size, decision: "保留权威覆盖（本目录无此主体，不生成候选）" });
    }
  }

  /* ── Q1：粗叶集 → Q1a 下钻清单 / Q1b 下切候选 ── */
  const relRows = await q(`SELECT supplier_id, industry_code FROM crm_supplier_industry_rel`);
  const suppliersByCode = new Map();
  const codesBySupplier = new Map(); // 反向索引：用「这批人已挂在哪」反验候选是不是新维度
  for (const r of relRows) {
    pushSet(suppliersByCode, r.industry_code, Number(r.supplier_id));
    pushSet(codesBySupplier, Number(r.supplier_id), r.industry_code);
  }

  const coarse = nodes.filter((n) => {
    const kidsSum = (idx.childrenByParent.get(n.code) ?? []).reduce((a, c) => a + subLinks(c.code), 0);
    return isQ1CoarseLeaf(directByCode.get(n.code) ?? 0, kidsSum);
  });
  console.log(`  Q1 粗叶集 ${coarse.length} 个，逐个判 Q1a / Q1b`);

  const candidates = [];
  const tails = [];
  for (const n of coarse) {
    const docsOf = [...(suppliersByCode.get(n.code) ?? [])].map((id) => docsById.get(id)).filter(Boolean);
    if (!docsOf.length) continue;
    const descNodes = (idx.childrenByParent.get(n.code) ?? []).flatMap((c) => [c, ...(idx.childrenByParent.get(c.code) ?? [])]);
    const descCodes = new Set(descNodes.map((d) => d.code));
    let derivable = 0;
    const childHits = new Map();
    for (const d of docsOf) {
      let hit = false;
      for (const [, info] of idx.name.scanDetail(d.text)) {
        for (const code of info.codes) {
          if (!descCodes.has(code)) continue;
          hit = true;
          pushSet(childHits, code, d.id);
        }
      }
      if (hit) derivable++;
    }
    const share = derivable / docsOf.length;
    if (splitQ1ByDerivable(share) === "Q1a") {
      for (const set of childHits.values()) for (const id of set) attachUnion.add(id);
      attachBacklog.push({
        pool: "Q1a",
        kind: "接线",
        code: n.code,
        name: n.name_zh,
        level: n.level,
        directLinks: directByCode.get(n.code) ?? 0,
        derivableShare: Number(share.toFixed(3)),
        drillInto: [...childHits.entries()]
          .sort((a, b) => b[1].size - a[1].size)
          .slice(0, 12)
          .map(([code, set]) => ({
            childCode: code,
            childName: idx.byCode.get(code)?.name_zh ?? "",
            hitSuppliers: set.size,
            samples: pickSamples([...set].slice(0, TH.maxSamples).map((id) => docsById.get(id))),
          })),
        gapNote: `粗码「${n.name_zh}」承载 ${directByCode.get(n.code)} 家且子孙零挂靠，但其现有子码名分词已能解释 ${pct(share, 0)} → 属打标没下钻，往下列子码挂即可，不需要造新节点`,
      });
      continue;
    }
    const grams = new Map();
    for (const d of docsOf) for (const g of extractGrams(d.text)) bump(grams, g, !d.code);
    const { list, absorbed, dropped, survivorCount, truncated, tail } = gramCandidates(grams, {
      parent: { code: n.code, name_zh: n.name_zh, level: n.level, direct: directByCode.get(n.code) ?? 0, share },
      covered,
      idx,
      secondPassDocs: docsOf,
      codesBySupplier,
    });
    candidates.push(...list);
    if (tail.length) tails.push({ pool: "Q1b", parent: n.code, parentName: n.name_zh, tail });
    console.log(
      `    Q1b ${n.code} ${n.name_zh}（${directByCode.get(n.code)} 家 · 子名命中 ${pct(share, 0)}）→ 评审 ${list.length}/${survivorCount} 条${truncated ? `（超 ${REVIEW_CAP} 的部分进 tail）` : ""}（碎片 ${dropped.fragment} · 已表达 ${dropped.explained} · 拒词 ${dropped.rejected} · 吞并 ${absorbed.length}）`,
    );
  }

  /* ── Q2：无处安放的词簇 → 新增维度候选 ── */
  const unmatchedDocs = docs.filter((d) => d.state === "unmatched");
  const { list: q2List, absorbed: q2Absorbed, dropped: q2Dropped, survivorCount: q2Survivors, truncated: q2Truncated, tail: q2Tail } = gramCandidates(q2Grams, {
    parent: null,
    covered,
    idx,
    secondPassDocs: unmatchedDocs,
    codesBySupplier,
  });
  candidates.push(...q2List);
  if (q2Tail.length) tails.push({ pool: "Q2", parent: null, tail: q2Tail });
  console.log(
    `  Q2 评审 ${q2List.length}/${q2Survivors} 条${q2Truncated ? `（超 ${REVIEW_CAP} 的部分进 tail，抬高 --cap 可细看）` : ""}（碎片 ${q2Dropped.fragment} · 已表达 ${q2Dropped.explained} · 拒词 ${q2Dropped.rejected} · 吞并 ${q2Absorbed.length}）`,
  );

  /* ── 落盘（只写本地文件，库一个字节都不动） ── */
  const summary = {
    Q1a: attachBacklog.filter((x) => x.pool === "Q1a").length,
    Q1b: candidates.filter((c) => c.pool === "Q1b").length,
    Q2: candidates.filter((c) => c.pool === "Q2").length,
    Q3: attachBacklog.filter((x) => x.pool === "Q3").length,
    Q3Self: attachBacklog.filter((x) => x.nodeSource === "self").length,
    selfUnverified,
    Q3Gb: attachBacklog.filter((x) => x.nodeSource === "gb").length,
    Q4: q4Reserved.length,
    attachableSuppliers: attachUnion.size,
    tailTerms: tails.reduce((a, t) => a + t.tail.length, 0),
    reviewCap: REVIEW_CAP,
    states: { byName, descOnly, unmatched },
    attribution: {
      gramsBuilt: gramIdx.keptGrams,
      gramsKept: attrEntries.length,
      gramsDroppedByCorpusFreq: droppedByFreq,
      dfCapSuppliers: Math.round(dfCap),
    },
    thresholds: {
      q1MinDirect: TH.q1MinDirect,
      q1DerivableShare: TH.q1DerivableShare,
      q3MinEvidenceSuppliers: TH.q3MinEvidenceSuppliers,
      candidateMinSuppliers: Q2_MIN,
      mineTopN: TOP_N,
    },
  };
  const payload = {
    generatedAt: new Date().toISOString(),
    source: `${DB_CFG.host}:${DB_CFG.port}/${DB_CFG.database}`,
    readOnly: true,
    note: "本文件只出候选与接线清单，不写库。勾选后另存 approved 版，再进造码/词表管线。",
    caveat: "Q2 的判据是「词簇无法用现有官方名/释义分词命中」，它同时包含两种情况：真的树缺维度、以及口语说法未对齐官方名（如不锈钢制品→结构性金属制品制造）。靠 facetHint（已集中在某码）与 taggingHint（多数无码）分流，最终由人工定夺。",
    summary,
    candidates,
    tails,
    attachBacklog,
    q4Reserved,
  };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2), "utf8");
  fs.writeFileSync(OUT_MD, renderMd(payload), "utf8");
  await conn.query("ROLLBACK");
  await conn.end();
  console.log(`\n✓ 造码候选 ${candidates.length} 条 · 接线 ${attachBacklog.length} 条 · Q4 保留 ${q4Reserved.length} 个分支`);
  console.log(`  → ${path.relative(process.cwd(), OUT_JSON)}\n  → ${path.relative(process.cwd(), OUT_MD)}\n  耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`★ 随后跑 npm run check:industry-loop，四象限会带出本轮文本口径并做底线判定`);
}

/** 人工评审表：勾选列 + 证据 + 风险，一次看全 */
function renderMd({ generatedAt, summary, candidates, tails, attachBacklog, q4Reserved }) {
  const L = [];
  L.push(`# 行业树 × 供应商数据 · 缺口候选（生成于 ${generatedAt}）`);
  L.push(`\n**只读产出，未写库。** 阈值：粗叶 ≥${summary.thresholds.q1MinDirect} 家 · 子名可解释 ≥${pct(summary.thresholds.q1DerivableShare, 0)} 判接线 · 节点证据 ≥${summary.thresholds.q3MinEvidenceSuppliers} 家判死钩子 · 造码候选 ≥${summary.thresholds.candidateMinSuppliers} 家。\n`);
  L.push(`| 象限 | 数量 | 性质 |`);
  L.push(`| --- | --- | --- |`);
  L.push(`| Q1a 子层空转 | ${summary.Q1a} 个粗码 | 接线（不造码） |`);
  L.push(`| Q1b 粗叶堆肉 | ${summary.Q1b} 条 | **造码**，需勾选 |`);
  L.push(`| Q2 无处安放 | ${summary.Q2} 条 | **造码**，需勾选 |`);
  L.push(`| Q3 钩子死挂 | ${summary.Q3} 个码（自研 ${summary.Q3Self} · 国标 ${summary.Q3Gb}） | 接线（不造码） |`);
  L.push(`| 自研证据不足 | ${summary.selfUnverified} 个自研码 | 既无挂靠又凑不出 ${summary.thresholds.q3MinEvidenceSuppliers} 家证据，不进任何清单 |`);
  L.push(`| Q4 目录无主体 | ${summary.Q4} 个分支 | 保留，不动 |`);
  L.push(`\n三态归类实测：名命中 ${num(summary.states.byName)} · 仅释义 ${num(summary.states.descOnly)} · 全不命中 ${num(summary.states.unmatched)}。\n`);

  L.push(`## 一、造码候选（勾选后才进造码脚本；英文名一律待补）\n`);
  L.push(`| ☑ | 池 | 建议名（词簇直出） | 父级 | 供应商数 | 其中无码 | 这批人已集中在 | 样本（点开核名实） | 反验 / 风险 |`);
  L.push(`| --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
  for (const c of candidates) {
    const parent = c.suggestedParentCode ? `${c.suggestedParentCode}（${c.parentLevel}）` : "需人工定位父级";
    const samples = (c.evidence.samples || []).map((s) => s.company).slice(0, 3).join("、");
    const top = (c.evidence.topAttached || []).slice(0, 2).map((t) => `${t.name} ${t.suppliers}家`).join("｜") || "无挂靠";
    const risk = [
      c.risk.facetHint ? "⚠ " + c.risk.facetHint : "",
      c.risk.taggingHint ? "◇ " + c.risk.taggingHint : "",
      c.risk.parentNeedsHuman ? "父级违规须人工定位" : "",
      c.risk.parentTailFull ? "父下尾码已满" : "",
      c.risk.overlapWithExisting.length ? `字面重叠：${c.risk.overlapWithExisting.slice(0, 3).join(" ")}` : "",
    ]
      .filter(Boolean)
      .join("；");
    L.push(`| ☐ | ${c.pool} | ${c.term} | ${parent} | ${c.evidence.suppliers} | ${c.evidence.ofWhichUncoded} | ${top} | ${samples} | ${risk || "—"} |`);
  }
  if (tails.length) {
    L.push(`\n### 超出评审上限的长尾（仅词与家数，完整数据在 JSON.tails）\n`);
    for (const t of tails) {
      const top = t.tail.slice(0, 12).map((x) => `${x.term}(${x.suppliers})`).join("、");
      L.push(`- ${t.pool}${t.parentName ? ` · ${t.parentName}` : ""}：${t.tail.length} 个词——${top}…`);
    }
  }

  L.push(`\n## 二、接线清单（不造码：交给打标词表/规则下钻）\n`);
  L.push(`| 池 | 码 | 名称 | 现挂靠 | 证据 | 建议关键词 / 下钻目标 |`);
  L.push(`| --- | --- | --- | --- | --- | --- |`);
  for (const a of attachBacklog) {
    const target =
      a.pool === "Q1a"
        ? (a.drillInto ?? []).slice(0, 5).map((d) => `${d.childName} ${d.childCode}（${d.hitSuppliers}家）`).join("、")
        : (a.suggestedKw ?? []).join("、");
    const ev = a.pool === "Q1a" ? `子名可解释 ${pct(a.derivableShare ?? 0, 0)}` : `${a.evidenceSuppliers} 家命中（${a.ofWhichUncoded} 家无码）`;
    L.push(`| ${a.pool} | ${a.code} | ${a.name} | ${a.directLinks ?? 0} | ${ev} | ${target} |`);
  }

  L.push(`\n## 三、Q4 保留分支（前 20 个示例，完整见 JSON）\n`);
  L.push(`| 码 | 名称 | 层级 | 文本提及 | 处置 |`);
  L.push(`| --- | --- | --- | --- | --- |`);
  for (const r of q4Reserved.slice(0, 20)) L.push(`| ${r.code} | ${r.name} | ${r.level} | ${r.mentionSuppliers} 家 | ${r.decision} |`);
  L.push(`\n> 反冗余：各池被拒原因计数（碎片/已表达/拒词/吞并）见 JSON 中每池的 dropped 与 absorbed；"这批人已集中在"列是用挂靠数据反验候选，占比高时优先怀疑它不是新行业维度。\n`);
  return L.join("\n");
}

main().catch((err) => {
  console.error("[gap-mine] 异常:", err);
  process.exit(1);
});
