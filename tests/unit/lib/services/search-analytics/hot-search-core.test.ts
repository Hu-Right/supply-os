/**
 * 真实热门搜索 — 纯逻辑口径单测
 *
 * 覆盖：检索词归一化（全角/空白/高级语法/PII/长度）、bot 判定、匿名访客哈希（日轮换）、
 * 热词聚合（访客封顶、门槛、命中率、排序、展示词）、整体模式判定。
 * 这些口径是首页「热门搜索」的唯一事实源，任一分支错误都会把测试词/刷榜词展示成全站热门。
 */
import { describe, it, expect } from "vitest";
import {
  HOT_SEARCH_DEFAULTS,
  beijingDayKey,
  computeHotTerms,
  decideHotMode,
  isBotUserAgent,
  isLikelyReferenceCode,
  normalizeSearchTerm,
  visitorHash,
  type HotSearchVisitorRow,
} from "../../../../../src/lib/services/search-analytics/hot-search-core";

describe("normalizeSearchTerm", () => {
  it("去首尾空白、压缩空白、统一小写", () => {
    expect(normalizeSearchTerm("  Solar   Panel ")).toBe("solar panel");
    expect(normalizeSearchTerm("ＰＶＣ　管材")).toBe("pvc 管材"); // 全角字母 + 全角空格
  });

  it("全角符号转半角，保留括号正文", () => {
    expect(normalizeSearchTerm("光伏（ＡＢＣ）组件")).toBe("光伏(abc)组件");
  });

  it("去掉高级语法符号：引号与前置 +/-（不拆词，保持用户原意）", () => {
    expect(normalizeSearchTerm('-光伏 "组件" +solar')).toBe("光伏 组件 solar");
  });

  it("PII 直接丢弃：邮箱 / 手机号 / 身份证号", () => {
    expect(normalizeSearchTerm("给我发 a.b@example.com")).toBeNull();
    expect(normalizeSearchTerm("联系 13812345678")).toBeNull();
    expect(normalizeSearchTerm("身份证 110101199001011234")).toBeNull();
  });

  it("空串 / 纯空白 / 纯符号 / 无文字数字 → null", () => {
    expect(normalizeSearchTerm(null)).toBeNull();
    expect(normalizeSearchTerm(undefined)).toBeNull();
    expect(normalizeSearchTerm("   ")).toBeNull();
    expect(normalizeSearchTerm("!!! --- ...")).toBeNull();
  });

  it("超长词按列宽（120）截断后再返回", () => {
    const long = "a".repeat(200);
    const out = normalizeSearchTerm(long);
    expect(out).toHaveLength(120);
  });
});

describe("isBotUserAgent", () => {
  it("真实浏览器 UA 不是 bot", () => {
    expect(
      isBotUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"),
    ).toBe(false);
  });

  it("常见脚本/爬虫 UA 与空 UA 视为 bot", () => {
    expect(isBotUserAgent("")).toBe(true);
    expect(isBotUserAgent(null)).toBe(true);
    expect(isBotUserAgent("python-requests/2.31.0")).toBe(true);
    expect(isBotUserAgent("curl/8.5.0")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBotUserAgent("HeadlessChrome/124.0")).toBe(true);
  });
});

describe("visitorHash", () => {
  const ua = "Mozilla/5.0 Chrome/124.0";
  it("同一输入（同一天同盐）哈希稳定，且为 64 位 hex（sha256）", () => {
    const day = new Date("2026-11-18T02:00:00Z");
    const a = visitorHash("1.2.3.4", ua, "salt-a", day);
    const b = visitorHash("1.2.3.4", ua, "salt-a", day);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("跨自然日（北京时间）轮换：同一访客次日得到不同哈希", () => {
    const d1 = new Date("2026-11-18T02:00:00Z"); // 北京 10:00
    const d2 = new Date("2026-11-19T02:00:00Z");
    expect(visitorHash("1.2.3.4", ua, "salt-a", d1)).not.toBe(visitorHash("1.2.3.4", ua, "salt-a", d2));
    expect(beijingDayKey(d1)).toBe("2026-11-18");
  });

  it("不同盐 / 不同 IP / 不同 UA 不能互相撞哈希", () => {
    const day = new Date("2026-11-18T02:00:00Z");
    const base = visitorHash("1.2.3.4", ua, "salt-a", day);
    expect(visitorHash("1.2.3.4", ua, "salt-b", day)).not.toBe(base);
    expect(visitorHash("5.6.7.8", ua, "salt-a", day)).not.toBe(base);
    expect(visitorHash("1.2.3.4", "Mozilla/5.0 Firefox/125.0", "salt-a", day)).not.toBe(base);
  });
});

describe("computeHotTerms", () => {
  const row = (
    term: string,
    visitorKey: string,
    searches: number,
    hits = searches,
    label: string | null = null,
  ): HotSearchVisitorRow => ({ term, visitorKey, searches, hits, label });

  it("达门槛的词按热度分排序：访客权重高于次数", () => {
    const terms = computeHotTerms([
      // A：3 访客 × 2 次 = 6 次
      row("aa", "v1", 2), row("aa", "v2", 2), row("aa", "v3", 2),
      // B：5 访客 × 1 次 = 5 次（访客更多，应排前）
      row("bb", "v1", 1), row("bb", "v2", 1), row("bb", "v3", 1), row("bb", "v4", 1), row("bb", "v5", 1),
    ]);
    expect(terms.map((t) => t.term)).toEqual(["bb", "aa"]);
    expect(terms[0]).toMatchObject({ visitors: 5, searches: 5, hitRate: 1, score: 10 * 5 + 5 });
    expect(terms[1]).toMatchObject({ visitors: 3, searches: 6, score: 10 * 3 + 6 });
  });

  it("单访客刷词被封顶：一人搜 10 次只计 3 次，且达不到入榜门槛", () => {
    const terms = computeHotTerms([row("solo", "v1", 10)]);
    expect(terms).toEqual([]); // 只有 1 个访客，minVisitors=3 不达
    // 再加两个真实访客：总计 3 访客、3+1+1=5 次（封顶后刚好够）
    const withMore = computeHotTerms([
      row("solo", "v1", 10), row("solo", "v2", 1), row("solo", "v3", 1),
    ]);
    expect(withMore[0]).toMatchObject({ visitors: 3, searches: 5 });
  });

  it("同词同访客的多行会先合并再封顶", () => {
    const terms = computeHotTerms([
      row("merge", "v1", 2), row("merge", "v1", 2), row("merge", "v2", 2), row("merge", "v3", 2),
    ]);
    expect(terms[0]).toMatchObject({ visitors: 3, searches: 7 });
  });

  it("命中率 < 50% 的词不展示（搜索了但没结果 → 不推荐）", () => {
    const terms = computeHotTerms([
      row("empty", "v1", 2, 0), row("empty", "v2", 2, 0), row("empty", "v3", 2, 1),
    ]);
    expect(terms).toEqual([]); // 6 次里只 1 次有结果
  });

  it("展示词取出现次数最多的原文（同词大小写/空白已由 q_norm 合并）", () => {
    const terms = computeHotTerms([
      row("solar panel", "v1", 2, 2, "Solar Panel"),
      row("solar panel", "v2", 2, 2, "Solar Panel"),
      row("solar panel", "v3", 2, 2, "solar  panel"),
    ]);
    expect(terms[0].label).toBe("Solar Panel");
  });

  it("词长过滤：单字符与超长词不进榜", () => {
    const terms = computeHotTerms([
      row("单", "v1", 2), row("单", "v2", 2), row("单", "v3", 2),
      row("x".repeat(31), "v1", 2), row("x".repeat(31), "v2", 2), row("x".repeat(31), "v3", 2),
      row("正常词", "v1", 2), row("正常词", "v2", 2), row("正常词", "v3", 2),
    ]);
    expect(terms.map((t) => t.term)).toEqual(["正常词"]);
  });

  it("limit 生效，且入榜门槛可覆盖", () => {
    const rows: HotSearchVisitorRow[] = [];
    for (let i = 0; i < 10; i++) {
      for (const v of ["v1", "v2", "v3"]) rows.push(row(`word${i}`, v, 2, 2, `Word${i}`));
    }
    expect(computeHotTerms(rows)).toHaveLength(HOT_SEARCH_DEFAULTS.limit);
    expect(computeHotTerms(rows, { limit: 2 })).toHaveLength(2);
    expect(computeHotTerms(rows, { limit: 2, minVisitors: 4 })).toHaveLength(0);
  });

  it("空输入 / 无访客键 / 非法次数 → 空榜", () => {
    expect(computeHotTerms([])).toEqual([]);
    expect(computeHotTerms([row("x", "", 3)])).toEqual([]);
    expect(computeHotTerms([{ term: "x", label: null, visitorKey: "v1", searches: 0, hits: 0 }])).toEqual([]);
  });
});

describe("decideHotMode", () => {
  it("窗口有效搜索 / 合格词都达门槛 → hot", () => {
    expect(decideHotMode({ totalSearches: 200, qualifiedTerms: 5 })).toBe("hot");
  });

  it("任一不达门槛 → fallback（首页回退数据覆盖榜）", () => {
    expect(decideHotMode({ totalSearches: 199, qualifiedTerms: 5 }, { minTotalSearches: 200, minQualifiedTerms: 5 })).toBe("fallback");
    expect(decideHotMode({ totalSearches: 500, qualifiedTerms: 4 }, { minTotalSearches: 200, minQualifiedTerms: 5 })).toBe("fallback");
    expect(decideHotMode({ totalSearches: Number.NaN, qualifiedTerms: 5 })).toBe("fallback");
  });

  it("门槛可覆盖（测试/调参用）", () => {
    expect(decideHotMode({ totalSearches: 10, qualifiedTerms: 1 }, { minTotalSearches: 10, minQualifiedTerms: 1 })).toBe("hot");
  });
});

describe("isLikelyReferenceCode（参考码不进热榜）", () => {
  it("UUID / 公告编号类 → true", () => {
    expect(isLikelyReferenceCode("6d177e5c-a4eb-4981-9b05-f34c3d6c34ca")).toBe(true);
    expect(isLikelyReferenceCode("TPO000ETT26000031")).toBe(true);
    expect(isLikelyReferenceCode("00087-2026-0165")).toBe(true);
    expect(isLikelyReferenceCode("DA-1699253")).toBe(true);
  });

  it("业务词（含中文 / 纯英文单词）→ false", () => {
    expect(isLikelyReferenceCode("无人机")).toBe(false);
    expect(isLikelyReferenceCode("solar")).toBe(false);
    expect(isLikelyReferenceCode("computer")).toBe(false);
    expect(isLikelyReferenceCode("叉车7吨")).toBe(false);
    expect(isLikelyReferenceCode("")).toBe(true);
  });
});

describe("computeHotTerms 参考码过滤", () => {
  it("编号类词即使访客与次数达标也不进热榜；业务词保留", () => {
    const terms = computeHotTerms([
      { term: "TPO000ETT26000031", label: null, visitorKey: "v1", searches: 2, hits: 2 },
      { term: "TPO000ETT26000031", label: null, visitorKey: "v2", searches: 2, hits: 2 },
      { term: "无人机", label: null, visitorKey: "v1", searches: 2, hits: 2 },
      { term: "无人机", label: null, visitorKey: "v2", searches: 2, hits: 2 },
    ]);
    expect(terms.map((t) => t.term)).toEqual(["无人机"]);
  });
});

describe("HOT_SEARCH_DEFAULTS（冷启动期口径）", () => {
  it("默认门槛面向冷启动：访客≥2、次数≥3、低总量门槛", () => {
    expect(HOT_SEARCH_DEFAULTS.minVisitors).toBe(2);
    expect(HOT_SEARCH_DEFAULTS.minSearches).toBe(3);
    expect(HOT_SEARCH_DEFAULTS.minTotalSearches).toBe(50);
    expect(HOT_SEARCH_DEFAULTS.minQualifiedTerms).toBe(2);
  });
});