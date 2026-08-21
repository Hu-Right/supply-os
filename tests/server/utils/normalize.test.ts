/**
 * server/utils/normalize.ts 测试
 */
import { describe, it, expect } from "vitest";
import {
  normalizeContactRows,
  extractContactsFromText,
  normalizeDocumentRows,
  normalizeUserKey,
  escapeLikeWildcard,
} from "../../../server/utils/normalize";

describe("normalizeContactRows", () => {
  it("从数组提取联系人", () => {
    const result = normalizeContactRows([
      { name: "Alice", email: "alice@test.com", phone: "123" },
    ]);
    expect(result).toEqual([{ name: "Alice", title: "", email: "alice@test.com", phone: "123" }]);
  });

  it("从 JSON 字符串解析", () => {
    const result = normalizeContactRows('[{"email":"bob@test.com"}]');
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe("bob@test.com");
  });

  it("去重（相同 email+phone+name）", () => {
    const result = normalizeContactRows([
      { email: "a@b.com", name: "X" },
      { email: "A@B.com", name: "x" },
    ]);
    expect(result).toHaveLength(1);
  });

  it("跳过空键和无效输入", () => {
    const result = normalizeContactRows([null, undefined, {}, { email: "", phone: "", name: "" }]);
    expect(result).toHaveLength(0);
  });

  it("支持多种字段别名", () => {
    const result = normalizeContactRows([
      { person: "Bob", role: "Engineer", mail: "bob@x.com", tel: "555" },
    ]);
    expect(result[0]).toEqual({ name: "Bob", title: "Engineer", email: "bob@x.com", phone: "555" });
  });

  it("firstName + lastName 拼接", () => {
    const result = normalizeContactRows([{ firstName: "John", lastName: "Doe", email: "j@d.com" }]);
    expect(result[0].name).toBe("John Doe");
  });
});

describe("extractContactsFromText", () => {
  it("从文本提取邮箱和电话", () => {
    const result = extractContactsFromText("Contact: alice@test.com, call +1234567890");
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].email).toBe("alice@test.com");
  });

  it("无匹配返回空数组", () => {
    expect(extractContactsFromText("no contacts here")).toEqual([]);
  });
});

describe("normalizeDocumentRows", () => {
  it("从数组提取文档", () => {
    const result = normalizeDocumentRows([{ url: "http://example.com/file.pdf", name: "Report" }]);
    expect(result).toEqual([{ url: "http://example.com/file.pdf", name: "Report" }]);
  });

  it("自动从 URL 提取文件名", () => {
    const result = normalizeDocumentRows([{ url: "http://example.com/docs/report.pdf?token=abc" }]);
    expect(result[0].name).toBe("report.pdf");
  });

  it("去重", () => {
    const result = normalizeDocumentRows([
      { url: "http://a.com/f.pdf", name: "F" },
      { url: "HTTP://A.COM/F.PDF", name: "f" },
    ]);
    expect(result).toHaveLength(1);
  });

  it("跳过无效输入", () => {
    expect(normalizeDocumentRows([null, {}, { url: "", name: "" }])).toHaveLength(0);
  });

  it("支持字段别名", () => {
    const result = normalizeDocumentRows([{ href: "http://x.com/a.doc", title: "Doc" }]);
    expect(result[0].url).toBe("http://x.com/a.doc");
    expect(result[0].name).toBe("Doc");
  });
});

describe("normalizeUserKey", () => {
  it("正常 user key", () => {
    expect(normalizeUserKey("User@Example.com")).toBe("user@example.com");
  });

  it("guest 返回 null", () => {
    expect(normalizeUserKey("guest")).toBeNull();
    expect(normalizeUserKey("Guest")).toBeNull();
  });

  it("空值返回 null", () => {
    expect(normalizeUserKey("")).toBeNull();
    expect(normalizeUserKey(null)).toBeNull();
    expect(normalizeUserKey(undefined)).toBeNull();
  });

  it("截断超长 key", () => {
    const long = "a".repeat(200);
    expect(normalizeUserKey(long)!.length).toBe(190);
  });
});

describe("escapeLikeWildcard", () => {
  it("转义 % 和 _", () => {
    expect(escapeLikeWildcard("100%")).toBe("100\\%");
    expect(escapeLikeWildcard("a_b")).toBe("a\\_b");
    expect(escapeLikeWildcard("100%_test")).toBe("100\\%\\_test");
  });

  it("无特殊字符不变", () => {
    expect(escapeLikeWildcard("hello")).toBe("hello");
  });
});
