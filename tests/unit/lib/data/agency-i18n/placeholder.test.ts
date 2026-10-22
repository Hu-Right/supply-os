import { describe, expect, it } from "vitest";
import { isAgencyPlaceholder } from "@/lib/services/agency/placeholder";

describe("isAgencyPlaceholder", () => {
  it("识别采购平台占位名", () => {
    expect(isAgencyPlaceholder("SAM")).toBe(true);
    expect(isAgencyPlaceholder("eprocure_gov_in")).toBe(true);
    expect(isAgencyPlaceholder("Operator SEAP")).toBe(true);
    expect(isAgencyPlaceholder("Mongolia e-Procurement System (tender.gov.mn)")).toBe(true);
  });

  it("不把真实机构当平台", () => {
    expect(isAgencyPlaceholder("Ministry of Health")).toBe(false);
    expect(isAgencyPlaceholder("City of Saskatoon")).toBe(false);
    expect(isAgencyPlaceholder("UNDP")).toBe(false);
  });
});
