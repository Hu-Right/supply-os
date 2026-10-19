/**
 * 骨架名规则匹配（打标瀑布第 1 层）—— 钉的是「会静默改变归属结果」的四件事：
 * 1. 倒排索引与朴素全扫**完全等价**（少一个候选就漏一条直落，多一个就误落）；
 * 2. 英文整串必须词边界（`air pump` 不得命中 `airpump`）；
 * 3. 首词带连字符/是虚词的名字仍能进候选（建键与文本切分同一条正则）；
 * 4. 判定只认「共链」，跨分支一律歧义 —— 规则层没有"猜一个最深"的权力。
 */
import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { buildNameIndex, judgeRuleHits, type NameHit } from "@/lib/services/commodity/name-matcher";

const ROWS = [
  { code: "UGT-05", nameZh: "医疗器械", nameEn: "Medical instruments" },
  { code: "UGT-0520", nameZh: "实验仪器", nameEn: "Laboratory instruments" },
  { code: "UGT-052003", nameZh: "车用空气净化器", nameEn: "Vehicle air purifier" },
  { code: "UGT-05200301", nameZh: "空气净化器测试仪", nameEn: "Air cleaner tester" },
  { code: "UGT-0520030101", nameZh: "非转基因刺角瓜", nameEn: "Non GMO kiwano melons" },
  { code: "UGT-0520030102", nameZh: "短", nameEn: "Kit" }, // 两名都低于下限 → 整条不进词表
  { code: "JUNK-CODE", nameZh: "脏码节点名", nameEn: "Dirty node name" }, // 形制非法 → 不进词表
];

/** 朴素全扫：逐条 includes（英文折叠 + 词边界），给倒排做等价性对照 */
function naiveHits(indexRows: typeof ROWS, text: string): NameHit[] {
  const fold = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
  const out: NameHit[] = [];
  for (const r of indexRows) {
    if (r.code.startsWith("JUNK")) continue;
    if (r.nameZh.length >= 4 && text.includes(r.nameZh)) out.push({ code: r.code, name: r.nameZh, lang: "zh" });
    const en = fold(r.nameEn);
    if (en.length >= 8 && new RegExp(`(?:^|[^a-z0-9'])${en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z0-9']|$)`).test(` ${fold(text)} `)) {
      out.push({ code: r.code, name: r.nameEn, lang: "en" });
    }
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

describe("buildNameIndex", () => {
  const index = buildNameIndex(ROWS);

  it("脏码与过短名都不进词表（不猜层级、不用无区分度的短词）", () => {
    expect(index.nodes).toBe(ROWS.length - 1); // JUNK-CODE 被拒
    // 5 个合法节点里 5 个有合格中文名，英文名同样 5 条（Kit 太短被丢）
    expect(index.size).toBe(10);
  });

  it("中文整串命中：出现在文本里才算，拆开不算", () => {
    expect(index.hitCodes("采购车用空气净化器 一台").map((h) => h.code)).toContain("UGT-052003");
    expect(index.hitCodes("采购空气净化器的车间设备").length).toBe(0); // 不是完整名
  });

  it("英文大小写不敏感，且必须词边界", () => {
    expect(index.hitCodes("Supply of VEHICLE AIR PURIFIER")).toHaveLength(1);
    expect(index.hitCodes("The airpump and airpurifier units")).toHaveLength(0); // 粘连不算命中
    expect(index.hitCodes("buy air cleaner tester now").map((h) => h.code)).toContain("UGT-05200301");
  });

  it("倒排索引与朴素全扫逐条等价（键控少算/多算都会在这里露出来）", () => {
    const texts = [
      "采购车用空气净化器与空气净化器测试仪",
      "Non GMO kiwano melons supply",
      "Medical instruments and Laboratory instruments lot",
      "air purifier filter for vehicle", // 不含任何完整名
      "Framework Agreement for Supply of Air Field Lighting System",
    ];
    for (const t of texts) {
      const got = index.hitCodes(t).map((h) => `${h.code}/${h.lang}`).sort();
      const want = naiveHits(ROWS, t).map((h) => `${h.code}/${h.lang}`).sort();
      expect(got, `文本：${t}`).toEqual(want);
    }
  });

  it("首词是虚词/带连字符的名字仍能命中（建键与文本同一条切分正则）", () => {
    const idx = buildNameIndex([{ code: "UGT-07", nameZh: "成套设备", nameEn: "Turn-key complete set equipment" }]);
    expect(idx.hitCodes("procurement of Turn-key complete set equipment")).toHaveLength(1);
  });

  it("空文本与纯空白返回空集（不产候选，不猜）", () => {
    expect(index.hitCodes("")).toEqual([]);
    expect(index.hitCodes("   ")).toEqual([]);
  });
});

describe("judgeRuleHits", () => {
  const hit = (code: string, lang: "zh" | "en" = "zh"): NameHit => ({ code, name: `名${code}`, lang });

  it("无命中 ⇒ none", () => {
    expect(judgeRuleHits([]).state).toBe("none");
  });

  it("同链多层命中 ⇒ single，取最深（命中父类与子类正是应有结果）", () => {
    const v = judgeRuleHits([hit("UGT-05"), hit("UGT-0520"), hit("UGT-052003")]);
    expect(v.state).toBe("single");
    expect(v.code).toBe("UGT-052003");
    expect(v.level).toBe(3);
  });

  it("跨分支命中 ⇒ ambiguous-branch，规则层不得自动落笔", () => {
    const v = judgeRuleHits([hit("UGT-0520"), hit("UGT-052003"), hit("UGT-0701")]);
    expect(v.state).toBe("ambiguous-branch");
    expect(v.distinctCodes).toBe(3);
    expect(v.code).toBeUndefined();
  });

  it("同名多码（实测存在 3 码同名）⇒ 同样判歧义，不「取最深」糊过去", () => {
    const v = judgeRuleHits([{ code: "UGT-0901", name: "支架", lang: "zh" }, { code: "UGT-0902", name: "支架", lang: "zh" }]);
    expect(v.state).toBe("ambiguous-branch");
  });

  it("minLevel 与 AI 管道同一条下限：只到 L1 时判 too-coarse（落了对撮合没用）", () => {
    expect(judgeRuleHits([hit("UGT-05")], 2).state).toBe("too-coarse");
    expect(judgeRuleHits([hit("UGT-05")], 1).state).toBe("single");
  });

  it("脏码不参与共链判定（chainOfNode 不认的码不可能成为最深码）", () => {
    const v = judgeRuleHits([hit("UGT-052003"), { code: "XX-1", name: "脏", lang: "zh" }]);
    expect(v.state).toBe("ambiguous-branch"); // 脏码不在最深码的链上 ⇒ 不自动落笔
  });
});
