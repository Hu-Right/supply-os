/**
 * 缩写前缀的词尾边界回归（统一中文·2026-10-29）。
 *
 * 起因：真库只读探针在 notice_public.buyer_name 上实录到两类「前 4 个字母被当缩写吃掉」的残缺名
 * （见 runtime/probe-c-registry.ts 输出）——
 *   "Conseil Départemental de la Charente"   → "eil Départemental de la Charente联合体"
 *   "Institution de Gestion Sociale des Armées - IGESA" → "itution de Gestion … - IGESA研究所"
 * 根因是 BR_EXTRA_PREFIX_MAP 里 `CONS\.?` / `INST(?:\.|ITUTO)?` 这类条目同时满足两个条件：
 * 带 /i（于是小写也算缩写）+ 没有词尾边界（于是后面还能接字母）。专有名词被从中间切开，
 * 比不翻译更糟——卡片/详情上直接显示残缺字符串。
 *
 * 因此两头都要钉住：A 组钉「不得再产出残缺名」，B 组钉「真缩写形态仍须命中」，
 * 防止只删不立把 CONDERG/CONS./INST. 这些巴西联合体与研究所的正常形态一起否掉。
 */
import { describe, it, expect } from "vitest";
import { translateByPattern } from "@/lib/data/agency-i18n/translate";
import { classifyAgencyType } from "@/lib/services/agency/index";

const zh = (name: string) => translateByPattern(name)?.i18n?.zh ?? "";

describe("translateByPattern — 缩写前缀不得吃掉词首（真库探针实录）", () => {
  it("法语省议会不再被当成 CONS 缩写（残缺断言）", () => {
    const out = zh("Conseil Départemental de la Charente");
    expect(out).not.toBe("eil Départemental de la Charente联合体");
    expect(out).not.toMatch(/^eil\b/);
    // 要么整词保留原文，要么给出含完整原名的可读结果——绝不能少字母
    expect(out).not.toMatch(/联合体$/);
  });

  it("法语社会管理机构不再被当成 INST 缩写（残缺断言）", () => {
    const out = zh("Institution de Gestion Sociale des Armées - IGESA");
    expect(out).not.toMatch(/^itution\b/);
    expect(out).not.toMatch(/研究所$/);
  });

  it("意大利地名 Cisterna 不再被当成 CIS 缩写（残缺断言）", () => {
    const out = zh("Cisterna Municipale");
    expect(out).not.toBe("Municipale联合体");
    expect(out).not.toMatch(/^Municipale/);
  });
});

describe("translateByPattern — 真缩写形态仍须命中（防止修过头）", () => {
  it("CONS. DE DESENV. → 联合体", () => {
    const out = zh("CONS. DE DESENV. DO NOROESTE MINAS");
    expect(out).toContain("NOROESTE MINAS");
    expect(out.endsWith("联合体")).toBe(true);
  });

  it("CISAMP 全大写缩写 → 联合体", () => {
    const out = zh("CISAMP INTERMUNICIPAL DE SAUDE BONSUCESSO");
    expect(out).toContain("BONSUCESSO");
    expect(out.endsWith("联合体")).toBe(true);
  });

  it("CONDERG → 联合体", () => {
    const out = zh("CONDERG DE RESIDUOS SOLIDOS");
    expect(out).toContain("RESIDUOS SOLIDOS");
    expect(out.endsWith("联合体")).toBe(true);
  });

  it("INST. NAC. → 研究所", () => {
    const out = zh("INST. NAC. DE TELECOMUNICACOES");
    expect(out).toContain("TELECOMUNICACOES");
    expect(out.endsWith("研究所")).toBe(true);
  });

  it("INSTITUTO 完整词 → 研究所（BR_PREFIX_MAP 覆盖，此处仅作回归保护）", () => {
    const out = zh("INSTITUTO FEDERAL DE EDUCACAO");
    expect(out).toContain("FEDERAL DE EDUCACAO");
    expect(out.endsWith("研究所")).toBe(true);
  });
});

/**
 * 归桶侧的同根问题：classifyAgencyType 的 /^CONSORCIO|^CIS[A-Z]/i 也会把以 cis 开头的
 * 非巴西专名归进「巴西各市联合体」。拆成两条后，缩写那条必须区分大小写。
 */
describe("classifyAgencyType — CIS 缩写归桶不得吃进小写词", () => {
  it("全大写 CISxxxx 仍归联合体桶", () => {
    expect(classifyAgencyType("CISAMP INTERMUNICIPAL DE SAUDE")?.typeKey).toBe("CONSORCIO_BR");
    expect(classifyAgencyType("CONSORCIO INTERMUNICIPAL DE SAUDE")?.typeKey).toBe("CONSORCIO_BR");
  });

  it("意大利地名 Cisterna 不再误归巴西联合体桶", () => {
    expect(classifyAgencyType("Cisterna Municipale")?.typeKey).not.toBe("CONSORCIO_BR");
  });
});
