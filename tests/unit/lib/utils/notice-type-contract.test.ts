import { describe, expect, it } from "vitest";
import {
  classifyBareContractNotice,
  normalizeNoticeType,
} from "@/lib/utils/notice-type";

describe("裸 Contract 的归一（Mercell 聚合源）", () => {
  it("Contract 母类归 CONTRACT_NOTICE，且 std 码幂等", () => {
    expect(normalizeNoticeType("Contract")).toBe("CONTRACT_NOTICE");
    expect(normalizeNoticeType("contract ")).toBe("CONTRACT_NOTICE");
    expect(normalizeNoticeType("CONTRACT_NOTICE")).toBe("CONTRACT_NOTICE");
  });

  it("其他类型不受影响", () => {
    expect(normalizeNoticeType("invitation_for_bids")).toBe("ITB");
    expect(normalizeNoticeType("invitation_for_prequalification")).toBe("PQ");
    expect(normalizeNoticeType("")).toBe("OTHER");
  });
});

describe("classifyBareContractNotice", () => {
  it("动态采购系统（瑞典语正写与 DIS 缩写）→ DPS", () => {
    expect(classifyBareContractNotice("Dynamiskt inköpssystem - Servrar", "")).toBe("DPS");
    expect(classifyBareContractNotice("Dynamiskt inköpssystem för manuella naturvårdstjänster", "")).toBe("DPS");
    expect(classifyBareContractNotice("DIS Upphandlingskonsulter", "")).toBe("DPS");
    expect(classifyBareContractNotice("T-317 Deponier dynamiskt inköpssystem", "")).toBe("DPS");
    expect(classifyBareContractNotice("City DPS for vehicles", "Dynamic purchasing system")).toBe("DPS");
  });

  it("资格系统 → QUAL_SYSTEM", () => {
    expect(classifyBareContractNotice("ELLEVIO POWERQ - Kvalificeringssystem", "")).toBe("QUAL_SYSTEM");
    expect(classifyBareContractNotice("Qualification system for works", "")).toBe("QUAL_SYSTEM");
  });

  it("资格预审 → PQ（不被 qualification system 子串误吞）", () => {
    expect(classifyBareContractNotice("VATTENFALL ELDISTRIBUTION PREQUALIFICATION SYSTEM FOR POWER TRANSFORMERS", "")).toBe("PQ");
    expect(classifyBareContractNotice("Prekvalificeringssystem inom kategorin avverkning av skog", "")).toBe("PQ");
  });

  it("框架协议 → FRAMEWORK（含北欧/荷兰语变体）", () => {
    expect(classifyBareContractNotice("Ramavtal för Livsmedel - Grossist frukt och grönt", "")).toBe("FRAMEWORK");
    expect(classifyBareContractNotice("Framework Agreement for IT services", "")).toBe("FRAMEWORK");
    expect(classifyBareContractNotice("Rammeavtale for renhold", "")).toBe("FRAMEWORK");
  });

  it("普通招标保留 CONTRACT_NOTICE", () => {
    expect(
      classifyBareContractNotice(
        "Omhändertagande av slaggrus",
        "Uppdraget i denna upphandling avser omhändertagande av slaggrus från Sysavs avfallskraftvärmeverk.",
      ),
    ).toBe("CONTRACT_NOTICE");
    expect(classifyBareContractNotice("Utbyte av brolager BK4", "Upphandling gällande utbyte av brolager")).toBe("CONTRACT_NOTICE");
  });

  it("DPS 优先于框架协议（同一公告既是 DIS 又提 ramavtal）", () => {
    expect(classifyBareContractNotice("DIS för ramavtal inom bygg", "")).toBe("DPS");
  });
});