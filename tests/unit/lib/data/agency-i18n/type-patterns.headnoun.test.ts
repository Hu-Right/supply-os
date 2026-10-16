/**
 * 第三轮：按“头名词”精准归桶（逐条取自人工审读的真实 RAW 名），映射到既有 typeKey。
 * 这些规则置于数组最末，只兜住未被上方命中的，不影响既有归桶（另附回归哨兵）。
 */
import { describe, it, expect } from "vitest";
import { classifyAgencyType } from "@/lib/services/agency/index";

describe("classifyAgencyType — 头名词精准归桶（第三轮）", () => {
  const cases: Array<[string, string]> = [
    // 司法/行政职能机关 → 各部门（通用、不错标）
    ["DEFENSORIA PUBLICA DO ESTADO DE SAO PAULO", "DEPARTAMENTO_BR"],
    ["DEFENSORIA PUBLICA DA UNIAO", "DEPARTAMENTO_BR"],
    ["ADVOCACIA-GERAL DO ESTADO", "DEPARTAMENTO_BR"],
    ["PERICIA OFICIAL DO ESTADO DE ALAGOAS", "DEPARTAMENTO_BR"],
    ["SUPERINTENDENCIA DOS SERVICOS PENITENCIARIOS", "DEPARTAMENTO_BR"],
    ["COORDENADORIA DE FOMENTO A IRRIGACAO", "DEPARTAMENTO_BR"],
    ["ADMINISTRACAO DOS PORTOS DE PARANAGUA E ANTONINA", "DEPARTAMENTO_BR"],
    ["GABINETE DO GOVERNADOR DO ESTADO DA BAHIA", "DEPARTAMENTO_BR"],
    // 水务监管局：应优先落“环卫/水务”，不被通用部门抢（验证复数 ESGOTOS 修复）
    ["SUPERINTENDENCIA DE AGUA, ESGOTOS E MEIO AMBIENTE DE VOTUPORANGA", "SANEAMENTO_BR"],
    ["SAAEDOCO SERVICO AUTONOMO DE AGUA E ESGOTOS DE DOIS CORREGOS", "SANEAMENTO_BR"],
    // 自治机构 → 各局
    ["AUTARQUIA MUNICIPAL DE TURISMO - GRAMADOTUR", "AGENCIA_BR"],
    ["ENTIDADE AUTARQUICA DE ASSISTENCIA TECNICA E EXTENSAO RURAL DO ESTADO DE RONDONIA", "AGENCIA_BR"],
    // 市际联合体（含缩写前缀、mid-string）
    ["CONSIRC - CONSORCIO PUBLICO INTERMUNICIPAL DE SAUDE DA REGIAO DE CATANDUVA", "CONSORCIO_BR"],
    ["CONVALES - CONSORCIO DE SAUDE E DESENVOLVIMENTO DOS VALES DO NOROESTE DE MINAS", "CONSORCIO_BR"],
    // 高校/学院（“Colégio Pedro II” 类具名名校→走人工入表，不入泛桶）
    ["FACULDADE DE MEDICINA DE JUNDIAI", "COLLEGE_INTL"],
    // 立法机关（泛指的地方议会；SENADO FEDERAL/CAMARA DOS DEPUTADOS 属具名实体→走人工入表，不入泛桶）
    ["BALNEARIO PINHAL LEGISLATIVO MUNICIPAL", "CONGRESS_INTL"],
    // 商业登记局
    ["JUNTA COMERCIAL DO ESTADO DA BAHIA", "BOARD_INTL"],
    // 养老/社保基金 → 基金桶
    ["LEMEPREV INSTITUTO DE PREVIDENCIA DO MUNICIPIO DE LEME", "FUNDO_BR"],
    ["CAIXA DE APOSENTADORIA E PENSAO DOS SERVIDORES MUNICIPAIS DE SARANDI", "FUNDO_BR"],
    ["REGIME PROPRIO DE PREVIDENCIA SOCIAL - RPPS", "FUNDO_BR"],
  ];
  for (const [name, typeKey] of cases) {
    it(`${name} → ${typeKey}`, () => {
      expect(classifyAgencyType(name)?.typeKey).toBe(typeKey);
    });
  }

  it("回归哨兵：既有归桶不被破坏", () => {
    expect(classifyAgencyType("MUNICIPIO DE TARUMA")?.typeKey).toBe("MUNICIPIO_BR");
    expect(classifyAgencyType("BANCO CENTRAL DO BRASIL")?.typeKey).toBe("BANK_INTL");
    expect(classifyAgencyType("POLICIA MILITAR")?.typeKey).toBe("POLICE_INTL");
  });
});
