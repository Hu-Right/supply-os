/**
 * 行业树 × 供应商数据 双向补全闭环 · 纯函数（不连库，可单测）
 *
 * 职责边界：本文件只做**判定与算法**，SQL 与取数在两个壳里：
 *   scripts/gates/industry-loop-health.mjs  度量（四象限计数 + 闭环健康度）
 *   scripts/gates/industry-gap-mine.mjs     挖掘（候选清单 + 接线清单）
 * 口径依据：docs/adr/0005-industry-tree-supplier-loop.md、
 *          docs/superpowers/specs/2026-10-10-industry-tree-supplier-loop-design.md
 *
 * 四象限（缺口的四种性质，判据必须可复算）：
 *   Q1a 子层空转  粗码承载够多、子层零挂靠，但**子层名已能解释**这批供应商 → 接线，不造码
 *   Q1b 粗叶堆肉  同上前提而子名解释不了 → 真·树太粗，出下切候选
 *   Q2  无处安放  有业务证据文本却解不到树上任何官方名 → 出新增维度候选
 *   Q3  钩子死挂  自研节点零挂靠但证据文本里搜得到它的关键词 → 接线，不造码
 *   Q4  目录无主体 国标子树零供应商且无文本证据 → 登记保留，永不自动生成候选
 */

/** 阈值与取数口径（单一事实源，壳脚本不得自带另一套数字） */
export const TH = {
  q1MinDirect: 200, // 粗码直接挂靠下限：低于此属正常业务集中，不为它动树
  q1DerivableShare: 0.5, // 子名可解释比例 ≥ 此值 → 判 Q1a（边界归 Q1a，宁可少造码）
  q3MinEvidenceSuppliers: 50, // 自研节点证据命中下限：低于此视为本目录确实无此主体
  maxAttrGramFreqShare: 0.05, // 归因字块的语料频率上限：实测「医疗」13%、「器械」12.5%、「产品」27% 这类词毫无区分度
  minEvidenceChars: 8, // 证据文本最短长度：再短不足以判业态
  minCandidateSuppliers: 3, // 每条候选至少几家供应商背书（样本下限）
  candidateMinSuppliers: 20, // 进候选清单的词簇门槛：低于此属长尾，人工勾选成本远高于收益
  maxSamples: 5, // 每条候选附几条样本公司，供人工核名实
  maxTailSlots: 99, // 父节点下可用尾码上限（与 runtime/add-industry-nodes.mjs 同规则）
  scopeTruncateChars: 1000, // 经营范围取前 1000 字（罗列为主，核心业态词都在前段）
  gramWindowChars: 200, // 词频统计只看证据文本前 200 字（控成本）
  gramMinLen: 2,
  gramMaxLen: 5, // 到 5 字：一是候选名要足够具体，二是 4 字串才能被「长一级同支撑」规则剪成碎片
  mineTopN: 80, // 每池最多候选数（与品目侧 mine 同口径）
  fetchChunkSize: 5000, // 分块拉取，避免一次性把 40MB 文本灌进内存
};

/** 拉丁字母折叠成大写：词表里的 SaaS 与经营范围里的 saas 必须能对上 */
const fold = (s) => String(s).replace(/[a-z]/g, (c) => c.toUpperCase());

/** 经营范围里的登记模板句：不是业态词，进了词频就是噪音 */
const BOILERPLATE = [
  /一般项目[：:]/g,
  /许可项目[：:]/g,
  /[（(][^（）()]*依法须经批准[^（）()]*[)）]/g,
  /依法须经批准的项目[，,]?/g,
  /经相关部门批准后方可开展经营活动[。.]?/g,
  /经相关部门批准后方可.{0,12}(经营|活动)[。.]?/g,
  /法律、行政法规、国务院决定[^\n]{0,40}/g,
  /（[^（）()]{0,20}(登记|许可|备案)[^（）()]{0,20}）/g,
];

/**
 * 分词分隔符：顿号/逗号/分号/斜杠/括号/冒号/句点/破折号/空白，外加连词「以及·和·及·与·或」。
 * 连词也当分隔：国标名里的「电气机械和器材制造业」只有拆出「电气机械」才是能命中经营范围的词，
 * 整串当词则永远匹不上。拆细只会让 Q2（无处安放）变少——宁可少造码，不可漏接已有码。
 */
const SPLIT_RE = /[、，,；;/／（）()［］【】·．.：:\s\-—]+|以及|和|及|与|或/g;

/** 归一化证据文本：剥模板句、压空白。大小写交给 fold()，此处不改 */
export function normalizeEvidence(text) {
  let out = String(text ?? "");
  for (const re of BOILERPLATE) out = out.replace(re, "");
  return out.replace(/\s+/g, " ").trim();
}

/** 官方名分词（强词表）：按分隔符/连词切，丢长度 <2 的段 */
export function tokenizeName(nameZh) {
  return String(nameZh ?? "")
    .split(SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

/**
 * 释义分词（弱词表）：只取「包括/涵盖」之后、「不包括」之前的枚举项。
 * 没有枚举标记的释义不参与词表——自研节点的「自研增设：国标哪里不够用」是理由，不是类目词。
 */
export function tokenizeDescription(desc) {
  const raw = String(desc ?? "");
  const m = raw.match(/(?:包括|涵盖)/);
  if (!m) return [];
  let tail = raw.slice(m.index + m[0].length);
  const stop = tail.search(/不包括|不含|不适用/);
  if (stop >= 0) tail = tail.slice(0, stop);
  return tail
    .split(SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 16);
}

/** 朴素全扫：给自动机做等价性对照的基准（测试用，生产路径不走它） */
export function naiveScan(text, tokens) {
  const hay = fold(String(text ?? ""));
  const hits = new Set();
  for (const t of tokens) if (hay.includes(fold(t))) hits.add(t);
  return hits;
}

/**
 * Aho-Corasick 多模式匹配：全目录 4 万文本 × 约 2 万词表，
 * 朴素做法是 8 亿次 indexOf，跑不动；AC 把成本压到「文本总长」。
 * scan 返回命中的**原始 token** 集合（大小写已折叠，词表与文本同一口径）。
 */
export function createMatcher(entries) {
  const root = { next: new Map(), fail: null, out: null };
  const seen = new Set();
  for (const e of entries) {
    const token = e.token;
    if (!token) continue;
    const key = `${fold(token)}\u0000${e.code ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let node = root;
    for (const ch of fold(token)) {
      let nxt = node.next.get(ch);
      if (!nxt) {
        nxt = { next: new Map(), fail: null, out: null };
        node.next.set(ch, nxt);
      }
      node = nxt;
    }
    (node.out ??= []).push({ token, code: e.code });
  }
  // BFS 建 fail 链，并沿链合并输出（同层的 fail 必先于本层完成）
  const queue = [];
  for (const child of root.next.values()) {
    child.fail = root;
    queue.push(child);
  }
  while (queue.length) {
    const cur = queue.shift();
    for (const [ch, nxt] of cur.next) {
      let f = cur.fail;
      while (f && !f.next.has(ch)) f = f.fail;
      nxt.fail = f ? f.next.get(ch) : root;
      if (nxt.fail === nxt) nxt.fail = root;
      const inherited = nxt.fail.out;
      if (inherited) nxt.out = [...(nxt.out ?? []), ...inherited];
      queue.push(nxt);
    }
  }
  return {
    tokenCount: seen.size,
    /** 命中 token → 该 token 属于哪些节点码（同名分词可来自多个节点，全部保留） */
    scanDetail(text) {
      const byToken = new Map();
      let state = root;
      for (const ch of fold(String(text ?? ""))) {
        while (state !== root && !state.next.has(ch)) state = state.fail;
        if (state.next.has(ch)) state = state.next.get(ch);
        if (!state.out) continue;
        for (const o of state.out) {
          let hit = byToken.get(o.token);
          if (!hit) {
            hit = { token: o.token, codes: [] };
            byToken.set(o.token, hit);
          }
          if (o.code && !hit.codes.includes(o.code)) hit.codes.push(o.code);
        }
      }
      return byToken;
    },
    scan(text) {
      return new Set(this.scanDetail(text).keys());
    },
  };
}

/** 树索引：名（强）/ 释义（弱）两套词表 + 父子邻接，供四象限判定共用 */
export function buildTreeIndex(nodes) {
  const byCode = new Map();
  const childrenByParent = new Map();
  const nameEntries = [];
  const descEntries = [];
  const nameTokensByCode = new Map();
  const allTokens = new Set();
  for (const n of nodes) {
    byCode.set(n.code, n);
    if (n.parent_code) {
      if (!childrenByParent.has(n.parent_code)) childrenByParent.set(n.parent_code, []);
      childrenByParent.get(n.parent_code).push(n);
    }
    const nt = tokenizeName(n.name_zh);
    nameTokensByCode.set(n.code, nt);
    for (const t of nt) {
      nameEntries.push({ token: t, code: n.code });
      allTokens.add(t);
    }
    for (const t of tokenizeDescription(n.description)) {
      descEntries.push({ token: t, code: n.code });
      allTokens.add(t);
    }
  }
  return {
    total: nodes.length,
    byCode,
    childrenByParent,
    nameTokensByCode,
    allTokens: [...allTokens],
    name: createMatcher(nameEntries),
    desc: createMatcher(descEntries),
  };
}

/**
 * 「已被树上表达」的片段集（gramMinLen~gramMaxLen，实测 2~5 字共 22,988 条）：候选词撞上它，说明这个业态已有类目，**不得再造码**。
 * 口径：全树名分词 + 释义分词的**全部连续子串**（双向包含关系的 O(1) 近似版）。
 * 实测效果：「照明/光伏」会被覆盖（已有中类与 X72），「储能/无人机」这类才漏得下来。
 */
export function buildCoveredGrams(idx, { minLen = TH.gramMinLen, maxLen = TH.gramMaxLen } = {}) {
  const set = new Set();
  for (const token of idx.allTokens) {
    const f = fold(token);
    for (let len = minLen; len <= maxLen; len++) {
      for (let i = 0; i + len <= f.length; i++) {
        const g = f.slice(i, i + len);
        if (!/^[0-9]+$/.test(g)) set.add(g);
      }
    }
  }
  return set;
}

/** 候选词是否已被现有类目表达：先看覆盖片段，再看候选词里是否含完整官方名分词 */
export function explainTerm(term, { covered, nameMatcher }) {
  const f = fold(String(term ?? ""));
  if (!f) return { explained: true, via: "empty" };
  if (covered.has(f)) return { explained: true, via: "covered-gram" };
  if (nameMatcher && nameMatcher.scan(f).size > 0) return { explained: true, via: "contains-name-token" };
  return { explained: false, via: null };
}

/**
 * 「节点名核心字块」索引：全名分词 + 其 2~maxGramLen 字连续子串，按归属节点数筛掉过泛字块。
 * 为什么需要：自研节点名普遍是长串（「第三方检验检测认证TIC」），只用整串当词，
 * 经营范围里写「检测」的 1,062 家永远命中不了 → Q3 会把真有新兴产业主体误判成「本目录无此主体」。
 * `maxOwnerNodes` 是精度门，取值由 2026-10-10 实测定：自研节点名的 2 字核心词本来就很特异
 * （检测 3 个节点、储能 3、光伏 2、冷链 1），而 `机械` 47、`设备` 154、`制造` 662 会把整个分支都带火，
 * 卡在 20 刚好把两类分开（电子 29 / 仪器 26 这类靠它们更长、更特异的名分词仍能命中）。
 * 拉丁串只取**整个缩写**，不取子串：实测「FinTech/RegTech」拆出的 IN/ES/TE/CH 会在英文品名里
 * 到处命中（单字块最高打到 44% 的家数），语料频率门也挡不住这种碎片。
 */
export function buildNameGramIndex(nodes, { maxGramLen = TH.gramMaxLen, maxOwnerNodes = 20 } = {}) {
  const owners = new Map(); // gram → Set(code)（含被筛掉的，供诊断）
  const add = (gram, code) => {
    if (gram.length < 2 || /^[0-9]+$/.test(gram)) return;
    let s = owners.get(gram);
    if (!s) {
      s = new Set();
      owners.set(gram, s);
    }
    s.add(code);
  };
  for (const n of nodes) {
    for (const token of tokenizeName(n.name_zh)) {
      const f = fold(token);
      add(f, n.code); // 整串本身也是关键词（长名节点靠它保证精度）
      if (!/[\u4e00-\u9fa5]/.test(f)) continue; // 纯拉丁（缩写/型号）只留整串，不拆子串
      for (let len = 2; len <= Math.min(maxGramLen, f.length); len++) {
        for (let i = 0; i + len <= f.length; i++) add(f.slice(i, i + len), n.code);
      }
    }
  }
  const keptOwners = new Map();
  const entries = [];
  for (const [gram, codes] of owners) {
    if (codes.size > maxOwnerNodes) continue;
    keptOwners.set(gram, codes);
    for (const code of codes) entries.push({ token: gram, code });
  }
  return { matcher: createMatcher(entries), owners, keptOwners, gramCount: owners.size, keptGrams: keptOwners.size, entries };
}

/** 三态归类：官方名优先、释义只兜底（历史坑：「照明」因门类释义回成整个制造业） */
export function classifyEvidence(text, idx) {
  const nameHits = [...idx.name.scan(text)];
  if (nameHits.length) return { state: "by-name", nameHits: nameHits.sort(), descHits: [] };
  const descHits = [...idx.desc.scan(text)];
  if (descHits.length) return { state: "desc-only", nameHits: [], descHits: descHits.sort() };
  return { state: "unmatched", nameHits: [], descHits: [] };
}

/** 某节点的子孙名分词（Q1a/Q1b 分界用：子层已经能解释多少供应商） */
export function descendantNameTokens(idx, code, maxDepth = 2) {
  const tokens = [];
  const walk = (parent, depth) => {
    if (depth > maxDepth) return;
    for (const child of idx.childrenByParent.get(parent) ?? []) {
      tokens.push(...(idx.nameTokensByCode.get(child.code) ?? []));
      walk(child.code, depth + 1);
    }
  };
  walk(code, 1);
  return tokens;
}

/** Q1 前提：粗码够多且子层零挂靠（子层有挂靠说明已经下钻过，不重复处理） */
export function isQ1CoarseLeaf(directLinks, childLinksTotal) {
  return directLinks >= TH.q1MinDirect && childLinksTotal === 0;
}

/** Q1a / Q1b 分界：子名解释得动就接线，解释不动才造码 */
export function splitQ1ByDerivable(derivableShare) {
  return derivableShare >= TH.q1DerivableShare ? "Q1a" : "Q1b";
}

/** Q3：自研节点零挂靠但有文本证据 → 缺的是打标接线，不是节点 */
export function isQ3DeadNode(node, directLinks, evidenceSuppliers) {
  return node.source === "self" && directLinks === 0 && evidenceSuppliers >= TH.q3MinEvidenceSuppliers;
}

/** Q4：国标子树零供应商且无文本证据 → 目录里没有这类主体，保留权威覆盖，不算缺口 */
export function isQ4EmptyBranch(node, subtreeSuppliers, evidenceSuppliers) {
  return node.source === "gb" && subtreeSuppliers === 0 && evidenceSuppliers === 0;
}

/**
 * 子树挂靠合计（含自身），带记忆化。两个壳必须共用这一份，否则「空根数」会各算各的。
 * 先占位再累加：树不该有环，但被写坏时宁可少算也不能栈溢出。
 */
export function createSubtreeLinks(childrenByParent, directByCode) {
  const memo = new Map();
  const sub = (code) => {
    if (memo.has(code)) return memo.get(code);
    let sum = directByCode.get(code) ?? 0;
    memo.set(code, sum);
    for (const c of childrenByParent.get(code) ?? []) sum += sub(c.code);
    memo.set(code, sum);
    return sum;
  };
  return sub;
}

/**
 * 国标节点里「整片子树零挂靠」的**最上层空根**：父也空则由父代表，避免一个空大类被拆成几个空中类重复计数。
 * 门类没有父，因此整片空掉的门类**必须**自己成为空根——2026-10-10 就是靠这条抓出两个壳口径差 1 的漏计。
 */
export function findMaximalEmptyRoots(nodes, idx, directByCode, sub = createSubtreeLinks(idx.childrenByParent, directByCode)) {
  const roots = [];
  for (const n of nodes) {
    if (n.source !== "gb" || sub(n.code) !== 0) continue;
    const parent = n.parent_code ? idx.byCode.get(n.parent_code) : null;
    if (parent && sub(parent.code) === 0) continue; // 父整片也空 → 由父代表
    roots.push(n);
  }
  return { roots, sub };
}

/** 自研延伸层只能挂在 group/subclass 下（镜像门禁 I5/I6） */
export function canHangExtension(parentLevel) {
  return parentLevel === "group" || parentLevel === "subclass";
}

/** 父节点下还能不能再加尾码（与造码脚本同规则，满 99 即止） */
export function tailSlotsFree(usedTails) {
  return usedTails < TH.maxTailSlots;
}

/** 候选名与父级同义/互为子串 → 违反「扩展节点避免冗余原则」，直接剔 */
export function isRedundantVsParent(term, parentTokens) {
  const t = fold(String(term ?? ""));
  if (!t) return true;
  return (parentTokens ?? []).some((pt) => {
    const p = fold(String(pt ?? ""));
    return p === t || p.includes(t) || t.includes(p);
  });
}

/** 同批候选互为子串 → 保留证据最强的一条，其余记为被吞并 */
export function absorbOverlaps(cands) {
  const sorted = [...cands].sort((a, b) => b.suppliers - a.suppliers);
  const kept = [];
  const absorbed = [];
  for (const c of sorted) {
    const hit = kept.find((k) => k.term.includes(c.term) || c.term.includes(k.term));
    if (hit) absorbed.push({ ...c, absorbedBy: hit.term });
    else kept.push(c);
  }
  return { kept, absorbed };
}

/**
 * 词簇原料：把证据文本按非「中日数字母」切成片段，取片段内连续子串，同篇去重。
 * 调用方对每个供应商的返回集合各 +1，得到「去重供应商数」而不是「词频」。
 * cjkOnly：纯拉丁片段一律丢弃——实测候选前 20 名全是 `CO / LTD / TD / LT` 这类公司后缀碎片，
 * 而 SaaS/AI 这类真业态词已由 Q3 通道（节点名分词直接命中）兜住，不靠 n-gram 捕。
 */
export function extractGrams(
  text,
  { stop = new Set(), minLen = TH.gramMinLen, maxLen = TH.gramMaxLen, window = TH.gramWindowChars, cjkOnly = true } = {},
) {
  const grams = new Set();
  const segs = fold(String(text ?? ""))
    .slice(0, window)
    .split(/[^0-9A-Z\u4e00-\u9fa5]+/);
  for (const seg of segs) {
    if (!seg) continue;
    for (let len = minLen; len <= maxLen; len++) {
      for (let i = 0; i + len <= seg.length; i++) {
        const g = seg.slice(i, i + len);
        if (/^[0-9]+$/.test(g)) continue; // 纯数字片段是型号噪音
        if (cjkOnly && !/[\u4e00-\u9fa5]/.test(g)) continue;
        if (stop.has(g)) continue;
        grams.add(g);
      }
    }
  }
  return grams;
}

/**
 * 碎片修剪：中文没有词边界，`家具` 会作为 `户外家具` 的子串混进候选。
 * 判据：若存在一个更长词串包含它、且支撑供应商数几乎相同（≥ growth 比例），
 * 那本词只是那个真词的碎片，丢掉（支撑数单调，只需看一步扩展）。
 */
export function pruneFragmentGrams(counts, { growth = 0.9, minSuppliers = TH.candidateMinSuppliers, covered = null, nameMatcher = null, reject = null } = {}) {
  /** 每个 gram 的「长一级的包含串」最大支撑数 */
  const superSupport = new Map();
  for (const [g, v] of counts) {
    if (g.length <= TH.gramMinLen) continue;
    const n = typeof v === "number" ? v : v.n;
    for (const sub of [g.slice(0, -1), g.slice(1)]) {
      if (n > (superSupport.get(sub) ?? 0)) superSupport.set(sub, n);
    }
  }
  const survivors = [];
  const dropped = { lowSupport: 0, fragment: 0, explained: 0, rejected: 0 };
  for (const [g, v] of counts) {
    const n = typeof v === "number" ? v : v.n;
    const uncoded = typeof v === "number" ? 0 : (v.uncoded ?? 0);
    if (reject && reject(g)) {
      dropped.rejected++;
      continue;
    }
    if (n < minSuppliers) {
      dropped.lowSupport++;
      continue;
    }
    if (superSupport.get(g) >= n * growth) {
      dropped.fragment++;
      continue;
    }
    if (covered && explainTerm(g, { covered, nameMatcher }).explained) {
      dropped.explained++;
      continue;
    }
    survivors.push({ term: g, suppliers: n, uncoded });
  }
  return { survivors, dropped };
}

/** 只读守卫：任何写语句直接抛错（连同连接层的 START TRANSACTION READ ONLY 一起兜底） */
const WRITE_SQL = /\b(INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|CREATE|TRUNCATE|RENAME|GRANT|REVOKE|CALL|HANDLER|KILL|SHUTDOWN|LOAD)\b/i;
export function assertReadOnlySql(sql) {
  const stripped = String(sql ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
  const m = stripped.match(WRITE_SQL);
  if (m) throw new Error(`只读守卫拦下写语句：${m[1]}（本轮闭环只允许 SELECT）`);
  return true;
}

/** 样本公司：候选必须带可点开的证据，人工才能判名实相符（无证据文本的 id 直接跳过） */
export function pickSamples(rows, max = TH.maxSamples) {
  const out = [];
  for (const r of rows ?? []) {
    if (out.length >= max) break;
    if (!r) continue;
    out.push({ id: Number(r.id), company: String(r.company ?? "").slice(0, 60) });
  }
  return out;
}

/** 百分比格式化（壳脚本共用，别各处各写一套 toFixed） */
export function pct(x, digits = 1) {
  return `${(Number(x) * 100).toFixed(digits)}%`;
}
