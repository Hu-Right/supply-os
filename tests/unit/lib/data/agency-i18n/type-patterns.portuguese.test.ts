/**
 * ④ 分流修正：葡/西语政府实体应被 classifyAgencyType 归入既有类型桶，
 * 而非掉到 translateByPattern 造出乱序中文。断言命中既有 typeKey，且不新增桶、不误伤特定机构。
 */
import { describe, it, expect } from "vitest";
import { classifyAgencyType } from "@/lib/services/agency/index";

describe("classifyAgencyType — 葡/西语政府实体归桶", () => {
  const cases: Array<[string, string]> = [
    ["POLICIA MILITAR DO ESTADO DE MINAS GERAIS", "POLICE_INTL"],
    ["POLICIA CIVIL", "POLICE_INTL"],
    ["BANCO CENTRAL DO BRASIL", "BANK_INTL"],
    ["SAO PAULO SECRETARIA MUNICIPAL DE CULTURA", "SECRETARIA_BR"],
    ["PROCURADORIA GERAL DO ESTADO", "AGENCY_INTL"],
    ["CONTROLADORIA GERAL DO ESTADO", "INSPECTORATE_INTL"],
    ["ASSEMBLEIA LEGISLATIVA DO ESTADO DE SANTA CATARINA", "PARLIAMENT_INTL"],
    ["CONSELHO FEDERAL DE ENGENHARIA E AGRONOMIA", "COUNCIL_INTL"],
    ["REDE MUNICIPAL DR. MARIO GATTI DE URGENCIA", "NETWORK_INTL"],
    ["ESCOLA DE SERVICO PUBLICO DO ESPIRITO SANTO", "COLLEGE_INTL"],
    ["JUSTICA FEDERAL DE PRIMEIRA INSTANCIA", "COURT_INTL"],
  ];
  for (const [name, typeKey] of cases) {
    it(`${name} → ${typeKey}`, () => {
      expect(classifyAgencyType(name)?.typeKey).toBe(typeKey);
    });
  }

  it("特定国际机构仍不聚合（返回 null）", () => {
    expect(classifyAgencyType("UNDP")).toBeNull();
    expect(classifyAgencyType("WHO")).toBeNull();
  });
});
