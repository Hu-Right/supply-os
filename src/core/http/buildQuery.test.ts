import { describe, it, expect } from "vitest";
import { buildQuery } from "./buildQuery";

describe("buildQuery", () => {
  it("正常键值对 → URL 查询字符串", () => {
    const result = buildQuery({ page: 1, q: "hello" });
    expect(result).toContain("page=1");
    expect(result).toContain("q=hello");
  });

  it("null/undefined/空字符串 → 自动跳过", () => {
    const result = buildQuery({ page: 1, q: null, country: undefined, type: "" });
    expect(result).toBe("page=1");
  });

  it("0 和 false → 保留（不被过滤）", () => {
    const result = buildQuery({ page: 0, featured: false });
    expect(result).toContain("page=0");
    expect(result).toContain("featured=false");
  });

  it("非字符串值自动转 String", () => {
    const result = buildQuery({ count: 42, active: true });
    expect(result).toContain("count=42");
    expect(result).toContain("active=true");
  });

  it("空对象 → 空字符串", () => {
    expect(buildQuery({})).toBe("");
  });

  it("特殊字符自动编码", () => {
    const result = buildQuery({ q: "hello world" });
    expect(result).toContain("q=hello+world");
  });
});
