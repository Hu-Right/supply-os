import { describe, it, expect, vi } from "vitest";
import { tokenizeNoticeText, jaccardTokenSim, S_TEXT_BONUS, getUserUnlockKeywords } from "./text-similarity";

describe("tokenizeNoticeText", () => {
  it("英文文本 → 去停用词", () => {
    const tokens = tokenizeNoticeText("Construction of School Buildings");
    expect(tokens.has("construction")).toBe(true);
    expect(tokens.has("of")).toBe(false);
  });

  it("中文文本 → bigram", () => {
    const tokens = tokenizeNoticeText("学校建设项目");
    expect(tokens.has("学校")).toBe(true);
    expect(tokens.has("建设")).toBe(true);
  });

  it("空文本 → 空集合", () => {
    expect(tokenizeNoticeText("").size).toBe(0);
  });
});

describe("jaccardTokenSim", () => {
  it("完全相同 → 1.0", () => {
    const a = new Set(["x", "y"]);
    expect(jaccardTokenSim(a, a)).toBe(1);
  });

  it("完全不交 → 0", () => {
    expect(jaccardTokenSim(new Set(["a"]), new Set(["b"]))).toBe(0);
  });

  it("空集合 → 0", () => {
    expect(jaccardTokenSim(new Set(), new Set(["a"]))).toBe(0);
  });
});

describe("S_TEXT_BONUS", () => {
  it("= 0.05", () => {
    expect(S_TEXT_BONUS).toBe(0.05);
  });
});

describe("getUserUnlockKeywords", () => {
  it("DB 有解锁历史 → 返回关键词集合", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue([[{ title: "Construction of Schools" }]]),
    };
    const result = await getUserUnlockKeywords(mockPool, "user@test.com");
    expect(result).toBeInstanceOf(Set);
    expect(result!.size).toBeGreaterThan(0);
  });

  it("DB 无解锁历史 → null", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue([[]]),
    };
    const result = await getUserUnlockKeywords(mockPool, "new@test.com");
    expect(result).toBeNull();
  });

  it("DB 异常 → null（降级）", async () => {
    const mockPool = {
      query: vi.fn().mockRejectedValue(new Error("DB error")),
    };
    const result = await getUserUnlockKeywords(mockPool, "err@test.com");
    expect(result).toBeNull();
  });
});
