// @vitest-environment node
import { describe, it, expect } from "vitest";
import { safeJson, preferValue } from "../../../server/utils/json";
import { normalizeContactRows, extractContactsFromText, normalizeDocumentRows, normalizeUserKey } from "../../../server/utils/normalize";
import { maskPhone, maskEmail, splitListField } from "../../../server/utils/mask";

// ─── safeJson ───────────────────────────────────────────────────────────────
describe("safeJson", () => {
  it("returns [] for falsy values", () => {
    expect(safeJson(null)).toEqual([]);
    expect(safeJson(undefined)).toEqual([]);
    expect(safeJson("")).toEqual([]);
    expect(safeJson(0)).toEqual([]);
  });

  it("returns array as-is", () => {
    const arr = [{ code: "1234" }];
    expect(safeJson(arr)).toBe(arr);
  });

  it("parses valid JSON string", () => {
    expect(safeJson('[{"a":1}]')).toEqual([{ a: 1 }]);
  });

  it("returns [] for invalid JSON string", () => {
    expect(safeJson("not json")).toEqual([]);
    expect(safeJson("{broken")).toEqual([]);
  });
});

// ─── preferValue ────────────────────────────────────────────────────────────
describe("preferValue", () => {
  it("returns fallback when primary is null/undefined/empty", () => {
    expect(preferValue(null, "fb")).toBe("fb");
    expect(preferValue(undefined, "fb")).toBe("fb");
    expect(preferValue("", "fb")).toBe("fb");
  });

  it("returns fallback when primary is empty array", () => {
    expect(preferValue([], "fb")).toBe("fb");
  });

  it("returns primary when it has value", () => {
    expect(preferValue("hello", "fb")).toBe("hello");
    expect(preferValue(0, "fb")).toBe(0);
    expect(preferValue([1, 2], "fb")).toEqual([1, 2]);
  });
});

// ─── normalizeUserKey ───────────────────────────────────────────────────────
describe("normalizeUserKey", () => {
  it("returns null for empty/guest values", () => {
    expect(normalizeUserKey("")).toBeNull();
    expect(normalizeUserKey(null)).toBeNull();
    expect(normalizeUserKey(undefined)).toBeNull();
    expect(normalizeUserKey("guest")).toBeNull();
    expect(normalizeUserKey("  ")).toBeNull();
  });

  it("trims, lowercases and slices to 190 chars", () => {
    expect(normalizeUserKey("  User@Example.COM  ")).toBe("user@example.com");
    const long = "a".repeat(200);
    expect(normalizeUserKey(long)!.length).toBe(190);
  });
});

// ─── normalizeContactRows ───────────────────────────────────────────────────
describe("normalizeContactRows", () => {
  it("extracts contacts from array of objects", () => {
    const result = normalizeContactRows([
      { name: "Alice", email: "alice@test.com", phone: "12345678" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ name: "Alice", title: "", email: "alice@test.com", phone: "12345678" });
  });

  it("deduplicates by email+phone+name key", () => {
    const result = normalizeContactRows([
      { name: "Bob", email: "bob@x.com", phone: "" },
      { name: "bob", email: "BOB@X.COM", phone: "" },
    ]);
    expect(result).toHaveLength(1);
  });

  it("parses JSON string source", () => {
    const json = JSON.stringify([{ name: "C", email: "c@d.com" }]);
    const result = normalizeContactRows(json);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("C");
  });

  it("skips empty contacts", () => {
    const result = normalizeContactRows([{ email: "", phone: "", name: "" }]);
    expect(result).toHaveLength(0);
  });

  it("handles firstName/lastName concatenation", () => {
    const result = normalizeContactRows([{ firstName: "John", lastName: "Doe", email: "jd@x.com" }]);
    expect(result[0].name).toBe("John Doe");
  });
});

// ─── extractContactsFromText ────────────────────────────────────────────────
describe("extractContactsFromText", () => {
  it("extracts emails and phones from text", () => {
    const text = "Contact: admin@site.org or call +86 138 0000 1234";
    const result = extractContactsFromText(text);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].email).toBe("admin@site.org");
  });

  it("returns empty array for no contacts", () => {
    expect(extractContactsFromText("no contacts here")).toEqual([]);
  });
});

// ─── normalizeDocumentRows ──────────────────────────────────────────────────
describe("normalizeDocumentRows", () => {
  it("normalizes documents with url/name", () => {
    const result = normalizeDocumentRows([
      { url: "http://a.com/file.pdf", name: "Doc A" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("http://a.com/file.pdf");
    expect(result[0].name).toBe("Doc A");
  });

  it("deduplicates by url+name key", () => {
    const result = normalizeDocumentRows([
      { url: "http://a.com/f.pdf", name: "F" },
      { href: "http://a.com/f.pdf", title: "F" },
    ]);
    expect(result).toHaveLength(1);
  });

  it("derives name from url basename when name missing", () => {
    const result = normalizeDocumentRows([{ url: "http://x.com/path/doc.pdf?v=1" }]);
    expect(result[0].name).toBe("doc.pdf");
  });

  it("parses JSON string source", () => {
    const json = JSON.stringify([{ link: "http://b.com/x.docx", fileName: "X" }]);
    const result = normalizeDocumentRows(json);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("http://b.com/x.docx");
    expect(result[0].name).toBe("X");
  });

  it("skips empty docs", () => {
    expect(normalizeDocumentRows([{ url: "", name: "" }])).toHaveLength(0);
  });
});

// ─── maskPhone ──────────────────────────────────────────────────────────────
describe("maskPhone", () => {
  it("masks middle digits for long phones", () => {
    expect(maskPhone("13812345678")).toBe("138****5678");
  });

  it("masks short phones with prefix only", () => {
    expect(maskPhone("12345")).toBe("12****");
  });

  it("returns empty for falsy", () => {
    expect(maskPhone("")).toBe("");
    expect(maskPhone(null)).toBe("");
  });
});

// ─── maskEmail ──────────────────────────────────────────────────────────────
describe("maskEmail", () => {
  it("masks email keeping first 2 chars and domain", () => {
    expect(maskEmail("alice@example.com")).toBe("al***@example.com");
  });

  it("handles single char before @", () => {
    expect(maskEmail("a@b.com")).toBe("a***@b.com");
  });

  it("returns *** for invalid email", () => {
    expect(maskEmail("noemail")).toBe("***");
  });

  it("returns empty for falsy", () => {
    expect(maskEmail("")).toBe("");
    expect(maskEmail(null)).toBe("");
  });
});

// ─── splitListField ─────────────────────────────────────────────────────────
describe("splitListField", () => {
  it("splits by comma, Chinese comma, semicolons", () => {
    expect(splitListField("A,B，C、D;E；F")).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  it("trims whitespace and filters empty", () => {
    expect(splitListField("  A , , B  ")).toEqual(["A", "B"]);
  });

  it("returns empty array for falsy", () => {
    expect(splitListField("")).toEqual([]);
    expect(splitListField(null)).toEqual([]);
  });
});
