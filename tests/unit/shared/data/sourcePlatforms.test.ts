import { describe, it, expect } from "vitest";
import { matchSourcePlatform, getSourcePlatformName } from "@/shared/data/sourcePlatforms";

describe("matchSourcePlatform", () => {
  it("host 精确匹配", () => {
    expect(matchSourcePlatform("https://ted.europa.eu/notices/x")?.name).toBe("TED");
    expect(matchSourcePlatform("https://sam.gov/search")?.name).toBe("SAM.gov");
  });

  it("www. 前缀自动剥离", () => {
    expect(matchSourcePlatform("https://www.ungm.org/Public/Notice")?.name).toBe("UNGM");
  });

  it("子域按最长后缀匹配（兼容具体部署子域）", () => {
    expect(matchSourcePlatform("https://public.mtender.gov.md/tenders/x")?.name).toBe("MTender");
    expect(matchSourcePlatform("https://tenders.procurement.gov.ge/x")?.name).toBe("Ge-GP");
    expect(matchSourcePlatform("https://docs.ejn.gov.ba/x")?.name).toBe("EJN");
    expect(matchSourcePlatform("https://process5.gprocurement.go.th/x")?.name).toBe("Thai e-GP");
  });

  it("host 含 key 但非其后缀关系不误匹配", () => {
    expect(matchSourcePlatform("https://notsam.gov/x")).toBeNull();
    expect(matchSourcePlatform("https://sam.gov.evil.io/x")).toBeNull();
  });

  it("未收录域名 / 空 / 非法 URL → null", () => {
    expect(matchSourcePlatform("https://example.com/x")).toBeNull();
    expect(matchSourcePlatform("")).toBeNull();
    expect(matchSourcePlatform(undefined)).toBeNull();
    expect(matchSourcePlatform("not a url")).toBeNull();
  });

  it("历史 9 平台全部可解析（回归）", () => {
    const urls = [
      "https://ungm.org/x", "https://etimad.sa/x", "https://gem.gov.in/x",
      "https://compranet.gob.mx/x", "https://nupco.com/x", "https://sam.gov/x",
      "https://ted.europa.eu/x", "https://undp.org/x", "https://seha.ae/x",
    ];
    for (const url of urls) {
      expect(matchSourcePlatform(url), url).not.toBeNull();
    }
  });
});

describe("getSourcePlatformName", () => {
  it("zh 返回「中文名（简称）」", () => {
    expect(getSourcePlatformName("https://pncp.gov.br/x", "zh")).toBe("巴西国家采购网（PNCP）");
  });

  it("非 zh 返回官方简称", () => {
    expect(getSourcePlatformName("https://pncp.gov.br/x", "en")).toBe("PNCP");
    expect(getSourcePlatformName("https://sam.gov/x", "fr")).toBe("SAM.gov");
  });

  it("中文名缺省时 zh 也仅返回简称", () => {
    expect(getSourcePlatformName("https://seha.ae/x", "zh")).toBe("Seha");
  });

  it("未收录域名返回空串", () => {
    expect(getSourcePlatformName("https://example.com/x", "zh")).toBe("");
  });
});
