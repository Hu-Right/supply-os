import { describe, it, expect } from "vitest";
import { deriveAudience } from "@/lib/repos/benefit-system.repo";

describe("deriveAudience", () => {
  it("L1/L2 → personal", () => {
    expect(deriveAudience("L1")).toBe("personal");
    expect(deriveAudience("L2")).toBe("personal");
  });
  it("L3/L4/L5/L6 → enterprise", () => {
    for (const tier of ["L3", "L4", "L5", "L6"]) {
      expect(deriveAudience(tier)).toBe("enterprise");
    }
  });
  it("未知层级 → enterprise 兜底", () => {
    expect(deriveAudience("L9")).toBe("enterprise");
    expect(deriveAudience("")).toBe("enterprise");
  });
});
