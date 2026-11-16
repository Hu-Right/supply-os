import { describe, it, expect } from "vitest";
import {
  COUNTRY_CODES,
  countryName,
  countryOptions,
  guessCountryCode,
} from "@/shared/constants/countries";

describe("shared/constants/countries", () => {
  it("代码表覆盖主要国家", () => {
    expect(COUNTRY_CODES.length).toBeGreaterThan(240);
    expect(COUNTRY_CODES).toContain("CN");
    expect(COUNTRY_CODES).toContain("US");
    expect(COUNTRY_CODES).toContain("KE");
  });

  it("代码按语言出名称", () => {
    expect(countryName("CN", "zh")).toBe("中国");
    expect(countryName("CN", "en")).toBe("China");
    expect(countryName("US", "zh")).toBe("美国");
  });

  it("名称/代码都能归一成代码", () => {
    expect(guessCountryCode("CN")).toBe("CN");
    expect(guessCountryCode("中国")).toBe("CN");
    expect(guessCountryCode("China")).toBe("CN");
    expect(guessCountryCode("United States")).toBe("US");
    expect(guessCountryCode("肯尼亚")).toBe("KE");
    expect(guessCountryCode("不存在的国家")).toBeNull();
  });

  it("下拉选项按名称排序且带代码", () => {
    const options = countryOptions("zh");
    expect(options.length).toBe(COUNTRY_CODES.length);
    expect(options[0]).toHaveProperty("code");
    expect(options.find((o) => o.code === "CN")?.name).toBe("中国");
  });
});
