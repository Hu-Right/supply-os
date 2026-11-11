import { describe, expect, it } from "vitest";
import { isAgencyPlaceholder } from "@/lib/services/agency/placeholder";

describe("isAgencyPlaceholder", () => {
  it("识别采购平台占位名", () => {
    expect(isAgencyPlaceholder("SAM")).toBe(true);
    expect(isAgencyPlaceholder("eprocure_gov_in")).toBe(true);
    expect(isAgencyPlaceholder("Operator SEAP")).toBe(true);
    expect(isAgencyPlaceholder("Mongolia e-Procurement System (tender.gov.mn)")).toBe(true);
  });

  it("识别爬虫噪声名（2026-10-30 剔除口径）", () => {
    expect(isAgencyPlaceholder("Error 500 (Server Error)!!1")).toBe(true);
    expect(isAgencyPlaceholder("Nonprofit organization")).toBe(true);
    expect(isAgencyPlaceholder("https://etenders.gov.za/notice/123")).toBe(true);
    expect(isAgencyPlaceholder("www.example.com")).toBe(true);
    expect(isAgencyPlaceholder("113")).toBe(true);
    expect(isAgencyPlaceholder("2026/001")).toBe(true);
    expect(isAgencyPlaceholder("bad\u0007name")).toBe(true);
  });

  it("识别整句式假机构名（2026-11-11 剔除口径）", () => {
    // LLM/机翻污染的句子被写进 agency 字段
    expect(isAgencyPlaceholder("The Bible is a book of scriptures")).toBe(true);
    expect(isAgencyPlaceholder("The local authority is a blessing.")).toBe(true);
    expect(isAgencyPlaceholder("A common disease is waiting")).toBe(true);
    expect(isAgencyPlaceholder("The following is the list of the companies:")).toBe(true);
    expect(isAgencyPlaceholder("The first is the \"Medicine of the World\"")).toBe(true);
    expect(isAgencyPlaceholder("To the Canton Hospital \"Dr. Irfan Ljubljanić\" will be")).toBe(true);
    expect(isAgencyPlaceholder("There are two groups of people.")).toBe(true);
  });

  it("法定名壳与登记码前缀不判噪声（引号内是真名）", () => {
    expect(isAgencyPlaceholder('COMMUNALNÉ PIDPRIEMSTVO " ZVYAGELSKA BAGATOPROFILNYA LIKARNYA "')).toBe(false);
    expect(isAgencyPlaceholder('PIDPRIEMSTVO of the COMMUNAL NECOMERCY " LISYANSKIY CENTRE"')).toBe(false);
  });

  it("不把真实机构当平台", () => {
    expect(isAgencyPlaceholder("Ministry of Health")).toBe(false);
    expect(isAgencyPlaceholder("City of Saskatoon")).toBe(false);
    expect(isAgencyPlaceholder("UNDP")).toBe(false);
    expect(isAgencyPlaceholder("The Netherlands Enterprise Agency")).toBe(false);
    expect(isAgencyPlaceholder("Banca Nationala a Romaniei")).toBe(false);
    // 专名含数字/标点不误伤
    expect(isAgencyPlaceholder("3M Company")).toBe(false);
    expect(isAgencyPlaceholder("40/024 - UOC CRV")).toBe(false);
  });
});
