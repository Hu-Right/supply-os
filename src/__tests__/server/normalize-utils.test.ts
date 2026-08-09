// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  normalizeContactRows,
  extractContactsFromText,
  normalizeDocumentRows,
  normalizeUserKey,
} from "../../../server/utils/normalize";

describe("normalizeContactRows", () => {
  it("returns empty array for no input", () => {
    expect(normalizeContactRows()).toEqual([]);
  });

  it("returns empty array for null", () => {
    expect(normalizeContactRows(null)).toEqual([]);
  });

  it("accepts array of contact objects", () => {
    const input = [{ name: "John", email: "john@test.com", phone: "123" }];
    const result = normalizeContactRows(input);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("John");
    expect(result[0].email).toBe("john@test.com");
  });

  it("accepts JSON string input", () => {
    const input = JSON.stringify([{ name: "Jane", email: "jane@test.com" }]);
    const result = normalizeContactRows(input);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Jane");
  });

  it("deduplicates by email+phone+name", () => {
    const input = [
      { name: "John", email: "john@test.com", phone: "123" },
      { name: "John", email: "john@test.com", phone: "123" },
    ];
    expect(normalizeContactRows(input)).toHaveLength(1);
  });

  it("handles alternative field names", () => {
    const input = [{ person: "Bob", mail: "bob@test.com", tel: "456" }];
    const result = normalizeContactRows(input);
    expect(result[0].name).toBe("Bob");
    expect(result[0].email).toBe("bob@test.com");
    expect(result[0].phone).toBe("456");
  });

  it("skips empty contacts", () => {
    const input = [{}, { name: "Valid", email: "valid@test.com" }];
    expect(normalizeContactRows(input)).toHaveLength(1);
  });

  it("handles firstName/lastName combination", () => {
    const input = [{ firstName: "John", lastName: "Doe", email: "john@test.com" }];
    const result = normalizeContactRows(input);
    expect(result[0].name).toBe("John Doe");
  });

  it("handles multiple sources", () => {
    const source1 = [{ name: "A", email: "a@test.com" }];
    const source2 = [{ name: "B", email: "b@test.com" }];
    const result = normalizeContactRows(source1, source2);
    expect(result).toHaveLength(2);
  });
});

describe("extractContactsFromText", () => {
  it("extracts emails from text", () => {
    const text = "Contact us at john@example.com or jane@test.com";
    const result = extractContactsFromText(text);
    expect(result).toHaveLength(2);
    expect(result[0].email).toBe("john@example.com");
    expect(result[1].email).toBe("jane@test.com");
  });

  it("extracts phone numbers from text", () => {
    const text = "Call +1-234-567-8900 or (555) 123-4567";
    const result = extractContactsFromText(text);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty array for text without contacts", () => {
    const result = extractContactsFromText("No contacts here");
    expect(result).toHaveLength(0);
  });

  it("sets name and title to empty strings", () => {
    const text = "Email: test@example.com";
    const result = extractContactsFromText(text);
    expect(result[0].name).toBe("");
    expect(result[0].title).toBe("");
  });
});

describe("normalizeDocumentRows", () => {
  it("returns empty array for no input", () => {
    expect(normalizeDocumentRows()).toEqual([]);
  });

  it("accepts array of document objects", () => {
    const input = [{ url: "https://example.com/file.pdf", name: "File" }];
    const result = normalizeDocumentRows(input);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("https://example.com/file.pdf");
  });

  it("extracts name from URL if missing", () => {
    const input = [{ url: "https://example.com/docs/report.pdf" }];
    const result = normalizeDocumentRows(input);
    expect(result[0].name).toBe("report.pdf");
  });

  it("handles alternative field names", () => {
    const input = [{ href: "https://example.com/file.pdf", title: "Document" }];
    const result = normalizeDocumentRows(input);
    expect(result[0].url).toBe("https://example.com/file.pdf");
    expect(result[0].name).toBe("Document");
  });

  it("deduplicates by url+name", () => {
    const input = [
      { url: "https://example.com/file.pdf", name: "File" },
      { url: "https://example.com/file.pdf", name: "File" },
    ];
    expect(normalizeDocumentRows(input)).toHaveLength(1);
  });

  it("skips empty documents", () => {
    const input = [{}, { url: "https://example.com/file.pdf" }];
    expect(normalizeDocumentRows(input)).toHaveLength(1);
  });
});

describe("normalizeUserKey", () => {
  it("returns null for null", () => {
    expect(normalizeUserKey(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(normalizeUserKey(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizeUserKey("")).toBeNull();
  });

  it("returns null for 'guest'", () => {
    expect(normalizeUserKey("guest")).toBeNull();
  });

  it("returns null for 'GUEST' (case insensitive)", () => {
    expect(normalizeUserKey("GUEST")).toBeNull();
  });

  it("normalizes to lowercase", () => {
    expect(normalizeUserKey("User@Test.com")).toBe("user@test.com");
  });

  it("trims whitespace", () => {
    expect(normalizeUserKey("  user@test.com  ")).toBe("user@test.com");
  });

  it("truncates to 190 characters", () => {
    const longKey = "a".repeat(200);
    const result = normalizeUserKey(longKey);
    expect(result).toHaveLength(190);
  });

  it("handles valid user key", () => {
    expect(normalizeUserKey("user123")).toBe("user123");
  });
});
