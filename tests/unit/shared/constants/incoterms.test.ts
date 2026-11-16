import { describe, it, expect } from "vitest";
import {
  ALL_INCOTERMS,
  INCOTERMS_BY_VERSION,
  incotermsForVersion,
  migrateIncoterm,
} from "@/shared/constants/incoterms";

describe("shared/constants/incoterms", () => {
  it("2020 与 2010 各 11 条，DAT/DPU 按版本切换", () => {
    expect(INCOTERMS_BY_VERSION["2020"]).toHaveLength(11);
    expect(INCOTERMS_BY_VERSION["2010"]).toHaveLength(11);
    expect(incotermsForVersion("2020")).toContain("DPU");
    expect(incotermsForVersion("2020")).not.toContain("DAT");
    expect(incotermsForVersion("2010")).toContain("DAT");
    expect(incotermsForVersion("2010")).not.toContain("DPU");
  });

  it("全量术语覆盖 EXW/FCA/FOB/CIF/DDP", () => {
    for (const term of ["EXW", "FCA", "FOB", "CIF", "DDP"]) {
      expect(ALL_INCOTERMS).toContain(term);
    }
  });

  it("切版本时 DAT ↔ DPU 语义不丢", () => {
    expect(migrateIncoterm("DAT", "2020")).toBe("DPU");
    expect(migrateIncoterm("DPU", "2010")).toBe("DAT");
    expect(migrateIncoterm("FOB", "2010")).toBe("FOB");
    expect(migrateIncoterm("DPU", "2020")).toBe("DPU");
  });
});
