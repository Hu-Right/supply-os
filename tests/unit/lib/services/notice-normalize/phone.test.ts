import { describe, expect, it } from "vitest";
import { normalizeContacts, normalizePhone } from "@/lib/services/notice-normalize/phone";

describe("normalizePhone", () => {
  it("巴西本地号 → E.164", () => {
    expect(normalizePhone("(61) 2020-1234", "BR")).toMatchObject({ e164: "+556120201234", valid: true });
  });
  it("新加坡 8 位 → +65", () => {
    expect(normalizePhone("63218311", "SG")).toMatchObject({ e164: "+6563218311", valid: true });
  });
  it("美国 +1 → E.164", () => {
    expect(normalizePhone("+1 202 555 0143", "US")).toMatchObject({ e164: "+12025550143", valid: true });
  });
  it("利比里亚带国家码但无 + → +231", () => {
    expect(normalizePhone("231 772883518", "LR")).toMatchObject({ e164: "+231772883518", valid: true });
  });
  it("无效号码保留 raw，valid=false", () => {
    expect(normalizePhone("123", "BR")).toMatchObject({ valid: false, e164: null });
  });
});

describe("normalizeContacts", () => {
  it("从 JSON 抽邮箱/电话，并从正文补邮箱", () => {
    const c = normalizeContacts(
      [{ name: "A", email: "A@Example.com", phone: "(61) 2020-1234" }],
      { contactPhone: "63218311", countryCode: "BR", description: "Contact: b@example.org" },
    );
    expect(c.emails).toEqual(["a@example.com", "b@example.org"]);
    expect(c.phones.map((p) => p.e164)).toContain("+556120201234");
  });
});
