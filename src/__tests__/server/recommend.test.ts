// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  tokenizeNoticeText,
  jaccardTokenSim,
  recoVariant,
  S_TEXT_BONUS,
  decayUserInterestCodes,
  recomputeRecoWeightProfile,
  getUserUnlockKeywords,
} from "../../../server/services/recommend";

// ─── tokenizeNoticeText ─────────────────────────────────────────────────────
describe("tokenizeNoticeText", () => {
  it("extracts latin words >= 3 chars, lowercased", () => {
    const tokens = tokenizeNoticeText("Medical Equipment Supply");
    expect(tokens.has("medical")).toBe(true);
    expect(tokens.has("equipment")).toBe(true);
    // "supply" is a stopword
    expect(tokens.has("supply")).toBe(false);
  });

  it("filters stopwords", () => {
    const tokens = tokenizeNoticeText("the tender and bid for services");
    expect(tokens.size).toBe(0);
  });

  it("handles CJK bigram tokenization", () => {
    const tokens = tokenizeNoticeText("医疗器械");
    expect(tokens.has("医疗")).toBe(true);
    expect(tokens.has("疗器")).toBe(true);
    expect(tokens.has("器械")).toBe(true);
  });

  it("single CJK char segment adds the char itself", () => {
    const tokens = tokenizeNoticeText("标");
    expect(tokens.has("标")).toBe(true);
  });

  it("returns empty set for empty/null input", () => {
    expect(tokenizeNoticeText("").size).toBe(0);
    expect(tokenizeNoticeText(null as any).size).toBe(0);
  });

  it("ignores short latin words (< 3 chars)", () => {
    const tokens = tokenizeNoticeText("a b cd 12 abc");
    expect(tokens.has("a")).toBe(false);
    expect(tokens.has("b")).toBe(false);
    expect(tokens.has("cd")).toBe(false);
    expect(tokens.has("12")).toBe(false);
    expect(tokens.has("abc")).toBe(true);
  });

  it("handles mixed CJK and latin text", () => {
    const tokens = tokenizeNoticeText("UN procurement 联合国采购");
    expect(tokens.has("procurement")).toBe(false); // stopword
    expect(tokens.has("联合国")).toBe(false); // 3-char CJK segment → bigrams only
    expect(tokens.has("联合")).toBe(true);
    expect(tokens.has("合国")).toBe(true);
  });
});

// ─── jaccardTokenSim ────────────────────────────────────────────────────────
describe("jaccardTokenSim", () => {
  it("returns 0 for empty sets", () => {
    expect(jaccardTokenSim(new Set(), new Set(["a"]))).toBe(0);
    expect(jaccardTokenSim(new Set(["a"]), new Set())).toBe(0);
    expect(jaccardTokenSim(new Set(), new Set())).toBe(0);
  });

  it("returns 1 for identical sets", () => {
    const s = new Set(["a", "b", "c"]);
    expect(jaccardTokenSim(s, s)).toBe(1);
  });

  it("computes correct Jaccard index", () => {
    const a = new Set(["x", "y", "z"]);
    const b = new Set(["y", "z", "w"]);
    // intersection = {y, z} = 2, union = {x,y,z,w} = 4
    expect(jaccardTokenSim(a, b)).toBeCloseTo(2 / 4);
  });

  it("is symmetric: jaccard(a,b) === jaccard(b,a)", () => {
    const a = new Set(["hello", "world"]);
    const b = new Set(["world", "foo", "bar"]);
    expect(jaccardTokenSim(a, b)).toBe(jaccardTokenSim(b, a));
  });

  it("returns 0 for disjoint sets", () => {
    expect(jaccardTokenSim(new Set(["a"]), new Set(["b"]))).toBe(0);
  });
});

// ─── recoVariant (A/B bucketing) ───────────────────────────────────────────
describe("recoVariant", () => {
  it("returns control when AB_TREATMENT_PCT is 0 (default)", () => {
    // Default env has RECO_AB_TREATMENT_PCT=0 → all control
    expect(recoVariant("any-user-key")).toBe("control");
  });

  it("is deterministic for same user key", () => {
    const v1 = recoVariant("user-abc@test.com");
    const v2 = recoVariant("user-abc@test.com");
    expect(v1).toBe(v2);
  });
});

// ─── S_TEXT_BONUS constant ──────────────────────────────────────────────────
describe("S_TEXT_BONUS", () => {
  it("equals 0.05", () => {
    expect(S_TEXT_BONUS).toBe(0.05);
  });
});

// ─── decayUserInterestCodes ─────────────────────────────────────────────────
describe("decayUserInterestCodes", () => {
  it("does nothing when snapshot is empty", async () => {
    const dbPool = { execute: vi.fn() };
    await decayUserInterestCodes(dbPool, "user1", []);
    expect(dbPool.execute).not.toHaveBeenCalled();
  });

  it("calls execute with decay SQL for valid snapshot", async () => {
    const dbPool = { execute: vi.fn().mockResolvedValue([]) };
    const snapshot = [{ code: "80101500" }];
    await decayUserInterestCodes(dbPool, "user1", snapshot, 0.5);
    expect(dbPool.execute).toHaveBeenCalledTimes(1);
    const [sql, params] = dbPool.execute.mock.calls[0];
    expect(sql).toContain("UPDATE crm_user_interest_codes");
    expect(sql).toContain("GREATEST(0.01, weight * ?)");
    expect(params[0]).toBe(0.5);
    expect(params[1]).toBe("user1");
  });

  it("expands prefixes from snapshot codes", async () => {
    const dbPool = { execute: vi.fn().mockResolvedValue([]) };
    const snapshot = [{ code: "80101500" }];
    await decayUserInterestCodes(dbPool, "user1", snapshot);
    const [, params] = dbPool.execute.mock.calls[0];
    // Should contain expanded prefixes: 80, 8010, 801015
    const prefixParams = params.slice(2);
    expect(prefixParams).toContain("80");
    expect(prefixParams).toContain("8010");
    expect(prefixParams).toContain("801015");
  });
});

// ─── recomputeRecoWeightProfile ─────────────────────────────────────────────
describe("recomputeRecoWeightProfile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not create profile when no feedback exists", async () => {
    const dbPool = {
      query: vi.fn().mockResolvedValue([[]]),
      execute: vi.fn(),
    };
    await recomputeRecoWeightProfile(dbPool, "user-no-fb");
    expect(dbPool.execute).not.toHaveBeenCalled();
  });

  it("computes EMA and writes weight profile for positive feedback", async () => {
    const actions = Array.from({ length: 10 }, () => ({ action: "favorite" }));
    const dbPool = {
      query: vi.fn().mockResolvedValue([actions]),
      execute: vi.fn().mockResolvedValue([]),
    };
    await recomputeRecoWeightProfile(dbPool, "user-pos");
    expect(dbPool.execute).toHaveBeenCalledTimes(1);
    const [sql, params] = dbPool.execute.mock.calls[0];
    expect(sql).toContain("INSERT INTO crm_reco_weight_profile");
    expect(params[0]).toBe("user-pos");
    // w_unspsc should be > 0.5 for all-positive feedback
    const wUnspsc = Number(params[1]);
    expect(wUnspsc).toBeGreaterThan(0.5);
  });

  it("computes lower w_unspsc for negative feedback", async () => {
    const actions = Array.from({ length: 10 }, () => ({ action: "dismiss" }));
    const dbPool = {
      query: vi.fn().mockResolvedValue([actions]),
      execute: vi.fn().mockResolvedValue([]),
    };
    await recomputeRecoWeightProfile(dbPool, "user-neg");
    const [, params] = dbPool.execute.mock.calls[0];
    const wUnspsc = Number(params[1]);
    expect(wUnspsc).toBeLessThan(0.5);
  });

  it("prevents concurrent execution for same user", async () => {
    let resolveQuery: any;
    const dbPool = {
      query: vi.fn().mockImplementation(() => new Promise((r) => { resolveQuery = r; })),
      execute: vi.fn().mockResolvedValue([]),
    };
    const p1 = recomputeRecoWeightProfile(dbPool, "user-concurrent");
    const p2 = recomputeRecoWeightProfile(dbPool, "user-concurrent");
    resolveQuery([[{ action: "click" }]]);
    await Promise.all([p1, p2]);
    // query should only be called once due to dedup guard
    expect(dbPool.query).toHaveBeenCalledTimes(1);
  });
});

// ─── getUserUnlockKeywords ──────────────────────────────────────────────────
describe("getUserUnlockKeywords", () => {
  it("returns null when no unlock history", async () => {
    const dbPool = { query: vi.fn().mockResolvedValue([[]]) };
    const result = await getUserUnlockKeywords(dbPool, "user-empty-unlock");
    expect(result).toBeNull();
  });

  it("returns token set from unlocked notice titles", async () => {
    const dbPool = {
      query: vi.fn().mockResolvedValue([[
        { title: "Medical Device Equipment" },
        { title: "Hospital Construction" },
      ]]),
    };
    const result = await getUserUnlockKeywords(dbPool, "user-with-unlocks");
    expect(result).toBeInstanceOf(Set);
    expect(result!.has("medical")).toBe(true);
    expect(result!.has("device")).toBe(true);
    expect(result!.has("hospital")).toBe(true);
    expect(result!.has("construction")).toBe(true);
  });

  it("returns null and degrades gracefully on query error", async () => {
    const dbPool = { query: vi.fn().mockRejectedValue(new Error("DB down")) };
    const result = await getUserUnlockKeywords(dbPool, "user-err");
    expect(result).toBeNull();
  });
});
