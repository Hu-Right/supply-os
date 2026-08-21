/**
 * src/core/http/buildQuery.ts 测试
 */
import { describe, it, expect } from "vitest";
import { buildQuery } from "../../../../src/core/http/buildQuery";

describe("buildQuery", () => {
  it("正常键值对序列化", () => {
    expect(buildQuery({ page: 1, q: "hello" })).toBe("page=1&q=hello");
  });

  it("null/undefined/空字符串自动跳过", () => {
    const result = buildQuery({ a: "yes", b: null, c: undefined, d: "", e: 1 });
    expect(result).toBe("a=yes&e=1");
  });

  it("0 和 false 保留", () => {
    const result = buildQuery({ zero: 0, flag: false });
    expect(result).toContain("zero=0");
    expect(result).toContain("flag=false");
  });

  it("空对象返回空字符串", () => {
    expect(buildQuery({})).toBe("");
  });

  it("特殊字符自动编码", () => {
    const result = buildQuery({ q: "hello world" });
    expect(result).toBe("q=hello+world");
  });
});
