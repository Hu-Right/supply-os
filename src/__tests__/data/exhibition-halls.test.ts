import { describe, it, expect } from "vitest";
import { EXHIBITION_HALLS } from "@/data/exhibition-halls";

describe("EXHIBITION_HALLS", () => {
  it("contains 6 exhibition halls", () => {
    expect(EXHIBITION_HALLS).toHaveLength(6);
  });

  it("each hall has required properties", () => {
    for (const hall of EXHIBITION_HALLS) {
      expect(hall.id).toBeTruthy();
      expect(hall.nameZh).toBeTruthy();
      expect(hall.nameEn).toBeTruthy();
      expect(hall.regionZh).toBeTruthy();
      expect(hall.regionEn).toBeTruthy();
      expect(hall.countryZh).toBeTruthy();
      expect(hall.countryEn).toBeTruthy();
      expect(hall.cityZh).toBeTruthy();
      expect(hall.cityEn).toBeTruthy();
      expect(hall.descriptionZh).toBeTruthy();
      expect(hall.descriptionEn).toBeTruthy();
    }
  });

  it("includes Frankfurt hall", () => {
    const frankfurt = EXHIBITION_HALLS.find((h) => h.cityEn === "Frankfurt");
    expect(frankfurt).toBeDefined();
    expect(frankfurt?.countryEn).toBe("Germany");
    expect(frankfurt?.regionEn).toBe("Europe");
  });

  it("includes Dubai hall", () => {
    const dubai = EXHIBITION_HALLS.find((h) => h.cityEn === "Dubai");
    expect(dubai).toBeDefined();
    expect(dubai?.countryEn).toBe("UAE");
    expect(dubai?.regionEn).toBe("Middle East");
  });

  it("includes Nairobi hall", () => {
    const nairobi = EXHIBITION_HALLS.find((h) => h.cityEn === "Nairobi");
    expect(nairobi).toBeDefined();
    expect(nairobi?.countryEn).toBe("Kenya");
    expect(nairobi?.regionEn).toBe("Africa");
  });

  it("each hall has featured products in both languages", () => {
    for (const hall of EXHIBITION_HALLS) {
      expect(hall.featuredProductsZh.length).toBeGreaterThan(0);
      expect(hall.featuredProductsEn.length).toBeGreaterThan(0);
    }
  });

  it("each hall has capacity value", () => {
    for (const hall of EXHIBITION_HALLS) {
      expect(hall.capacityValue).toBeTruthy();
    }
  });

  it("has unique IDs", () => {
    const ids = EXHIBITION_HALLS.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
