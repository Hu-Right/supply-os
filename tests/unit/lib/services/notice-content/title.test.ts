import { describe, expect, it } from "vitest";
import { normalizeTitle } from "@/lib/services/notice-content/title";

describe("normalizeTitle", () => {
  it("去掉门户前缀 [LICITANET]", () => {
    const v = normalizeTitle("[LICITANET] Aquisição de materiais de limpeza");
    expect(v.clean).toBe("Aquisição de materiais de limpeza");
    expect(v.changed).toBe(true);
    expect(v.quality).toBe("good");
  });

  it("压缩连续空格与前导空格", () => {
    const v = normalizeTitle("  Prestação   de    serviço  de limpeza ");
    expect(v.clean).toBe("Prestação de serviço de limpeza");
    expect(v.changed).toBe(true);
  });

  it("去 HTML 标签与实体", () => {
    const v = normalizeTitle("<span>Obras</span> &amp; serviços&#160;gerais");
    expect(v.clean).toBe("Obras & serviços gerais");
  });

  it("去掉前导冒号/短横", () => {
    expect(normalizeTitle(": Serviço de transporte").clean).toBe("Serviço de transporte");
    expect(normalizeTitle("- Obras de pavimentação").clean).toBe("Obras de pavimentação");
  });

  it("去掉末尾省略号并标 truncated", () => {
    const v = normalizeTitle("Aquisição de equipamentos de informática...");
    expect(v.clean).toBe("Aquisição de equipamentos de informática");
    expect(v.quality).toBe("truncated");
    expect(v.changed).toBe(true);
  });

  it("泛化标题不编造，只从正文给 suggested", () => {
    const v = normalizeTitle(
      "MATERIAL DE CONSUMO",
      "Aquisição de materiais de consumo para o setor de limpeza, incluindo detergente, papel e sabão.",
    );
    expect(v.quality).toBe("generic");
    expect(v.clean).toBe("MATERIAL DE CONSUMO");
    expect(v.suggested).toContain("Aquisição de materiais");
    expect(v.source).toBe("extracted");
  });

  it("DIVERSOS 判泛化，正文不足则不给 suggested", () => {
    const v = normalizeTitle("DIVERSOS", "DIVERSOS");
    expect(v.quality).toBe("generic");
    expect(v.suggested).toBeNull();
  });

  it("空标题 → empty", () => {
    const v = normalizeTitle("   ");
    expect(v.clean).toBe("");
    expect(v.quality).toBe("empty");
  });

  it("正常标题不变", () => {
    const v = normalizeTitle("Aquisição de equipamentos de radiologia digital");
    expect(v.clean).toBe("Aquisição de equipamentos de radiologia digital");
    expect(v.changed).toBe(false);
    expect(v.quality).toBe("good");
    expect(v.source).toBe("source");
  });
});
