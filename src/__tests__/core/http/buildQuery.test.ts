// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildQuery } from "@/core/http/buildQuery";

describe("buildQuery", () => {
  it("serializes simple key-value pairs", () => {
    const result = buildQuery({ page: 1, q: "hello" });
    expect(result).toBe("page=1&q=hello");
  });

  it("filters out null values", () => {
    const result = buildQuery({ page: 1, country: null, q: "test" });
    expect(result).toBe("page=1&q=test");
  });

  it("filters out undefined values", () => {
    const result = buildQuery({ page: 1, country: undefined, q: "test" });
    expect(result).toBe("page=1&q=test");
  });

  it("filters out empty string values", () => {
    const result = buildQuery({ page: 1, country: "", q: "test" });
    expect(result).toBe("page=1&q=test");
  });

  it("keeps 0 as a valid value", () => {
    const result = buildQuery({ offset: 0, limit: 10 });
    expect(result).toBe("offset=0&limit=10");
  });

  it("keeps false as a valid value", () => {
    const result = buildQuery({ featured: false, active: true });
    expect(result).toBe("featured=false&active=true");
  });

  it("converts non-string values to strings", () => {
    const result = buildQuery({ count: 42, enabled: true });
    expect(result).toBe("count=42&enabled=true");
  });

  it("handles empty object", () => {
    const result = buildQuery({});
    expect(result).toBe("");
  });

  it("handles all filtered values", () => {
    const result = buildQuery({ a: null, b: undefined, c: "" });
    expect(result).toBe("");
  });

  it("URL-encodes special characters", () => {
    const result = buildQuery({ q: "hello world", tag: "a&b" });
    expect(result).toContain("q=hello+world");
    expect(result).toContain("tag=a%26b");
  });

  it("handles mixed valid and invalid values", () => {
    const result = buildQuery({
      page: 1,
      q: "test",
      country: null,
      offset: 0,
      featured: false,
      empty: "",
      undef: undefined,
    });
    expect(result).toBe("page=1&q=test&offset=0&featured=false");
  });
});
