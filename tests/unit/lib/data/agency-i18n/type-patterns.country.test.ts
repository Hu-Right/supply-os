import { describe, expect, it } from "vitest";
import { classifyAgencyType } from "@/lib/services/agency/index";

describe("classifyAgencyType — 国家守卫", () => {
  it("阿根廷 Departamento 不得归入 DEPARTAMENTO_BR", () => {
    expect(classifyAgencyType("Departamento Contaduria y Finanzas", "Argentina")?.typeKey).toBe("DEPARTMENT_INTL");
  });

  it("巴西 Departamento 仍归入 DEPARTAMENTO_BR", () => {
    expect(classifyAgencyType("Departamento de Compras", "Brazil")?.typeKey).toBe("DEPARTAMENTO_BR");
  });

  it("阿根廷 County 不得归入 COUNTY_KE", () => {
    expect(classifyAgencyType("County Government of Nairobi", "Argentina")).toBeNull();
  });

  it("肯尼亚 County 仍归入 COUNTY_KE", () => {
    expect(classifyAgencyType("County Government of Nairobi", "Kenya")?.typeKey).toBe("COUNTY_KE");
  });
});

