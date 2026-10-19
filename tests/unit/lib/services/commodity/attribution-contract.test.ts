/**
 * 落点表契约的四条判据（红线：混源 / 快照落后 / 半写 / 断供 都要报，AI 侧不许被当成事故）
 * 夹具取自 2026-10-13 生产实测的 5 行缺口形态（公告 725 少一个叶子 UGT-0204020102）。
 */
import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));

import {
  assertTableName,
  auditLanding,
  assertDroppable,
  missingLandingPairs,
  isValidLandingCode,
  hasValidLanding,
  coarseOnlyLanding,
  withoutValidLandingWhere,
  withMinContentWhere,
  ATTR_SOURCE_LEGACY,
  ATTR_VALID_MIN_CODE_LEN,
  ATTR_MIN_CONTENT_CHARS,
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
  it("两种非 legacy source 共存也算混源（旧谓词只看 legacy+非legacy，会静默绿）", () => {
    const r = auditLanding(
      [
        { pk: 1, code: "UGT-02", source: "ai_content" },
        { pk: 1, code: "UGT-0204020102", source: "manual" },
      ],
      [{ pk: 1, col: CHAIN }],
    );
    expect(r.stats.mixedSourceNotices).toBe(1);
    expect(r.violations.some((v) => v.startsWith("AS1"))).toBe(true);
    expect(r.violations[0]).toContain("ai_content/manual");
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

describe("AS5 换源（AS1 与 AS4 之间的黑洞）", () => {
  it("公告只剩 ai_content 行、而列值声明的叶子无承载 ⇒ 红（legacy 快照被撞键吞了）", () => {
    const r = auditLanding([{ pk: 725, code: "UGT-0204020103", source: "ai_content" }], [{ pk: 725, col: CHAIN }]);
    const as5 = r.violations.filter((v) => v.startsWith("AS5"));
    expect(as5).toHaveLength(1);
    expect(r.stats.sourceReplacedNotices).toBe(1);
    // 不重复报 AS2（该公告已无 legacy 行，AS2 抱不到）也不报 AS4（不是零落点）
    expect(r.violations.some((v) => v.startsWith("AS2"))).toBe(false);
    expect(r.stats.orphanColumnNotices).toBe(0);
  });

  it("脏列不产 AS5 换源，但要计数并报出来（不能悄悄吞掉）", () => {
    const r = auditLanding(
      [{ pk: 8, code: "UGT-02", source: "ai_content" }],
      [{ pk: 8, col: "UGT-0204020102,UGT-02" }],
    );
    // 不当成换源（形制问题不是归属问题），也不能归零：旧实现这里既不计也不报，就是一句没人接的注释
    expect(r.stats.sourceReplacedNotices).toBe(0);
    expect(r.stats.dirtyColumnNotices).toBe(1);
    expect(r.violations.some((v) => v.includes("脏列"))).toBe(true);
  });

  it("换源后码仍覆盖列值叶子 ⇒ 四规则全绿（审计线消失的残差，已登记进 ADR 代价节）", () => {
    const r = auditLanding(
      CHAIN.split(",").map((code) => ({ pk: 725, code, source: "ai_content" })),
      [{ pk: 725, col: CHAIN }],
    );
    // 这条断言故意写成“绿”：它不是在声明这样好，而是在钉住 AS5 抱不到的边界。
    // legacy 行被 ODKU 原地改属性、码未变 ⇒ 归属未动但 source/model/confidence 已被覆盖，
    // 那是审计线的伤害，只有写入侧不覆盖才能防（ADR-0014 结论 7）。
    expect(r.violations).toEqual([]);
    expect(r.stats.sourceReplacedNotices).toBe(0);
    expect(r.stats.aiNotices).toBe(1);
  });

  it("纯 legacy 公告的缺失仍走 AS2，不拆成两条报", () => {
    const r = auditLanding(chainLandings(725).slice(0, -1), [{ pk: 725, col: CHAIN }]);
    expect(r.violations.some((v) => v.startsWith("AS5"))).toBe(false);
    expect(r.stats.sourceReplacedNotices).toBe(0);
  });

  it("脏列不产 AS5（形制问题交人工，不猜成换源）", () => {
    const r = auditLanding(
      [{ pk: 9, code: "UGT-02", source: "ai_content" }],
      [{ pk: 9, col: "XX-BAD" }],
    );
    expect(r.stats.sourceReplacedNotices).toBe(0);
  });
});

describe("assertTableName（三个入口共用一份）", () => {
  it("止于合法表名，拦下拼进反引号的片段", () => {
    expect(() => assertTableName("crm_notice_attribution_nodes")).not.toThrow();
    expect(() => assertTableName("crm_notice_attribution_nodes__drill")).not.toThrow();
    expect(() => assertTableName("crm_x`; DELETE FROM y")).toThrow(/形制非法/);
    expect(() => assertTableName("")).toThrow(/形制非法/);
    expect(() => assertTableName("not_crm_x")).toThrow(/形制非法/);
  });
});

describe("有效落点判据（L2+）：粗落点 = 零落点，同一个待办口径", () => {
  it("下限就是 L2 的码长（前缀+2 层×2 位），不拿 level 冗余列当判据", () => {
    expect(ATTR_VALID_MIN_CODE_LEN).toBe(8);
    expect(isValidLandingCode("UGT-01")).toBe(false); // L1 大类码不算归属
    expect(isValidLandingCode("UGT-0102")).toBe(true);
    expect(isValidLandingCode("UGT-B-0102")).toBe(false); // 旧形制不认（不猜层级）
    expect(isValidLandingCode(null)).toBe(false);
  });

  it("coarseOnlyLanding：有行但全粗 ⇒ 粗；全空 ⇒ 不判粗（那是零落点，另一个形态）", () => {
    expect(coarseOnlyLanding(["UGT-01"])).toBe(true);
    expect(coarseOnlyLanding(["UGT-01", "UGT-0102"])).toBe(false);
    expect(coarseOnlyLanding([])).toBe(false);
    // 脏 token 归入粗：它同样接不住撮合，且写入侧必须知道「有行要先清」（防 AS1 混源）
    expect(coarseOnlyLanding(["JUNK"])).toBe(true);
    expect(hasValidLanding(["UGT-01", "JUNK"])).toBe(false);
  });

  it("SQL 片段只拼一份下限，与 JS 判据同一条（两侧分开错就是 BB10 那一类事故）", () => {
    const frag = withoutValidLandingWhere();
    expect(frag).toContain("a.notice_pk = n.id");
    expect(frag).toContain(`LENGTH(a.node_code) >= ${ATTR_VALID_MIN_CODE_LEN}`);
    expect(withoutValidLandingWhere("crm_notice_attribution_nodes__drill", "x")).toContain("a.notice_pk = x.id");
    expect(() => withoutValidLandingWhere("crm_x`;")).toThrow(/形制非法/);
    expect(withMinContentWhere("n")).toContain(`CHAR_LENGTH(TRIM(n.description)) >= ${ATTR_MIN_CONTENT_CHARS}`);
  });

  it("auditLanding 计粗落点：纯 L1 与混源/AI 早退的公告都要计入，不能只数剩下那批", () => {
    const r = auditLanding(
      [
        { pk: 1, code: "UGT-01", source: ATTR_SOURCE_LEGACY }, // 纯粗
        { pk: 2, code: "UGT-01", source: ATTR_SOURCE_LEGACY },
        { pk: 2, code: "UGT-0102", source: ATTR_SOURCE_LEGACY }, // 有深码 ⇒ 不算粗
        { pk: 3, code: "UGT-01", source: ATTR_SOURCE_LEGACY },
        { pk: 3, code: "UGT-01", source: "ai_content" }, // 混源且全粗 ⇒ 早退前也要计
      ],
      [],
    );
    expect(r.stats.coarseOnlyNotices).toBe(2);
    expect(r.stats.mixedSourceNotices).toBe(1);
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
