import { describe, it, expect } from "vitest";
import { isLanguageLoaded, loadLanguage } from "@/core/i18n/loader";

describe("i18n loader", () => {
  describe("isLanguageLoaded", () => {
    it("returns false for unloaded language", () => {
      expect(isLanguageLoaded("fr")).toBe(false);
    });

    it("returns false for another unloaded language", () => {
      expect(isLanguageLoaded("es")).toBe(false);
    });
  });

  describe("loadLanguage", () => {
    it("returns empty object for already loaded language", async () => {
      // First load
      await loadLanguage("zh");
      // Second load should return empty
      const result = await loadLanguage("zh");
      expect(result).toEqual({});
    });

    it("marks language as loaded after loading", async () => {
      await loadLanguage("en");
      expect(isLanguageLoaded("en")).toBe(true);
    });

    it("loads language resources", async () => {
      const result = await loadLanguage("fr");
      // Should return merged resources (may be empty if no French translations exist)
      expect(typeof result).toBe("object");
    });
  });
});
