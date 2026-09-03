/**
 * useSearchFormState Hook 组件测试
 * Component tests for useSearchFormState hook
 *
 * 覆盖：
 *   - 初始状态从 URL 参数读取
 *   - 各 setter 函数更新对应字段
 *   - syncFromUrl 同步外部 URL 参数
 *   - clear 重置所有字段
 *   - inputs 映射与 formState 一致
 *
 * @module features/procurement/hooks/search/useSearchFormState.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ── Mock next/navigation ──
const mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

// ── 导入被测 Hook ──
import { useSearchFormState } from "@/features/procurement/hooks/search/useSearchFormState";

// ══════════════════════════════════════════════════════════════════════════════
// 测试套件
// ══════════════════════════════════════════════════════════════════════════════

describe("useSearchFormState", () => {
  beforeEach(() => {
    // 清空 URL 参数
    for (const key of Array.from(mockSearchParams.keys())) {
      mockSearchParams.delete(key);
    }
  });

  // ── 初始状态 ──

  describe("初始状态", () => {
    it("无 URL 参数时所有字段为空字符串", () => {
      const { result } = renderHook(() => useSearchFormState());

      expect(result.current.inputs.qInput).toBe("");
      expect(result.current.inputs.countryInput).toBe("");
      expect(result.current.inputs.agencyInput).toBe("");
      expect(result.current.inputs.fromInput).toBe("");
      expect(result.current.inputs.toInput).toBe("");
      expect(result.current.inputs.windowInput).toBe("");
      expect(result.current.inputs.typeInput).toBe("");
    });

    it("从 URL 参数初始化 q", () => {
      mockSearchParams.set("q", "construction");
      const { result } = renderHook(() => useSearchFormState());
      expect(result.current.inputs.qInput).toBe("construction");
    });

    it("从 URL 参数初始化 country", () => {
      mockSearchParams.set("country", "Brazil");
      const { result } = renderHook(() => useSearchFormState());
      expect(result.current.inputs.countryInput).toBe("Brazil");
    });

    it("从 URL 参数初始化 agency", () => {
      mockSearchParams.set("agency", "UNDP");
      const { result } = renderHook(() => useSearchFormState());
      expect(result.current.inputs.agencyInput).toBe("UNDP");
    });

    it("从 URL 参数初始化 deadline_from", () => {
      mockSearchParams.set("deadline_from", "2026-01-01");
      const { result } = renderHook(() => useSearchFormState());
      expect(result.current.inputs.fromInput).toBe("2026-01-01");
    });

    it("从 URL 参数初始化 deadline_to", () => {
      mockSearchParams.set("deadline_to", "2026-12-31");
      const { result } = renderHook(() => useSearchFormState());
      expect(result.current.inputs.toInput).toBe("2026-12-31");
    });

    it("从 URL 参数初始化 deadline_within_days", () => {
      mockSearchParams.set("deadline_within_days", "30");
      const { result } = renderHook(() => useSearchFormState());
      expect(result.current.inputs.windowInput).toBe("30");
    });

    it("从 URL 参数初始化 notice_type", () => {
      mockSearchParams.set("notice_type", "ITB");
      const { result } = renderHook(() => useSearchFormState());
      expect(result.current.inputs.typeInput).toBe("ITB");
    });

    it("多参数同时初始化", () => {
      mockSearchParams.set("q", "medical");
      mockSearchParams.set("country", "Kenya");
      mockSearchParams.set("agency", "UNICEF");
      const { result } = renderHook(() => useSearchFormState());
      expect(result.current.inputs.qInput).toBe("medical");
      expect(result.current.inputs.countryInput).toBe("Kenya");
      expect(result.current.inputs.agencyInput).toBe("UNICEF");
    });
  });

  // ── Setter 函数 ──

  describe("Setter 函数", () => {
    it("setQInput 更新关键词", () => {
      const { result } = renderHook(() => useSearchFormState());
      act(() => result.current.setters.setQInput("test query"));
      expect(result.current.inputs.qInput).toBe("test query");
    });

    it("setCountryInput 更新国家", () => {
      const { result } = renderHook(() => useSearchFormState());
      act(() => result.current.setters.setCountryInput("China"));
      expect(result.current.inputs.countryInput).toBe("China");
    });

    it("setAgencyInput 更新机构", () => {
      const { result } = renderHook(() => useSearchFormState());
      act(() => result.current.setters.setAgencyInput("WHO"));
      expect(result.current.inputs.agencyInput).toBe("WHO");
    });

    it("setFromInput 更新起始日期", () => {
      const { result } = renderHook(() => useSearchFormState());
      act(() => result.current.setters.setFromInput("2026-06-01"));
      expect(result.current.inputs.fromInput).toBe("2026-06-01");
    });

    it("setToInput 更新结束日期", () => {
      const { result } = renderHook(() => useSearchFormState());
      act(() => result.current.setters.setToInput("2026-12-31"));
      expect(result.current.inputs.toInput).toBe("2026-12-31");
    });

    it("setWindowInput 更新窗口", () => {
      const { result } = renderHook(() => useSearchFormState());
      act(() => result.current.setters.setWindowInput("7"));
      expect(result.current.inputs.windowInput).toBe("7");
    });

    it("setTypeInput 更新类型", () => {
      const { result } = renderHook(() => useSearchFormState());
      act(() => result.current.setters.setTypeInput("RFQ"));
      expect(result.current.inputs.typeInput).toBe("RFQ");
    });

    it("多次 setter 调用累积更新", () => {
      const { result } = renderHook(() => useSearchFormState());
      act(() => result.current.setters.setQInput("first"));
      act(() => result.current.setters.setCountryInput("US"));
      act(() => result.current.setters.setQInput("second"));
      expect(result.current.inputs.qInput).toBe("second");
      expect(result.current.inputs.countryInput).toBe("US");
    });
  });

  // ── syncFromUrl ──

  describe("syncFromUrl", () => {
    it("完全替换表单状态", () => {
      const { result } = renderHook(() => useSearchFormState());

      // 先设置一些值
      act(() => result.current.setters.setQInput("old value"));

      // 从 URL 同步
      act(() => result.current.syncFromUrl({
        q: "new value",
        country: "France",
        agency: "UNESCO",
        from: "2026-03-01",
        to: "2026-09-30",
        window: "90",
        type: "EOI",
      }));

      expect(result.current.inputs.qInput).toBe("new value");
      expect(result.current.inputs.countryInput).toBe("France");
      expect(result.current.inputs.agencyInput).toBe("UNESCO");
      expect(result.current.inputs.fromInput).toBe("2026-03-01");
      expect(result.current.inputs.toInput).toBe("2026-09-30");
      expect(result.current.inputs.windowInput).toBe("90");
      expect(result.current.inputs.typeInput).toBe("EOI");
    });

    it("空字符串覆盖旧值", () => {
      const { result } = renderHook(() => useSearchFormState());

      act(() => result.current.setters.setQInput("something"));
      act(() => result.current.syncFromUrl({
        q: "",
        country: "",
        agency: "",
        from: "",
        to: "",
        window: "",
        type: "",
      }));

      expect(result.current.inputs.qInput).toBe("");
    });
  });

  // ── clear ──

  describe("clear", () => {
    it("重置所有字段为空字符串", () => {
      const { result } = renderHook(() => useSearchFormState());

      // 设置所有字段
      act(() => {
        result.current.setters.setQInput("test");
        result.current.setters.setCountryInput("Japan");
        result.current.setters.setAgencyInput("JICA");
        result.current.setters.setFromInput("2026-01-01");
        result.current.setters.setToInput("2026-12-31");
        result.current.setters.setWindowInput("30");
        result.current.setters.setTypeInput("ITB");
      });

      // 清除
      act(() => result.current.clear());

      expect(result.current.inputs.qInput).toBe("");
      expect(result.current.inputs.countryInput).toBe("");
      expect(result.current.inputs.agencyInput).toBe("");
      expect(result.current.inputs.fromInput).toBe("");
      expect(result.current.inputs.toInput).toBe("");
      expect(result.current.inputs.windowInput).toBe("");
      expect(result.current.inputs.typeInput).toBe("");
    });

    it("clear 后 formState 与 inputs 一致", () => {
      const { result } = renderHook(() => useSearchFormState());

      act(() => result.current.setters.setQInput("test"));
      act(() => result.current.clear());

      expect(result.current.formState.q).toBe("");
      expect(result.current.inputs.qInput).toBe(result.current.formState.q);
    });
  });

  // ── formState 与 inputs 映射一致性 ──

  describe("formState 与 inputs 映射", () => {
    it("inputs.qInput === formState.q", () => {
      const { result } = renderHook(() => useSearchFormState());
      act(() => result.current.setters.setQInput("hello"));
      expect(result.current.inputs.qInput).toBe(result.current.formState.q);
    });

    it("inputs.countryInput === formState.country", () => {
      const { result } = renderHook(() => useSearchFormState());
      act(() => result.current.setters.setCountryInput("Germany"));
      expect(result.current.inputs.countryInput).toBe(result.current.formState.country);
    });

    it("inputs.agencyInput === formState.agency", () => {
      const { result } = renderHook(() => useSearchFormState());
      act(() => result.current.setters.setAgencyInput("GIZ"));
      expect(result.current.inputs.agencyInput).toBe(result.current.formState.agency);
    });
  });
});
