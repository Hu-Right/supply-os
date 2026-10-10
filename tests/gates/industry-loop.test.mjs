/**
 * 行业树 × 供应商数据 双向补全闭环 · 纯函数单测（node --test）
 *
 * 只测 `scripts/gates/lib/industry-loop.mjs` 的判定逻辑，不连库。
 * 与 SUT 同侧同 Runner（scripts/gates/lib → tests/gates，node --test）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TH,
  normalizeEvidence,
  tokenizeName,
  tokenizeDescription,
  createMatcher,
  naiveScan,
  buildTreeIndex,
  buildCoveredGrams,
  buildNameGramIndex,
  explainTerm,
  classifyEvidence,
  isQ1CoarseLeaf,
  splitQ1ByDerivable,
  isQ3DeadNode,
  isQ4EmptyBranch,
  createSubtreeLinks,
  findMaximalEmptyRoots,
  canHangExtension,
  tailSlotsFree,
  isRedundantVsParent,
  absorbOverlaps,
  extractGrams,
  pruneFragmentGrams,
  assertReadOnlySql,
} from "../../scripts/gates/lib/industry-loop.mjs";

/* 一棵小树，覆盖「门类有粗释义 / 中类有精确名 / 自研死节点」三种角色 */
const NODES = [
  {
    code: "UGT-I-03",
    level: "section",
    source: "gb",
    name_zh: "制造业",
    parent_code: null,
    description: "本门类包括农副食品加工业、食品制造业、照明器具的制造、电气机械和器材制造",
  },
  {
    code: "UGT-I-0326",
    level: "division",
    source: "gb",
    name_zh: "电气机械和器材制造业",
    parent_code: "UGT-I-03",
    description: "",
  },
  {
    code: "UGT-I-032607",
    level: "group",
    source: "gb",
    name_zh: "照明器具制造",
    parent_code: "UGT-I-0326",
    description: "本类包括照明灯具、灯用电器附件的制造",
  },
  { code: "UGT-I-03260701", level: "subclass", source: "gb", name_zh: "电光源制造", parent_code: "UGT-I-032607", description: "" },
  { code: "UGT-I-1003", level: "division", source: "gb", name_zh: "保险业", parent_code: "UGT-I-10", description: "" },
  {
    code: "UGT-I-09030801",
    level: "extension",
    source: "self",
    name_zh: "云计算与SaaS服务",
    parent_code: "UGT-I-090308",
    description: "自研增设：国标 65xx 仅笼统归软件和信息技术服务",
  },
];

/* ── 1. 经营范围模板噪声剥离 ── */
test("1 模板噪声不参与后续匹配", () => {
  const raw = "一般项目：照明器具制造；（依法须经批准的项目，经相关部门批准后方可开展经营活动）";
  const out = normalizeEvidence(raw);
  assert.ok(!out.includes("一般项目"), "「一般项目：」必须剥掉");
  assert.ok(!out.includes("依法须经批准"), "括号模板句必须剥掉");
  assert.ok(out.includes("照明器具制造"), "业态词必须保留");
  // 模板不得成为候选词簇的原料
  const grams = extractGrams(out, { stop: new Set() });
  for (const g of grams) assert.ok(!g.includes("依法"), `模板残片进了词簇：${g}`);
});

/* ── 2. 命中优先级：官方名优先，释义只兜底 ── */
test("2 名分词命中时不得降级为仅释义命中", () => {
  const idx = buildTreeIndex(NODES);
  const r = classifyEvidence("专业照明器具制造与销售", idx);
  assert.equal(r.state, "by-name");
  assert.ok(r.nameHits.includes("照明器具制造"), "应命中中类官方名分词");
});

/* ── 3. 三态归类 ── */
test("3 三态归类各有其位", () => {
  const idx = buildTreeIndex(NODES);
  assert.equal(classifyEvidence("照明器具制造", idx).state, "by-name");
  // 「照明器具的制造」只在门类释义里出现，名分词解不到 → desc-only
  assert.equal(classifyEvidence("从事照明器具的制造相关业务", idx).state, "desc-only");
  assert.equal(classifyEvidence("提供企业标准体系与成果评价服务", idx).state, "unmatched");
});

/* ── 4. AC 与朴素全扫等价（含重叠/嵌套 token 陷阱） ── */
test("4 自动机与朴素 indexOf 全扫结果一致", () => {
  const tokens = ["照明", "照明器具", "明器", "器具制造", "云", "SaaS", "云计算"];
  const docs = [
    "照明器具制造与灯具",
    "云计算与SaaS平台服务",
    "明器器具制造",
    "没有任何命中的一段文字",
    "SaaS和云计算SaaS",
  ];
  const m = createMatcher(tokens.map((t) => ({ token: t, code: "X" })));
  for (const d of docs) {
    const ac = [...m.scan(d)].sort();
    const naive = [...naiveScan(d, tokens)].sort();
    assert.deepEqual(ac, naive, `文本「${d}」两种扫描结果不一致`);
  }
});

/* ── 5. Q1 前提边界 ── */
test("5 粗叶集只看直接挂靠与子层挂靠", () => {
  assert.equal(isQ1CoarseLeaf(TH.q1MinDirect, 0), true);
  assert.equal(isQ1CoarseLeaf(TH.q1MinDirect + 1, 0), true);
  assert.equal(isQ1CoarseLeaf(TH.q1MinDirect - 1, 0), false, "199 家不配动树");
  assert.equal(isQ1CoarseLeaf(TH.q1MinDirect, 1), false, "子层已有挂靠说明已下钻过");
});

/* ── 6. Q1a / Q1b 分界（本轮最关键的防呆） ── */
test("6 子名能解释绝大多数供应商时判为接线而非造码", () => {
  assert.equal(splitQ1ByDerivable(0.8), "Q1a");
  assert.equal(splitQ1ByDerivable(TH.q1DerivableShare), "Q1a", "边界归 Q1a，宁可少造码");
  assert.equal(splitQ1ByDerivable(0.3), "Q1b");
});

/* ── 7. Q3 死钩子判定 ── */
test("7 自研节点零挂靠但有证据时只出接线清单", () => {
  const self = NODES.find((n) => n.source === "self");
  const gb = NODES.find((n) => n.code === "UGT-I-032607");
  assert.equal(isQ3DeadNode(self, 0, TH.q3MinEvidenceSuppliers), true);
  assert.equal(isQ3DeadNode(self, 0, TH.q3MinEvidenceSuppliers - 1), false, "49 家视为本目录无此主体");
  assert.equal(isQ3DeadNode(self, 1, 500), false, "已有挂靠就不算死钩子");
  assert.equal(isQ3DeadNode(gb, 0, 500), false, "Q3 只针对自研延伸层");
});

/* ── 8. Q4 不误伤 ── */
test("8 国标空分支只登记保留，不生成候选", () => {
  const ins = NODES.find((n) => n.code === "UGT-I-1003");
  const self = NODES.find((n) => n.source === "self");
  assert.equal(isQ4EmptyBranch(ins, 0, 0), true);
  assert.equal(isQ4EmptyBranch(ins, 0, 60), false, "有文本证据就不是「目录无此主体」");
  assert.equal(isQ4EmptyBranch(ins, 5, 0), false, "子树有供应商不是空分支");
  assert.equal(isQ4EmptyBranch(self, 0, 0), false, "自研节点归 Q3 口径，不进 Q4");
});

/* ── 9. 反冗余剔除 ── */
test("9 与父级同义或互相包含的候选被剔除", () => {
  assert.equal(isRedundantVsParent("照明器具", ["照明器具制造"]), true, "被父名包含");
  assert.equal(isRedundantVsParent("照明器具制造", ["照明器具制造"]), true, "与父同名");
  assert.equal(isRedundantVsParent("体外诊断", ["医疗器械制造", "电光源制造"]), false);

  const { kept, absorbed } = absorbOverlaps([
    { term: "医疗仪器", suppliers: 100 },
    { term: "医疗仪器设备", suppliers: 60 },
    { term: "康复器械", suppliers: 40 },
  ]);
  assert.deepEqual(
    kept.map((k) => k.term).sort(),
    ["医疗仪器", "康复器械"],
  );
  assert.deepEqual(
    absorbed.map((a) => a.term),
    ["医疗仪器设备"],
    "互为子串时保留证据更强的一条",
  );
});

/* ── 10. 挂载合法性（镜像门禁 I5/I6 与尾码上限） ── */
test("10 延伸层父级与尾码有硬约束", () => {
  assert.equal(canHangExtension("group"), true);
  assert.equal(canHangExtension("subclass"), true);
  assert.equal(canHangExtension("division"), false, "自研层不得自造粗层父");
  assert.equal(canHangExtension("section"), false);
  assert.equal(tailSlotsFree(98), true);
  assert.equal(tailSlotsFree(99), false, "父下尾码 99 已满");
});

/* ── 11. 只读守卫 ── */
test("11 写语句一律抛错", () => {
  assert.equal(assertReadOnlySql("SELECT COUNT(*) FROM supplier"), true);
  assert.equal(assertReadOnlySql("WITH RECURSIVE t AS (SELECT 1) SELECT * FROM t"), true);
  assert.equal(assertReadOnlySql("SELECT created_at FROM supplier"), true, "列名含 create 字样不误伤");
  for (const bad of [
    "UPDATE supplier SET industry_code=NULL",
    "DELETE FROM crm_supplier_industry_rel",
    "INSERT INTO crm_industry_nodes VALUES (1)",
    "ALTER TABLE supplier ADD COLUMN x int",
    "RENAME TABLE a TO b",
    "SELECT 1; DROP TABLE supplier",
  ]) {
    assert.throws(() => assertReadOnlySql(bad), /只读/, `应拦下：${bad}`);
  }
});

/* ── 12. 分词本身 ── */
test("12 名分词与释义分词的边界", () => {
  assert.deepEqual(tokenizeName("计算机、通信和其他电子设备制造业"), ["计算机", "通信", "其他电子设备制造业"]);
  assert.deepEqual(tokenizeName("纺织业"), ["纺织业"]);
  assert.deepEqual(tokenizeName("a / 单字"), ["单字"], "长度 <2 的段丢弃");
  const d = tokenizeDescription("本类包括照明灯具、灯用电器附件的制造；不包括批发");
  assert.ok(d.includes("照明灯具"));
  assert.ok(!d.some((x) => x.includes("不包括")), "排除项不作词表");
});

/* ── 13. 已被类目表达的片段不得再造码 ── */
test("13 覆盖片段拦住已有业态的重复造码", () => {
  const idx = buildTreeIndex(NODES);
  const covered = buildCoveredGrams(idx);
  assert.ok(covered.has("照明"), "「照明」已在中类名里，不得再当新维度");
  assert.ok(covered.has("云计算"), "自研节点名里的词不得再造");
  assert.ok(!covered.has("储能"), "储能无官方名可表，应漏下来当候选");
});

/* ── 14. 两种「已被表达」方向都要拦住 ── */
test("14 explainTerm 同时拦子串方向与含完整名分词方向", () => {
  const idx = buildTreeIndex(NODES);
  const covered = buildCoveredGrams(idx);
  assert.deepEqual(explainTerm("照明器", { covered, nameMatcher: idx.name }), { explained: true, via: "covered-gram" });
  assert.deepEqual(explainTerm("保险业服务", { covered, nameMatcher: idx.name }), { explained: true, via: "contains-name-token" });
  assert.equal(explainTerm("储能", { covered, nameMatcher: idx.name }).explained, false);
  assert.equal(explainTerm("", { covered, nameMatcher: idx.name }).explained, true, "空词一律不算候选");
});

/* ── 15. 纯拉丁碎片不进候选（公司后缀 CO/LTD 不该被当成业态）── */
test("15 只留含中文的词簇，拉丁片段一律丢弃", () => {
  const grams = extractGrams("FOSHAN LOUNGA FURNITURE CO., LTD 户外家具");
  assert.ok(!grams.has("CO") && !grams.has("LTD") && !grams.has("FU"), `拉丁碎片漏进来：${[...grams].filter((g) => !/[\u4e00-\u9fa5]/.test(g)).join()}`);
  assert.ok(grams.has("户外家具") && grams.has("家具"));
  assert.ok([...extractGrams("生产 LED 灯具 1200 元", { cjkOnly: false })].includes("LED"), "关掉 cjkOnly 时应能拿到拉丁词");
});

/* ── 16. 碎片修剪：「家具」只是「户外家具」的碎片，不该单独成候选 ── */
test("16 同支撑的更长串存在时短词被剔", () => {
  const counts = new Map([
    ["家具", { n: 100, uncoded: 0 }],
    ["外家具", { n: 98, uncoded: 0 }],
    ["户外家", { n: 98, uncoded: 0 }],
    ["户外家具", { n: 98, uncoded: 0 }],
    ["客厅家具", { n: 40, uncoded: 20 }],
    ["厅家具", { n: 40, uncoded: 20 }],
    ["长尾词", { n: 5, uncoded: 0 }],
  ]);
  const { survivors, dropped } = pruneFragmentGrams(counts, { minSuppliers: 20 });
  const terms = survivors.map((s) => s.term);
  assert.ok(!terms.includes("家具"), "「家具」被更长串以98/100 同支撑判为碎片");
  assert.ok(!terms.includes("外家具") && !terms.includes("户外家"), "中间层碎片同样被剔，只留最长的真词");
  assert.ok(terms.includes("户外家具") && terms.includes("客厅家具"));
  assert.equal(dropped.lowSupport, 1, "长尾词不足 20 家");
});

/* ── 17. 主体/登记用词子串一律拒 ── */
test("17 reject 谓词拦住含公司后缀的词簇", () => {
  const counts = new Map([
    ["公司产", { n: 90, uncoded: 0 }],
    ["工作室", { n: 60, uncoded: 0 }],
    ["储能设", { n: 60, uncoded: 30 }],
  ]);
  const { survivors, dropped } = pruneFragmentGrams(counts, {
    minSuppliers: 20,
    reject: (g) => g.includes("公司"),
  });
  assert.deepEqual(survivors.map((s) => s.term).sort(), ["工作室", "储能设"].sort());
  assert.equal(dropped.rejected, 1);
});

/* ── 18. 名核心字块：长名节点靠子串才能被命中，但过泛字块必须拦住 ── */
test("18 宽词表能命中长名节点的子串，又能拦住泛词", () => {
  const wide = buildNameGramIndex(NODES); // 默认归属节点 ≤20 保留
  assert.ok(wide.matcher.scan("专业照明灯具制造").has("制造"), "「制造」在本样本里归属不多，应可用");
  assert.ok(!wide.matcher.scan("FINTECH PLATFORM").has("IN"), "拉丁缩写只取整串，IN/TE 这类子串不得成为关键词");
  assert.ok(wide.matcher.scan("FINTECH PLATFORM").has("SaaS") === false, "与节点名无关的拉丁串不该命中");
  const tight = buildNameGramIndex(NODES, { maxOwnerNodes: 1 }); // 只留独占字块
  assert.ok(tight.matcher.scan("专业照明器具制造").has("照明"), "「照明」只属一个节点，应保留");
  assert.ok(!tight.matcher.scan("专业照明灯具制造").has("制造"), "「制造」挂多个节点，过泛词必须被筛掉");
});

/* ── 19. 最上层空根：父也空才算重复，而没父的门类必须自己成根 ── */
test("19 空根口径：子树合计与最上层空根（含整片空掉的门类）", () => {
  const N = [
    { code: "A", level: "section", source: "gb", name_zh: "门类A", parent_code: null },
    { code: "A01", level: "division", source: "gb", name_zh: "大类A01", parent_code: "A" },
    { code: "A0101", level: "group", source: "gb", name_zh: "中类A0101", parent_code: "A01" },
    { code: "A0102", level: "group", source: "gb", name_zh: "中类A0102空", parent_code: "A01" },
    { code: "B", level: "section", source: "gb", name_zh: "门类B整片空", parent_code: null },
    { code: "B01", level: "division", source: "gb", name_zh: "大类B01空", parent_code: "B" },
    { code: "X01", level: "extension", source: "self", name_zh: "自研空节点", parent_code: "A0101" },
  ];
  const childrenByParent = new Map();
  const byCode = new Map();
  for (const n of N) {
    byCode.set(n.code, n);
    if (!n.parent_code) continue;
    if (!childrenByParent.has(n.parent_code)) childrenByParent.set(n.parent_code, []);
    childrenByParent.get(n.parent_code).push(n);
  }
  const direct = new Map([["A0101", 5]]);
  const sub = createSubtreeLinks(childrenByParent, direct);
  assert.equal(sub("A0101"), 5);
  assert.equal(sub("A01"), 5, "子树合计含子孙");
  assert.equal(sub("B"), 0);
  const { roots } = findMaximalEmptyRoots(N, { byCode, childrenByParent }, direct, sub);
  const codes = roots.map((r) => r.code).sort();
  assert.deepEqual(codes, ["A0102", "B"], "空中类自己成根；整片空的门类必须由它代表而不是被当作‘父已盖住’漏计；自研节点不算 Q4");
  assert.ok(!codes.includes("B01"), "B01 由父门类 B 代表，不重复计数");
});
