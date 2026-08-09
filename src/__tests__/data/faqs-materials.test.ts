import { describe, it, expect } from "vitest";
import { FAQS } from "@/data/faqs";
import { LEARNING_MATERIALS } from "@/data/materials";

describe("FAQS", () => {
  it("contains 3 FAQ items", () => {
    expect(FAQS).toHaveLength(3);
  });

  it("each FAQ has required properties", () => {
    for (const faq of FAQS) {
      expect(faq.id).toBeTruthy();
      expect(faq.questionZh).toBeTruthy();
      expect(faq.questionEn).toBeTruthy();
      expect(faq.answerZh).toBeTruthy();
      expect(faq.answerEn).toBeTruthy();
      expect(faq.category).toBeTruthy();
    }
  });

  it("has unique IDs", () => {
    const ids = FAQS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all FAQs are in ungm category", () => {
    for (const faq of FAQS) {
      expect(faq.category).toBe("ungm");
    }
  });

  it("questions are in both languages", () => {
    const firstFaq = FAQS[0];
    expect(firstFaq.questionZh).toContain("联合国");
    expect(firstFaq.questionEn).toContain("UNSPSC");
  });
});

describe("LEARNING_MATERIALS", () => {
  it("contains multiple materials", () => {
    expect(LEARNING_MATERIALS.length).toBeGreaterThan(0);
  });

  it("each material has required properties", () => {
    for (const material of LEARNING_MATERIALS) {
      expect(material.id).toBeTruthy();
      expect(material.titleZh).toBeTruthy();
      expect(material.titleEn).toBeTruthy();
      expect(material.categoryZh).toBeTruthy();
      expect(material.categoryEn).toBeTruthy();
      expect(material.summaryZh).toBeTruthy();
      expect(material.summaryEn).toBeTruthy();
      expect(material.contentZh).toBeTruthy();
      expect(material.contentEn).toBeTruthy();
      expect(typeof material.isPremium).toBe("boolean");
      expect(typeof material.downloadsCount).toBe("number");
    }
  });

  it("has unique IDs", () => {
    const ids = LEARNING_MATERIALS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes both free and premium materials", () => {
    const free = LEARNING_MATERIALS.filter((m) => !m.isPremium);
    const premium = LEARNING_MATERIALS.filter((m) => m.isPremium);
    expect(free.length).toBeGreaterThan(0);
    expect(premium.length).toBeGreaterThan(0);
  });

  it("download counts are non-negative", () => {
    for (const material of LEARNING_MATERIALS) {
      expect(material.downloadsCount).toBeGreaterThanOrEqual(0);
    }
  });
});
