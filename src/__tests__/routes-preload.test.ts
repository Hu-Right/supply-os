import { describe, it, expect, vi } from "vitest";
import { preloadRoute } from "@/routes";

describe("preloadRoute", () => {
  // ── 1. Known path triggers dynamic import ──
  it("calls dynamic import for known paths", () => {
    // preloadRoute internally calls import().catch()
    // We just verify it doesn't throw for valid paths
    expect(() => preloadRoute("/showroom")).not.toThrow();
    expect(() => preloadRoute("/procurement")).not.toThrow();
    expect(() => preloadRoute("/supplier")).not.toThrow();
    expect(() => preloadRoute("/crm")).not.toThrow();
    expect(() => preloadRoute("/services")).not.toThrow();
    expect(() => preloadRoute("/learning")).not.toThrow();
    expect(() => preloadRoute("/membership")).not.toThrow();
    expect(() => preloadRoute("/training")).not.toThrow();
  });

  // ── 2. Unknown path silently ignores ──
  it("silently ignores unknown paths", () => {
    // Unknown path: preloadMap[path] is undefined, optional chaining prevents error
    expect(() => preloadRoute("/nonexistent")).not.toThrow();
    expect(() => preloadRoute("")).not.toThrow();
  });
});
