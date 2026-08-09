import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDetailViewCount, setDetailViewCount } from "@/features/procurement/utils/detailViewCount";

describe("detailViewCount", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  });

  afterEach(() => {
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  });

  describe("getDetailViewCount", () => {
    it("returns 0 for new user", () => {
      expect(getDetailViewCount("user@test.com")).toBe(0);
    });

    it("returns 0 for guest user", () => {
      expect(getDetailViewCount(undefined)).toBe(0);
    });

    it("returns stored count for user", () => {
      setDetailViewCount("user@test.com", 5);
      expect(getDetailViewCount("user@test.com")).toBe(5);
    });

    it("returns stored count for guest", () => {
      setDetailViewCount(undefined, 3);
      expect(getDetailViewCount(undefined)).toBe(3);
    });

    it("isolates counts by user", () => {
      setDetailViewCount("user1@test.com", 5);
      setDetailViewCount("user2@test.com", 10);
      expect(getDetailViewCount("user1@test.com")).toBe(5);
      expect(getDetailViewCount("user2@test.com")).toBe(10);
    });
  });

  describe("setDetailViewCount", () => {
    it("sets count for user", () => {
      setDetailViewCount("user@test.com", 7);
      expect(getDetailViewCount("user@test.com")).toBe(7);
    });

    it("sets count for guest", () => {
      setDetailViewCount(undefined, 4);
      expect(getDetailViewCount(undefined)).toBe(4);
    });

    it("overwrites existing count", () => {
      setDetailViewCount("user@test.com", 5);
      setDetailViewCount("user@test.com", 10);
      expect(getDetailViewCount("user@test.com")).toBe(10);
    });

    it("can set count to 0", () => {
      setDetailViewCount("user@test.com", 5);
      setDetailViewCount("user@test.com", 0);
      expect(getDetailViewCount("user@test.com")).toBe(0);
    });

    it("handles negative numbers", () => {
      setDetailViewCount("user@test.com", -1);
      expect(getDetailViewCount("user@test.com")).toBe(-1);
    });

    it("handles large numbers", () => {
      setDetailViewCount("user@test.com", 999999);
      expect(getDetailViewCount("user@test.com")).toBe(999999);
    });
  });

  describe("localStorage key format", () => {
    it("uses correct key format for user", () => {
      setDetailViewCount("test@example.com", 1);
      const key = `procurement_detail_views_test@example.com`;
      expect(window.localStorage.getItem(key)).toBe("1");
    });

    it("uses correct key format for guest", () => {
      setDetailViewCount(undefined, 1);
      const key = `procurement_detail_views_guest`;
      expect(window.localStorage.getItem(key)).toBe("1");
    });
  });
});
