/**
 * ③/④ 长尾归桶扩展单测：未分桶脏名应落入既有 typeKey（不新增桶），
 * 覆盖葡语水务/电力/法院/委员会/部委/军事 与英语 Polytechnic。
 */
import { describe, it, expect } from "vitest";
import { classifyAgencyType } from "@/lib/services/agency/index";

describe("classifyAgencyType — 长尾脏名归桶扩展", () => {
  const cases: Array<[string, string]> = [
    ["SAAE SERVICO AUTONOMO DE AGUA E ESGOTO DE JACAREI", "SANEAMENTO_BR"],
    ["COMUSA - SERVICOS DE AGUA E ESGOTO DE NOVO HAMBURGO", "SANEAMENTO_BR"],
    ["CENTRAIS ELETRICAS DE SANTA CATARINA SA", "ENERGY_INTL"],
    ["PODER JUDICIARIO DO ESTADO DO ESPIRITO SANTO", "COURT_INTL"],
    ["COMISSAO NACIONAL DE ENERGIA NUCLEAR", "COMMISSION_INTL"],
    ["SERGIPE MINISTERIO PUBLICO", "AGENCY_INTL"],
    ["CENTRO UNIVERSITARIO MUNICIPAL DE FRANCA", "UNIVERSITY_INTL"],
    ["Nanyang Polytechnic", "COLLEGE_INTL"],
    ["Republic Polytechnic", "COLLEGE_INTL"],
    ["BRIGADA MILITAR DO ESTADO DO RIO GRANDE DO SUL", "MILITARY_BR"],
    ["COMANDO DA MARINHA", "MILITARY_BR"],
  ];
  for (const [name, typeKey] of cases) {
    it(`${name} → ${typeKey}`, () => {
      expect(classifyAgencyType(name)?.typeKey).toBe(typeKey);
    });
  }

  it("既有归桶不被破坏（回归哨兵）", () => {
    expect(classifyAgencyType("MUNICIPIO DE TARUMA")?.typeKey).toBe("MUNICIPIO_BR");
    expect(classifyAgencyType("POLICIA CIVIL")?.typeKey).toBe("POLICE_INTL");
    expect(classifyAgencyType("BANCO CENTRAL DO BRASIL")?.typeKey).toBe("BANK_INTL");
  });
});
