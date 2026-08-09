import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUnspscPrefCascade } from "@/features/auth/hooks/useUnspscPrefCascade";
import * as unspscApi from "@/core/unspsc";

// Mock the UNSPSC API
vi.mock("@/core/unspsc", () => ({
  fetchUnspscIndustries: vi.fn(),
  fetchUnspscChildren: vi.fn(),
}));

// Mock useLocale
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ locale: "zh" }),
}));

describe("useUnspscPrefCascade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(unspscApi.fetchUnspscIndustries).mockResolvedValue([]);
    vi.mocked(unspscApi.fetchUnspscChildren).mockResolvedValue([]);
  });

  describe("initial state", () => {
    it("starts with empty options", () => {
      const { result } = renderHook(() => useUnspscPrefCascade());
      expect(result.current.industryOptions).toEqual([]);
      expect(result.current.subOptions).toEqual([]);
      expect(result.current.subOptions2).toEqual([]);
    });

    it("starts with empty selections", () => {
      const { result } = renderHook(() => useUnspscPrefCascade());
      expect(result.current.prefLevel1).toBe("");
      expect(result.current.prefLevel2).toBe("");
      expect(result.current.prefLevel3).toBe("");
    });

    it("loads industry options on mount", () => {
      renderHook(() => useUnspscPrefCascade());
      expect(unspscApi.fetchUnspscIndustries).toHaveBeenCalledWith("zh");
    });
  });

  describe("level 1 change", () => {
    it("clears level 2 and 3 when level 1 changes", () => {
      const { result } = renderHook(() => useUnspscPrefCascade());
      act(() => {
        result.current.setPrefLevel2("some-value");
        result.current.setPrefLevel3("some-sub-value");
        result.current.handlePrefLevel1Change("new-level1");
      });
      expect(result.current.prefLevel1).toBe("new-level1");
      expect(result.current.prefLevel2).toBe("");
      expect(result.current.prefLevel3).toBe("");
    });

    it("loads level 2 options when level 1 is set", () => {
      const { result } = renderHook(() => useUnspscPrefCascade());
      act(() => {
        result.current.handlePrefLevel1Change("80100000");
      });
      expect(unspscApi.fetchUnspscChildren).toHaveBeenCalledWith("80100000", "zh");
    });
  });

  describe("level 2 change", () => {
    it("clears level 3 when level 2 changes", () => {
      const { result } = renderHook(() => useUnspscPrefCascade());
      act(() => {
        result.current.setPrefLevel3("some-value");
        result.current.handlePrefLevel2Change("new-level2");
      });
      expect(result.current.prefLevel2).toBe("new-level2");
      expect(result.current.prefLevel3).toBe("");
    });

    it("loads level 3 options when level 2 is set", () => {
      const { result } = renderHook(() => useUnspscPrefCascade());
      act(() => {
        result.current.handlePrefLevel2Change("80101500");
      });
      expect(unspscApi.fetchUnspscChildren).toHaveBeenCalledWith("80101500", "zh");
    });
  });

  describe("autoFillFromInference", () => {
    it("sets level 1 from inference", () => {
      const { result } = renderHook(() => useUnspscPrefCascade());
      act(() => {
        result.current.autoFillFromInference({
          level1_id: 80100000,
          level2_id: null,
          level3_id: null,
          level4_id: null,
          level5_id: null,
          matched_title: null,
        });
      });
      expect(result.current.prefLevel1).toBe("80100000");
    });

    it("sets level 2 from inference after delay", async () => {
      const { result } = renderHook(() => useUnspscPrefCascade());
      act(() => {
        result.current.autoFillFromInference({
          level1_id: 80100000,
          level2_id: 80101500,
          level3_id: null,
          level4_id: null,
          level5_id: null,
          matched_title: null,
        });
      });
      expect(result.current.prefLevel1).toBe("80100000");
      // Wait for setTimeout
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(result.current.prefLevel2).toBe("80101500");
    });

    it("does nothing if level1_id is null", () => {
      const { result } = renderHook(() => useUnspscPrefCascade());
      act(() => {
        result.current.autoFillFromInference({
          level1_id: null,
          level2_id: null,
          level3_id: null,
          level4_id: null,
          level5_id: null,
          matched_title: null,
        });
      });
      expect(result.current.prefLevel1).toBe("");
    });
  });

  describe("searchAndAutoFillL3", () => {
    it("does nothing if no level 2 selected", () => {
      const { result } = renderHook(() => useUnspscPrefCascade());
      act(() => {
        result.current.searchAndAutoFillL3("test");
      });
      expect(result.current.prefLevel3).toBe("");
    });

    it("does nothing if keyword is empty", () => {
      const { result } = renderHook(() => useUnspscPrefCascade());
      act(() => {
        result.current.handlePrefLevel2Change("80101500");
        result.current.searchAndAutoFillL3("");
      });
      expect(result.current.prefLevel3).toBe("");
    });

    // Note: Testing the actual search functionality requires complex async mocking
    // of the useEffect that loads subOptions. The function is tested via integration tests.
  });

  describe("direct setters", () => {
    it("setPrefLevel1 updates level 1", () => {
      const { result } = renderHook(() => useUnspscPrefCascade());
      act(() => {
        result.current.setPrefLevel1("test");
      });
      expect(result.current.prefLevel1).toBe("test");
    });

    it("setPrefLevel2 updates level 2", () => {
      const { result } = renderHook(() => useUnspscPrefCascade());
      act(() => {
        result.current.setPrefLevel2("test");
      });
      expect(result.current.prefLevel2).toBe("test");
    });

    it("setPrefLevel3 updates level 3", () => {
      const { result } = renderHook(() => useUnspscPrefCascade());
      act(() => {
        result.current.setPrefLevel3("test");
      });
      expect(result.current.prefLevel3).toBe("test");
    });
  });
});
