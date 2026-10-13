/**
 * 落点表契约的四条判据（红线：混源 / 快照落后 / 半写 / 断供 都要报，AI 侧不许被当成事故）
 * 夹具取自 2026-10-13 生产实测的 5 行缺口形态（公告 725 少一个叶子 UGT-0204020102）。
 */
import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));

import {
  auditLanding,
  assertDroppable,
  missingLandingPairs,
  ATTR_SOURCE_LEGACY,
  type LandingRow,
} from "@/lib/services/commodity/attribution-contract";

const CHAIN = "UGT-02,UGT-0204,UGT-020402,UGT-02040201,UGT-0204020102";
/** 链上每个节点一条 legacy 落点（= 灌入脚本该写的形状） */
const chainLandings = (pk: number): LandingRow[] =>
  CHAIN.split(",").map((code) => ({ pk, code, source: ATTR_SOURCE_LEGACY }));

describe("AS1 混源", () => {
  it("同一公告混了 legacy_tag 与 ai_content ⇒ 红", () => {
    const r = auditLanding(
      [...chainLandings(725), { pk: 725, code: "UGT-0204020103", source: "ai_content" }],
      [{ pk: 725, col: CHAIN }],
    );
    expect(r.violations.filter((v) => v.startsWith("AS1"))).toHaveLength(1);
    expect(r.violations[0]).toContain("725");
  });

  it("混源公告不再重复报 AS2（一条破口只报一次，避免刷屏掩盖真因）", () => {
    const r = auditLanding(
      [{ pk: 1, code: "UGT-02", source: ATTR_SOURCE_LEGACY }, { pk: 1, code: "UGT-0204", source: "ai_content" }],
      [{ pk: 1, col: "UGT-02" }],
    );
    expect(r.violations.some((v) => v.startsWith("AS2"))).toBe(false);
  });
});

describe("AS2 legacy 派生必须等于列值", () => {
  it("落点齐 ⇒ 绿", () => {
    const r = auditLanding(chainLandings(725), [{ pk: 725, col: CHAIN }]);
    expect(r.violations).toEqual([]);
    expect(r.stats.legacyNotices).toBe(1);
  });

  it("少一个叶子（生产实测的 5 行缺口形态）⇒ 红，且报出该补的码", () => {
    const short = chainLandings(725).slice(0, -1); // 最深那条没落库
    const r = auditLanding(short, [{ pk: 725, col: CHAIN }]);
    const as2 = r.violations.filter((v) => v.startsWith("AS2"));
    expect(as2).toHaveLength(1);
    // 钉数字段：曾经误写 `new Set(derived)`（derived 是 join 后的字符串）会退化成字符集，
    // 把这里报成「派生 9 个」；只断言节点码会被别的段落吃掉、测不出这个错。
    expect(as2[0]).toContain("派生 4 个 / 列内 5 个");
    expect(as2[0]).toContain("该补的落点 UGT-0204020102");
    expect(r.stats.legacyDriftNotices).toBe(1);
  });

  it("落点多于列值（快照跑到列前面）⇒ 报「派生有列无」，且「该补的落点」为空", () => {
    const extra = [...chainLandings(725), { pk: 725, code: "UGT-03", source: ATTR_SOURCE_LEGACY }];
    const r = auditLanding(extra, [{ pk: 725, col: CHAIN }]);
    const as2 = r.violations.filter((v) => v.startsWith("AS2"));
    expect(as2).toHaveLength(1);
    expect(as2[0]).toContain("派生有列无 UGT-03");
    expect(as2[0]).toContain("该补的落点 —");
  });

  it("列值多余落点（快照落后于列）同样报红", () => {
    const r = auditLanding([{ pk: 9, code: "UGT-02", source: ATTR_SOURCE_LEGACY }], [{ pk: 9, col: CHAIN }]);
    expect(r.violations.some((v) => v.startsWith("AS2"))).toBe(true);
  });

  it("列值含脏 token ⇒ 报红且点名脏 token（不能三段全空、报红无因）", () => {
    const r = auditLanding(chainLandings(1), [{ pk: 1, col: `${CHAIN},XX-BAD` }]);
    const as2 = r.violations.filter((v) => v.startsWith("AS2"));
    expect(as2).toHaveLength(1);
    expect(as2[0]).toContain("列内非节点码 token XX-BAD");
  });
});

describe("AS3 半写 / AS4 断供", () => {
  it("有 legacy 落点、无列值 ⇒ AS3 红（事实源写了派生列没跟上）", () => {
    const r = auditLanding(chainLandings(5), [{ pk: 6, col: "UGT-02" }]);
    expect(r.violations.some((v) => v.startsWith("AS3") && v.includes("pk=5"))).toBe(true);
  });

  it("有列值、零落点 ⇒ AS4 红（切读会把这条清空）", () => {
    const r = auditLanding([], [{ pk: 77, col: CHAIN }]);
    expect(r.violations.some((v) => v.startsWith("AS4") && v.includes("pk=77"))).toBe(true);
    // 锁住 token 计数：上一轮变异测试发现它退回 split 后依然全绿
    expect(r.violations[0]).toContain("5 个合法 token");
    // 锁住计数：门禁只按 stats 判红，没这个字段 AS4 就永远不会拦（已踩过）
    expect(r.stats.orphanColumnNotices).toBe(1);
  });

  it("AS4 计数只算合法 token（脏 token 不算落点）", () => {
    const r = auditLanding([], [{ pk: 88, col: "UGT-02,JUNK" }]);
    expect(r.violations[0]).toContain("1 个合法 token");
  });

  it("AI 侧公告不参与 AS2，但计入 stats.aiNotices", () => {
    const r = auditLanding([{ pk: 3, code: "UGT-0204020102", source: "ai_content" }], [{ pk: 3, col: "" }]);
    expect(r.violations).toEqual([]);
    expect(r.stats.aiNotices).toBe(1);
    expect(r.stats.orphanColumnNotices).toBe(0);
    // 口径：空列值不计入 noticesWithColumn（要与 noticesWithLanding 同口径才能直接对拍）
    expect(r.stats.noticesWithColumn).toBe(0);
  });
});

describe("missingLandingPairs（镜像该用的谓词）", () => {
  it("返回「列隐含落点 − 现有落点」，不是整条公告", () => {
    const short = chainLandings(725).slice(0, -1);
    const miss = missingLandingPairs(short, [{ pk: 725, col: CHAIN }]);
    expect(miss).toEqual([{ pk: 725, code: "UGT-0204020102" }]);
  });

  it("脏列（闭包不成立）不产候选，交人工而不是顺手补齐", () => {
    const miss = missingLandingPairs([], [{ pk: 8, col: "UGT-0204020102,UGT-02" }]);
    expect(miss).toEqual([]);
  });
});

describe("assertDroppable（ADR-0014 纪律 1）", () => {
  it("只有 legacy_tag ⇒ 可删（派生数据，重灌即回）", () => {
    expect(() => assertDroppable({ [ATTR_SOURCE_LEGACY]: 638381 })).not.toThrow();
    expect(() => assertDroppable({})).not.toThrow();
  });

  it("含任何非 legacy 行 ⇒ 抛，且点名行数", () => {
    expect(() => assertDroppable({ [ATTR_SOURCE_LEGACY]: 1, ai_content: 27 })).toThrow(/ai_content=27/);
  });
});

describe("违规刷屏上限", () => {
  it("超过 40 条只留 40 条，但 stats 计数是全量", () => {
    const landings: LandingRow[] = [];
    const cols: Array<{ pk: number; col: string }> = [];
    for (let pk = 100; pk < 200; pk++) {
      landings.push({ pk, code: "UGT-02", source: ATTR_SOURCE_LEGACY });
      cols.push({ pk, col: CHAIN });
    }
    const r = auditLanding(landings, cols);
    expect(r.violations.length).toBeLessThanOrEqual(40);
    expect(r.stats.legacyDriftNotices).toBe(100);
  });
});
