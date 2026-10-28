import { describe, it, expect, beforeEach } from "vitest";
import { needsTranslationFix, buildZhFromKeywords, extractCountryFromName } from "@/lib/services/notice-search/agencies/translate";
import { translateByPattern } from "@/lib/data/agency-i18n/translate";
import { KNOWN_ACRONYMS } from "@/lib/data/agency-i18n/known-acronyms";
import { __setCountryDisplaySnapshotForTest } from "@/lib/services/country/display";
import type { CountryAliasEntry } from "@/lib/services/country/alias-store";

// extractCountryFromName 已改为表驱动（matchCountryZhInText + countryZhOf）；注入含常用国家的最小快照。
beforeEach(() => {
  const mk = (canonical: string, zh: string): CountryAliasEntry => ({ canonical, code: null, kind: "country", zh });
  __setCountryDisplaySnapshotForTest({
    byKey: new Map([
      ["BR", mk("Brazil", "巴西")],
      ["BRAZIL", mk("Brazil", "巴西")],
      ["CHINA", mk("China", "中国")],
      ["JAPAN", mk("Japan", "日本")],
    ]),
    formsByCanonical: new Map(),
  });
});

describe("needsTranslationFix", () => {
  it("undefined → true", () => {
    expect(needsTranslationFix(undefined, "UNDP")).toBe(true);
  });

  it("翻译 === 机构名 → true（无意义翻译）", () => {
    expect(needsTranslationFix("UNDP", "UNDP")).toBe(true);
  });

  it("英文字符 > 中文字符 → true（翻译偏英文）", () => {
    expect(needsTranslationFix("United Nations Dev", "UNDP")).toBe(true);
  });

  it("含 4+ 连续英文字母 → true", () => {
    expect(needsTranslationFix("联合国Development Programme", "UNDP")).toBe(true);
  });

  it("纯中文 → false", () => {
    expect(needsTranslationFix("联合国开发计划署", "UNDP")).toBe(false);
  });
});

describe("buildZhFromKeywords", () => {
  it("Committee → 委员会", () => {
    expect(buildZhFromKeywords("National Planning Committee")).toBe("委员会");
  });

  it("Ministry → 部", () => {
    expect(buildZhFromKeywords("Ministry of Finance")).toBe("部");
  });

  it("University → 大学", () => {
    expect(buildZhFromKeywords("Harbin University")).toBe("大学");
  });

  it("无匹配关键词 → null", () => {
    expect(buildZhFromKeywords("Random Organization")).toBeNull();
  });
});

describe("extractCountryFromName", () => {
  it("含 CHINA → 中国", () => {
    expect(extractCountryFromName("Ministry of CHINA Finance")).toBe("中国");
  });

  it("含 BRAZIL → 巴西", () => {
    expect(extractCountryFromName("Brazil National Bank")).toBe("巴西");
  });

  it("含 JAPAN → 日本", () => {
    expect(extractCountryFromName("JAPAN Water Authority")).toBe("日本");
  });

  it("无国家关键词 → null", () => {
    expect(extractCountryFromName("International Committee")).toBeNull();
  });

  it("GOV 后缀匹配 → 国家", () => {
    expect(extractCountryFromName("AGENCY.GOV.BR")).toBe("巴西");
  });
});

describe("translateByPattern — 平台代码占位 agency（2026-10-12 公告列表露码修复）", () => {
  it("平台代码不再由机构模块命名（已收敛到 platform_aliases）→ 原样回显", () => {
    expect(translateByPattern("mercadopublico_cl")?.i18n?.zh).toBe("mercadopublico_cl");
    expect(translateByPattern("SPAIN_PCSP")?.i18n?.zh).toBe("SPAIN_PCSP");
  });

  it("聚合键字面量（正则自匹配不到的）→ TYPE_PATTERNS 同名翻译", () => {
    expect(translateByPattern("MUNICIPIO_BR")?.i18n?.zh).toBe("巴西各市政府");
    expect(translateByPattern("UN_SYSTEM")?.i18n?.zh).toBe("联合国系统");
    expect(translateByPattern("MINISTRY_INTL")?.i18n?.zh).toBe("各国部委");
  });

  it("正则可自匹配的聚合键不注册，保持原类型桶聚合路径", () => {
    expect(KNOWN_ACRONYMS.has("COUNTY_KE")).toBe(false);
    expect(KNOWN_ACRONYMS.has("TRIBUNAL_BR")).toBe(false);
    expect(KNOWN_ACRONYMS.has("EMPRESA_BR")).toBe(false);
  });

  it("真实机构不受影响：UNDP 精确缩写仍命中", () => {
    expect(translateByPattern("UNDP")?.i18n?.zh).toBe("联合国开发计划署");
  });

  it("裸代码条目不吞爱尔兰别名：IRELAND ETENDERS 交回 DB 别名表管线处理", () => {
    // 爱尔兰译名由 query.ts stage 1 的 agency_aliases 查询给出，
    // translateByPattern 对它走通用兜底即可，关键是不得误配南非名。
    expect(translateByPattern("IRELAND ETENDERS")?.i18n?.zh).not.toBe("南非电子招标网");
  });
});

describe("translateByPattern — TYPE_KEYWORDS 兜底（统一中文 2026-10-28：留名不译，不再删词拼接）", () => {
  const zh = (s: string) => translateByPattern(s)?.i18n?.zh ?? null;
  it("类型词居中：不删词、不产中英混合，留名不译（i18n null → 上层回落类型分类）", () => {
    expect(translateByPattern("National University Corporation")?.i18n).toBeNull();
    expect(zh("Department of National Defence (DND)")).toBeNull();
  });
  it("整名恰为类型词 → 纯中文类型词", () => {
    expect(zh("UNIVERSITY")).toBe("大学");
  });
});

describe("translateByPattern — 巴西机构中文准确性（重锚后禁硬造/错译）", () => {
  const zh = (s: string) => translateByPattern(s)?.i18n?.zh;
  it("COMANDO DO EXERCITO → 陆军司令部", () => expect(zh("COMANDO DO EXERCITO")).toBe("陆军司令部"));
  it("FUNDO MUNICIPAL DE SAUDE → 市政卫生基金", () => expect(zh("FUNDO MUNICIPAL DE SAUDE")).toBe("市政卫生基金"));
  it("SECRETARIA MUNICIPAL DE SAUDE → 市卫生厅（不得再误判为教育）", () => expect(zh("SECRETARIA MUNICIPAL DE SAUDE")).toBe("市卫生厅"));
  it("SECRETARIA MUNICIPAL DE EDUCACAO → 市教育厅（教育类仍对）", () => expect(zh("SECRETARIA MUNICIPAL DE EDUCACAO")).toBe("市教育厅"));
  it("SECRETARIA DE ESTADO DA SAUDE → 卫生厅", () => expect(zh("SECRETARIA DE ESTADO DA SAUDE")).toBe("卫生厅"));
  it("TRIBUNAL SUPERIOR DO TRABALHO → 高级劳动法院", () => expect(zh("TRIBUNAL SUPERIOR DO TRABALHO")).toBe("高级劳动法院"));
  it("UNIVERSIDADE DE SAO PAULO → SAO PAULO大学（冠词剔除、地名不臆造）", () => expect(zh("UNIVERSIDADE DE SAO PAULO")).toBe("SAO PAULO大学"));
  it("FUNDO MUNICIPAL DE EDUCAÇÃO（带重音）→ 折叠后命中 教育", () => expect(zh("FUNDO MUNICIPAL DE EDUCAÇÃO")).toBe("市政教育基金"));
  it("MUNICIPIO DE TARUMA → TARUMA市", () => expect(zh("MUNICIPIO DE TARUMA")).toBe("TARUMA市"));
});
