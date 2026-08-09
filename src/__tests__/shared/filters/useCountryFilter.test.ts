import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCountryFilter } from "@/shared/filters/useCountryFilter";

describe("useCountryFilter", () => {
  const mockCountries = [
    { country: "Brazil", count: 100 },
    { country: "India", count: 80 },
    { country: "China", count: 60 },
    { country: "United States", count: 40 },
  ];

  const defaultProps = {
    countries: mockCountries,
    value: "",
    onChange: () => {},
    locale: "en",
    placeholder: "Select country",
  };

  describe("initial state", () => {
    it("starts with empty query", () => {
      const { result } = renderHook(() => useCountryFilter(defaultProps));
      expect(result.current.inputValue).toBe("");
    });

    it("starts with dropdown closed", () => {
      const { result } = renderHook(() => useCountryFilter(defaultProps));
      expect(result.current.showDropdown).toBe(false);
    });

    it("shows all countries when no query", () => {
      const { result } = renderHook(() => useCountryFilter(defaultProps));
      expect(result.current.visible).toEqual(mockCountries);
    });
  });

  describe("filtering", () => {
    it("filters countries by English name", () => {
      const { result } = renderHook(() => useCountryFilter(defaultProps));
      act(() => {
        result.current.setQuery("bra");
      });
      expect(result.current.visible).toHaveLength(1);
      expect(result.current.visible[0].country).toBe("Brazil");
    });

    it("filters countries case-insensitively", () => {
      const { result } = renderHook(() => useCountryFilter(defaultProps));
      act(() => {
        result.current.setQuery("INDIA");
      });
      expect(result.current.visible).toHaveLength(1);
      expect(result.current.visible[0].country).toBe("India");
    });

    it("returns empty array when no match", () => {
      const { result } = renderHook(() => useCountryFilter(defaultProps));
      act(() => {
        result.current.setQuery("xyz");
      });
      expect(result.current.visible).toHaveLength(0);
    });

    it("trims whitespace from query", () => {
      const { result } = renderHook(() => useCountryFilter(defaultProps));
      act(() => {
        result.current.setQuery("  china  ");
      });
      expect(result.current.visible).toHaveLength(1);
    });
  });

  describe("selection", () => {
    it("calls onChange when country selected", () => {
      const onChange = vi.fn();
      const { result } = renderHook(() =>
        useCountryFilter({ ...defaultProps, onChange })
      );
      act(() => {
        result.current.handleSelect("Brazil");
      });
      expect(onChange).toHaveBeenCalledWith("Brazil");
    });

    it("closes dropdown after selection", () => {
      const { result } = renderHook(() => useCountryFilter(defaultProps));
      act(() => {
        result.current.setFocused(true);
        result.current.handleSelect("Brazil");
      });
      expect(result.current.showDropdown).toBe(false);
    });

    it("clears query after selection", () => {
      const { result } = renderHook(() => useCountryFilter(defaultProps));
      act(() => {
        result.current.setQuery("bra");
        result.current.handleSelect("Brazil");
      });
      expect(result.current.inputValue).toBe("");
    });
  });

  describe("clear", () => {
    it("calls onChange with empty string", () => {
      const onChange = vi.fn();
      const { result } = renderHook(() =>
        useCountryFilter({ ...defaultProps, value: "Brazil", onChange })
      );
      act(() => {
        result.current.handleClear();
      });
      expect(onChange).toHaveBeenCalledWith("");
    });

    it("clears query", () => {
      const { result } = renderHook(() =>
        useCountryFilter({ ...defaultProps, value: "Brazil" })
      );
      act(() => {
        result.current.setQuery("test");
        result.current.handleClear();
      });
      expect(result.current.inputValue).toBe("");
    });
  });

  describe("focus management", () => {
    it("opens dropdown on focus", () => {
      const { result } = renderHook(() => useCountryFilter(defaultProps));
      act(() => {
        result.current.handleFocus();
      });
      expect(result.current.showDropdown).toBe(true);
    });

    it("closes dropdown on blur (after delay)", async () => {
      const { result } = renderHook(() => useCountryFilter(defaultProps));
      act(() => {
        result.current.handleFocus();
        result.current.handleBlur();
      });
      // Wait for blur timeout
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(result.current.showDropdown).toBe(false);
    });
  });

  describe("display name", () => {
    it("shows display name when value is set", () => {
      const { result } = renderHook(() =>
        useCountryFilter({ ...defaultProps, value: "Brazil" })
      );
      expect(result.current.displayCountryName).toBe("Brazil");
    });

    it("shows empty string when no value", () => {
      const { result } = renderHook(() => useCountryFilter(defaultProps));
      expect(result.current.displayCountryName).toBe("");
    });
  });

  describe("MAX_VISIBLE limit", () => {
    it("limits visible items to MAX_VISIBLE", () => {
      const manyCountries = Array.from({ length: 300 }, (_, i) => ({
        country: `Country${i}`,
        count: i,
      }));
      const { result } = renderHook(() =>
        useCountryFilter({ ...defaultProps, countries: manyCountries })
      );
      expect(result.current.visible.length).toBeLessThanOrEqual(200);
      expect(result.current.hasMore).toBe(true);
    });
  });
});
