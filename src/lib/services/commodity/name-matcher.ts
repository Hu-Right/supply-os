/**
 * 骨架名 → 节点码 的规则匹配（纯函数，依赖叶子）— 打标瀑布第 1 层的唯一判据面
 * Backbone name matcher (pure, dependency leaf)
 *
 * @module lib/services/commodity/name-matcher
 * @description 品目打标的分层瀑布是「规则 by-name 先吃 → AI 兜语义 → 低置信交人工」。
 *              本模块只做**最保守的那一层**：公告文本里**整串出现**某个骨架节点名，
 *              才把那个节点当候选。它不猜、不分词、不用释义兜底。
 *
 *              为什么保守到"整串"：规则层的产物是直接落库的归属事实，错一条就是一条
 *              被邀请去错误标的的供应商。ADR-0005 给行业树定的同一条纪律是「归类用窄词表
 *              （名整串分词），保证 Q2 是保守下界，不因泛词乱命中而把真缺口说成已覆盖」——
 *              品目侧比行业侧更贵（行业偏好看错一片，撮合是发信出去），所以这里连"分词"
 *              都不做，只做整串包含。
 *
 *              为什么不复用 `smartInferCommodityNodes`（那条是 FULLTEXT 召回）：它的产出是
 *              「候选列表 + 分数」，给人点选；本模块的产出是「能不能自动落笔」的判定。
 *              FULLTEXT 的 rel 分数在 ngram 短词上不稳，拿它当自动落笔的判据就是把召回当精度。
 *              两边共用的是同一棵树（词表 SSOT 就是 `commodity_backbone` 本身），不是同一段代码。
 *
 * @limits 纯计算：不连库、不调任何 API。索引规模 8.3 万节点名；命中判定只看形制与整串包含。
 *         同名多码（实测有 3 码同名的节点）一律判歧义，不"取最深"糊过去。
 * @see scripts/tools/notice-attribution-rule-ceiling.ts（只读预演壳）
 * @see docs/adr/0005-industry-tree-supplier-loop.md（窄词表纪律的出处）
 */
import { backboneNodeLevel, chainOfNode } from "@/shared/constants/commodity-code";

/** 建树索引的最小行集：码 + 两名（zh/en） */
export type BackboneNameRow = { code: string; nameZh: string; nameEn: string };

/** 一次命中：码 + 命中的那个名（留作证据，落库时进 evidence_text） */
export type NameHit = { code: string; name: string; lang: "zh" | "en" };

/** 中文名整串下限：短于 4 字的名字（"支架""打包机"）命中即噪音 */
const MIN_ZH_NAME_CHARS = 4;
/** 英文名整串下限：短于 8 字符容易撞上缩写/型号串 */
const MIN_EN_NAME_CHARS = 8;
/** 英文首词下限：`of/and/system` 这类首词做倒排键没有区分度 */
const MIN_EN_FIRST_WORD_CHARS = 4;

/** 大小写折叠：只做拉丁字母，中文原样（与行业侧 fold 同口径） */
const fold = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

/** 拉丁词切分：索引侧与文本侧必须同一条正则，否则「Non-GMO …」这类带连字符的名建出的键与文本键对不上 */
const LATIN_TOKEN_RE = /[^a-z0-9']+/;

/** 词边界校验用：`air pump` 不能命中 `airpump` 或 `air pumps` 里的子串 */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type NameIndex = {
  /** 参与匹配的名字条数（zh+en，已按下限过滤） */
  size: number;
  /** 词表自身的节点数 */
  nodes: number;
  /**
   * 取候选码：先用倒排键（中文 3 字串 / 英文首词）粗筛，再回原文整串校验。
   * 返回去重后的码集；空集 = 这条文本里没有任何骨架名整串出现。
   */
  hitCodes(text: string): NameHit[];
};

/**
 * 构索引：一次载全树名，建两张倒排表 + 一张名字全串表。
 * 为什么不用朴素「8.3 万 × 每条文本」的 includes：那是百亿次比较，跑不动；
 * 倒排键把候选压到「文本里实际出现的 3 字串/首词」对应的少数名字，再逐条精确校验，
 * 结果与朴素全扫**完全一致**（校验仍在原文上做，倒排只负责少算）。
 */
export function buildNameIndex(rows: Iterable<BackboneNameRow>): NameIndex {
  /** 中文：名字前 3 字 → 该名字所属码 */
  const zhByKey = new Map<string, Set<number>>();
  /** 英文：首词（折叠）→ 名字 id 集 */
  const enByKey = new Map<string, Set<number>>();
  const names: Array<{ code: string; name: string; lang: "zh" | "en"; re: RegExp | null }> = [];

  const pushZh = (code: string, name: string) => {
    const n = name.trim();
    if (n.length < MIN_ZH_NAME_CHARS) return;
    const id = names.length;
    names.push({ code, name: n, lang: "zh", re: null });
    // 名字的每个 3 字串都做键：文本命中任一键即可达该名字（朴素全扫等价，不多不少）
    for (let i = 0; i + 3 <= n.length; i++) {
      const k = n.slice(i, i + 3);
      let set = zhByKey.get(k);
      if (!set) zhByKey.set(k, (set = new Set<number>()));
      set.add(id);
    }
  };
  const pushEn = (code: string, name: string) => {
    const n = name.trim();
    if (n.length < MIN_EN_NAME_CHARS) return;
    const folded = fold(n);
    // 键取「第一个足够长的拉丁词」，与文本侧同一套切分：名字首词是 `of/and` 或带连字符时
    // 直接 split(\s+) 会建出一个文本里永不出现在该位置的键，于是整条名字再也进不了候选。
    const firstTok = folded.split(LATIN_TOKEN_RE).find((w) => w.length >= MIN_EN_FIRST_WORD_CHARS) ?? "";
    if (!firstTok) return;
    const id = names.length;
    names.push({ code, name: n, lang: "en", re: new RegExp(`(?:^|[^a-z0-9'])${escapeRe(folded)}(?:[^a-z0-9']|$)`) });
    let set = enByKey.get(firstTok);
    if (!set) enByKey.set(firstTok, (set = new Set<number>()));
    set.add(id);
  };

  let nodes = 0;
  for (const r of rows) {
    if (backboneNodeLevel(r.code) <= 0) continue; // 脏码不进词表（不猜层级）
    nodes++;
    pushZh(r.code, r.nameZh);
    pushEn(r.code, r.nameEn);
  }

  return {
    size: names.length,
    nodes,
    hitCodes(text: string): NameHit[] {
      const raw = String(text ?? "");
      if (!raw.trim()) return [];
      const ids = new Set<number>();
      for (let i = 0; i + 3 <= raw.length; i++) {
        const set = zhByKey.get(raw.slice(i, i + 3));
        if (set) for (const id of set) ids.add(id);
      }
      for (const w of fold(raw).split(LATIN_TOKEN_RE)) {
        if (w.length < MIN_EN_FIRST_WORD_CHARS) continue;
        const set = enByKey.get(w);
        if (set) for (const id of set) ids.add(id);
      }
      const out: NameHit[] = [];
      const hay = ` ${fold(raw)} `; // 词边界校验用的折叠全文，一次算好（热路径不再逐候选折叠）
      for (const id of ids) {
        const e = names[id];
        // 回原文整串校验（中文直接 includes；英文用建索引时预编译的词边界正则）
        if (e.lang === "zh") {
          if (raw.includes(e.name)) out.push({ code: e.code, name: e.name, lang: "zh" });
        } else if (e.re && e.re.test(hay)) {
          out.push({ code: e.code, name: e.name, lang: "en" });
        }
      }
      return out.sort((a, b) => a.code.localeCompare(b.code) || a.lang.localeCompare(b.lang));
    },
  };
}

/** 规则层判定状态 */
export type RuleState =
  | "none" // 文本里没有任何骨架名整串出现
  | "single" // 命中的码全在一条祖先链上 ⇒ 取最深即可直落（无歧义）
  | "ambiguous-branch" // 命中分属不同分支（或同名多码）⇒ 交 AI/人工，规则层不得自动落笔
  | "too-coarse"; // 唯一链但最深只到 minLevel 之下 ⇒ 落了对撮合也没用，同交上层

export type RuleVerdict = {
  state: RuleState;
  /** 命中涉及的不同码数（歧义规模的度量） */
  distinctCodes: number;
  /** state=single 时的落点码与层级 */
  code?: string;
  level?: number;
  /** 证据：命中的名（同名多码时用于人工判读） */
  hits: NameHit[];
};

/**
 * 一组命中 → 能不能自动落笔。
 * 判据只有两条，都不猜：
 *   1) 码集去重后必须**共链**（最深码是其余码的后代 ⇒ 一条链上的多层命中不算歧义，
 *      「命中了『医疗、实验、测试设备』也命中了它下面的『实验室仪器』」正是应有结果）；
 *   2) 最深码层级 ≥ minLevel（与 AI 管道的 MIN_LEVEL 同一条下限，不另设一套）。
 */
export function judgeRuleHits(hits: Iterable<NameHit>, minLevel = 2): RuleVerdict {
  const all = [...hits];
  const codes = [...new Set(all.map((h) => h.code))];
  if (codes.length === 0) return { state: "none", distinctCodes: 0, hits: all };

  // 最深码：其它码都必须是它的祖先（chainOfNode 纯切片，父码=自身去末两级）
  let deepest = codes[0];
  for (const c of codes) if (c.length > deepest.length) deepest = c;
  const chain = new Set(chainOfNode(deepest));
  const offChain = codes.filter((c) => !chain.has(c));

  if (offChain.length) return { state: "ambiguous-branch", distinctCodes: codes.length, hits: all };

  const level = backboneNodeLevel(deepest);
  if (level < minLevel) return { state: "too-coarse", distinctCodes: codes.length, code: deepest, level, hits: all };
  return { state: "single", distinctCodes: codes.length, code: deepest, level, hits: all };
}
