import { describe, it, expect } from "vitest";
import { normalizeUserKey, escapeLikeWildcard, normalizeContactRows, extractContactsFromText } from "./normalize";

describe("normalizeUserKey", () => {
  it("正常邮箱 → 小写截断", () => {
    expect(normalizeUserKey("User@Example.COM")).toBe("user@example.com");
  });

  it("超长输入 → 截断到 190 字符", () => {
    const long = "a".repeat(200);
    expect(normalizeUserKey(long)!.length).toBe(190);
  });

  it("空值/guest → null", () => {
    expect(normalizeUserKey("")).toBeNull();
    expect(normalizeUserKey("guest")).toBeNull();
    expect(normalizeUserKey("Guest")).toBeNull();
    expect(normalizeUserKey(null)).toBeNull();
  });

  it("前后空白自动 trim", () => {
    expect(normalizeUserKey("  test@test.com  ")).toBe("test@test.com");
  });
});

describe("escapeLikeWildcard", () => {
  it("% 和 _ 被转义", () => {
    expect(escapeLikeWildcard("100%")).toBe("100\\%");
    expect(escapeLikeWildcard("a_b")).toBe("a\\_b");
  });

  it("无特殊字符 → 原样返回", () => {
    expect(escapeLikeWildcard("hello")).toBe("hello");
  });

  it("混合特殊字符", () => {
    expect(escapeLikeWildcard("100%_done")).toBe("100\\%\\_done");
  });
});

describe("normalizeContactRows", () => {
  it("从对象数组提取联系人", () => {
    const result = normalizeContactRows([
      { email: "a@test.com", phone: "123", name: "Alice" },
    ]);
    expect(result).toEqual([{ name: "Alice", title: "", email: "a@test.com", phone: "123" }]);
  });

  it("去重（相同 email+phone+name）", () => {
    const result = normalizeContactRows([
      { email: "a@test.com", name: "Alice" },
      { email: "a@test.com", name: "Alice" },
    ]);
    expect(result).toHaveLength(1);
  });

  it("跳过空条目", () => {
    const result = normalizeContactRows([null, undefined, {}]);
    expect(result).toHaveLength(0);
  });

  it("从 JSON 字符串解析", () => {
    const json = JSON.stringify([{ email: "b@test.com", name: "Bob" }]);
    const result = normalizeContactRows(json);
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe("b@test.com");
  });
});

describe("extractContactsFromText", () => {
  it("从文本提取邮箱和电话", () => {
    const result = extractContactsFromText("Contact: alice@test.com or call +1234567890");
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].email).toBe("alice@test.com");
  });

  it("无联系方式 → 空数组", () => {
    expect(extractContactsFromText("no contacts here")).toEqual([]);
  });
});
