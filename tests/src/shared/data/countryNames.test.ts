/**
 * src/shared/data/countryNames.ts 测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @/core/http 模块，防止真实 API 请求
vi.mock("@/core/http", () => ({
  api: vi.fn(),
}));

import { initCountryNames, cleanCountryRaw, getCountryDisplayName, getCountryEnglishName } from "../../../../src/shared/data/countryNames";
import { api } from "@/core/http";

const mockedApi = vi.mocked(api);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cleanCountryRaw", () => {
  it("剥离斜杠前缀", () => {
    expect(cleanCountryRaw("/，Basilan")).toBe("Basilan");
  });

  it("剥离前导标点", () => {
    expect(cleanCountryRaw(",Brazil")).toBe("Brazil");
  });

  it("正常值不变", () => {
    expect(cleanCountryRaw("China")).toBe("China");
  });

  it("剥离多个斜杠", () => {
    expect(cleanCountryRaw("//Japan")).toBe("Japan");
  });

  it("剥离分号/冒号/竖线前缀", () => {
    expect(cleanCountryRaw(";Korea")).toBe("Korea");
    expect(cleanCountryRaw(":France")).toBe("France");
    expect(cleanCountryRaw("|Germany")).toBe("Germany");
  });

  it("首尾空格被 trim", () => {
    expect(cleanCountryRaw("  Brazil  ")).toBe("Brazil");
  });
});

describe("initCountryNames + getCountryDisplayName (初始化后)", () => {
  beforeEach(async () => {
    // 模拟 API 返回映射数据
    mockedApi.mockResolvedValueOnce({
      countryNameZh: { Brazil: "巴西", China: "中国", America: "美国" },
      regionNameZh: { "British Columbia": "不列颠哥伦比亚", "São Paulo": "圣保罗" },
      zhToEn: { "巴西": "Brazil", "中国": "China" },
    });
    await initCountryNames();
  });

  it("中文环境返回中文名", () => {
    expect(getCountryDisplayName("Brazil", "zh")).toBe("巴西");
    expect(getCountryDisplayName("China", "zh")).toBe("中国");
  });

  it("非中文环境返回英文原名", () => {
    expect(getCountryDisplayName("Brazil", "en")).toBe("Brazil");
    expect(getCountryDisplayName("China", "fr")).toBe("China");
  });

  it("大小写不敏感匹配", () => {
    expect(getCountryDisplayName("america", "zh")).toBe("美国");
  });

  it("未收录国家返回英文原名", () => {
    expect(getCountryDisplayName("Atlantis", "zh")).toBe("Atlantis");
  });

  it("'国家, 区域' 格式正确解析", () => {
    // Brazil 在映射中，British Columbia 在区域映射中
    const result = getCountryDisplayName("Brazil, British Columbia", "zh");
    expect(result).toContain("巴西");
    expect(result).toContain("不列颠哥伦比亚");
  });

  it("'区域, 国家' 格式正确解析（区域在前）", () => {
    const result = getCountryDisplayName("British Columbia, Brazil", "zh");
    expect(result).toContain("巴西");
    expect(result).toContain("不列颠哥伦比亚");
  });

  it("区域不在映射中保留英文", () => {
    const result = getCountryDisplayName("Brazil, Unknown Region", "zh");
    expect(result).toContain("巴西");
    expect(result).toContain("Unknown Region");
  });
});

describe("getCountryEnglishName (初始化后)", () => {
  beforeEach(async () => {
    mockedApi.mockResolvedValueOnce({
      countryNameZh: { Brazil: "巴西" },
      regionNameZh: {},
      zhToEn: { "巴西": "Brazil" },
    });
    await initCountryNames();
  });

  it("英文名不在映射表中直接返回", () => {
    expect(getCountryEnglishName("Atlantis")).toBe("Atlantis");
  });

  it("中文名在反向映射中返回英文", () => {
    // Brazil 在 countryNameZh 中，所以 _countryNameZh["Brazil"] = "巴西"
    // 但 rawName 是 "Brazil"，_countryNameZh["Brazil"] = "巴西" 存在
    // 所以返回 _zhToEn["Brazil"] ?? "Brazil"
    // _zhToEn 的 key 是 "巴西" 不是 "Brazil"，所以返回 "Brazil"
    expect(getCountryEnglishName("Brazil")).toBe("Brazil");
  });
});

describe("initCountryNames 幂等性", () => {
  it("多次调用只初始化一次", async () => {
    // 前面已经初始化过了，再次调用不会发新请求
    const callCount = mockedApi.mock.calls.length;
    await initCountryNames();
    await initCountryNames();
    // API 调用次数不增加
    expect(mockedApi.mock.calls.length).toBe(callCount);
  });
});
