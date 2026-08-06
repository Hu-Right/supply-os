import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useTrainingForm } from "@/features/training/hooks/useTrainingForm";

// ── Mock training API ──
const mockFetchCertifications = vi.fn();
const mockFetchIndustries = vi.fn();
const mockFetchSubIndustries = vi.fn();
const mockSubmitTrainingRegister = vi.fn();

vi.mock("@/features/training/api", () => ({
  fetchCertifications: (...args: any[]) => mockFetchCertifications(...args),
  fetchIndustries: (...args: any[]) => mockFetchIndustries(...args),
  fetchSubIndustries: (...args: any[]) => mockFetchSubIndustries(...args),
  submitTrainingRegister: (...args: any[]) => mockSubmitTrainingRegister(...args),
}));

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

const mockCerts = [
  { id: 1, name: "ISO9001" },
  { id: 2, name: "CE" },
];
const mockLevel1 = [
  { id: 10, code: "1000", title_zh: "机械设备", title_en: "Machinery", name: "机械设备" },
  { id: 20, code: "2000", title_zh: "电子元器件", title_en: "Electronics", name: "电子元器件" },
];
const mockLevel2 = [
  { id: 101, code: "1001", title_zh: "数控机床", title_en: "CNC", name: "数控机床" },
];
const mockLevel3 = [
  { id: 1001, code: "100101", title_zh: "五轴加工中心", title_en: "5-Axis CNC", name: "五轴加工中心" },
];

describe("useTrainingForm — additional branch coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchCertifications.mockResolvedValue(mockCerts);
    mockFetchIndustries.mockResolvedValue(mockLevel1);
    mockFetchSubIndustries.mockResolvedValue(mockLevel2);
    mockSubmitTrainingRegister.mockResolvedValue({ success: true });
  });

  // ── 1. Initial state ──
  it("initializes with empty form state", () => {
    const { result } = renderHook(() => useTrainingForm());
    expect(result.current.form.company_name).toBe("");
    expect(result.current.form.industry_id).toBe("");
    expect(result.current.form.certification).toEqual([]);
    expect(result.current.submitted).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe("");
  });

  // ── 2. Loads certifications and level1 industries on mount ──
  it("loads certifications and level1 industries on mount", async () => {
    const { result } = renderHook(() => useTrainingForm());

    await waitFor(() => {
      expect(result.current.certifications).toHaveLength(2);
      expect(result.current.level1Industries).toHaveLength(2);
    });
  });

  // ── 3. Handles certifications fetch failure gracefully ──
  it("handles certifications fetch failure gracefully", async () => {
    mockFetchCertifications.mockRejectedValue(new Error("Failed"));
    const { result } = renderHook(() => useTrainingForm());

    await waitFor(() => {
      expect(result.current.certifications).toEqual([]);
    });
  });

  // ── 4. Handles industries fetch failure gracefully ──
  it("handles industries fetch failure gracefully", async () => {
    mockFetchIndustries.mockRejectedValue(new Error("Failed"));
    const { result } = renderHook(() => useTrainingForm());

    await waitFor(() => {
      expect(result.current.level1Industries).toEqual([]);
    });
  });

  // ── 5. Selecting level1 industry loads level2 ──
  it("selecting level1 industry triggers level2 fetch and resets level2/level3", async () => {
    const { result } = renderHook(() => useTrainingForm());

    await waitFor(() => {
      expect(result.current.level1Industries).toHaveLength(2);
    });

    // Simulate selecting level1
    act(() => {
      result.current.handleChange({
        target: { name: "industry_id", value: "10" },
      } as React.ChangeEvent<HTMLSelectElement>);
    });

    await waitFor(() => {
      expect(mockFetchSubIndustries).toHaveBeenCalledWith("10");
      expect(result.current.form.industry_level2_id).toBe("");
      expect(result.current.form.industry_level3_id).toBe("");
    });
  });

  // ── 6. Clearing level1 industry clears level2 and level3 ──
  it("clearing level1 industry clears level2 and level3 lists", async () => {
    const { result } = renderHook(() => useTrainingForm());

    await waitFor(() => {
      expect(result.current.level1Industries).toHaveLength(2);
    });

    // Select level1
    act(() => {
      result.current.handleChange({
        target: { name: "industry_id", value: "10" },
      } as React.ChangeEvent<HTMLSelectElement>);
    });

    await waitFor(() => {
      expect(result.current.level2Industries.length).toBeGreaterThanOrEqual(0);
    });

    // Clear level1
    act(() => {
      result.current.handleChange({
        target: { name: "industry_id", value: "" },
      } as React.ChangeEvent<HTMLSelectElement>);
    });

    await waitFor(() => {
      expect(result.current.level2Industries).toEqual([]);
      expect(result.current.level3Industries).toEqual([]);
    });
  });

  // ── 7. Selecting level2 industry loads level3 ──
  it("selecting level2 industry triggers level3 fetch", async () => {
    mockFetchSubIndustries.mockImplementation((id: string) =>
      id === "10" ? Promise.resolve(mockLevel2) : Promise.resolve(mockLevel3)
    );

    const { result } = renderHook(() => useTrainingForm());

    await waitFor(() => {
      expect(result.current.level1Industries).toHaveLength(2);
    });

    // Select level1
    act(() => {
      result.current.handleChange({
        target: { name: "industry_id", value: "10" },
      } as React.ChangeEvent<HTMLSelectElement>);
    });

    await waitFor(() => {
      expect(result.current.level2Industries.length).toBeGreaterThanOrEqual(0);
    });

    // Select level2
    act(() => {
      result.current.handleChange({
        target: { name: "industry_level2_id", value: "101" },
      } as React.ChangeEvent<HTMLSelectElement>);
    });

    await waitFor(() => {
      expect(mockFetchSubIndustries).toHaveBeenCalledWith("101");
    });
  });

  // ── 8. Clearing level2 clears level3 ──
  it("clearing level2 industry clears level3 list", async () => {
    const { result } = renderHook(() => useTrainingForm());

    // Select level1 first
    act(() => {
      result.current.handleChange({
        target: { name: "industry_id", value: "10" },
      } as React.ChangeEvent<HTMLSelectElement>);
    });

    // Select level2
    act(() => {
      result.current.handleChange({
        target: { name: "industry_level2_id", value: "101" },
      } as React.ChangeEvent<HTMLSelectElement>);
    });

    // Clear level2
    act(() => {
      result.current.handleChange({
        target: { name: "industry_level2_id", value: "" },
      } as React.ChangeEvent<HTMLSelectElement>);
    });

    await waitFor(() => {
      expect(result.current.level3Industries).toEqual([]);
    });
  });

  // ── 9. Toggle certification: add and remove ──
  it("toggles certification on and off", async () => {
    const { result } = renderHook(() => useTrainingForm());

    await waitFor(() => {
      expect(result.current.certifications).toHaveLength(2);
    });

    // Add ISO9001
    act(() => {
      result.current.toggleCertification("ISO9001");
    });
    expect(result.current.form.certification).toContain("ISO9001");

    // Add CE
    act(() => {
      result.current.toggleCertification("CE");
    });
    expect(result.current.form.certification).toContain("CE");
    expect(result.current.form.certification).toHaveLength(2);

    // Remove ISO9001
    act(() => {
      result.current.toggleCertification("ISO9001");
    });
    expect(result.current.form.certification).not.toContain("ISO9001");
    expect(result.current.form.certification).toHaveLength(1);
  });

  // ── 10. handleChange updates form field ──
  it("updates form field via handleChange", () => {
    const { result } = renderHook(() => useTrainingForm());

    act(() => {
      result.current.handleChange({
        target: { name: "company_name", value: "测试公司" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.form.company_name).toBe("测试公司");
  });

  // ── 11. handleSubmit validation error ──
  it("shows validation error when required fields are empty", async () => {
    const { result } = renderHook(() => useTrainingForm());

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(result.current.error).toBe("trainingValidationError");
    expect(mockSubmitTrainingRegister).not.toHaveBeenCalled();
  });

  // ── 12. handleSubmit success ──
  it("submits successfully with all required fields", async () => {
    const { result } = renderHook(() => useTrainingForm());

    // Fill required fields
    act(() => {
      result.current.handleChange({ target: { name: "company_name", value: "测试公司" } } as React.ChangeEvent<HTMLInputElement>);
      result.current.handleChange({ target: { name: "industry_id", value: "10" } } as React.ChangeEvent<HTMLSelectElement>);
      result.current.handleChange({ target: { name: "contact_name", value: "张三" } } as React.ChangeEvent<HTMLInputElement>);
      result.current.handleChange({ target: { name: "telephone", value: "13800138000" } } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    await waitFor(() => {
      expect(result.current.submitted).toBe(true);
      expect(result.current.loading).toBe(false);
    });
    expect(mockSubmitTrainingRegister).toHaveBeenCalled();
  });

  // ── 13. handleSubmit failure ──
  it("shows error message on submit failure", async () => {
    mockSubmitTrainingRegister.mockRejectedValue(new Error("Server error"));
    const { result } = renderHook(() => useTrainingForm());

    act(() => {
      result.current.handleChange({ target: { name: "company_name", value: "测试公司" } } as React.ChangeEvent<HTMLInputElement>);
      result.current.handleChange({ target: { name: "industry_id", value: "10" } } as React.ChangeEvent<HTMLSelectElement>);
      result.current.handleChange({ target: { name: "contact_name", value: "张三" } } as React.ChangeEvent<HTMLInputElement>);
      result.current.handleChange({ target: { name: "telephone", value: "13800138000" } } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    await waitFor(() => {
      expect(result.current.error).toBe("Server error");
      expect(result.current.submitted).toBe(false);
    });
  });

  // ── 14. handleSubmit with non-Error exception ──
  it("shows fallback error for non-Error exceptions", async () => {
    mockSubmitTrainingRegister.mockRejectedValue("string error");
    const { result } = renderHook(() => useTrainingForm());

    act(() => {
      result.current.handleChange({ target: { name: "company_name", value: "测试公司" } } as React.ChangeEvent<HTMLInputElement>);
      result.current.handleChange({ target: { name: "industry_id", value: "10" } } as React.ChangeEvent<HTMLSelectElement>);
      result.current.handleChange({ target: { name: "contact_name", value: "张三" } } as React.ChangeEvent<HTMLInputElement>);
      result.current.handleChange({ target: { name: "telephone", value: "13800138000" } } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    await waitFor(() => {
      expect(result.current.error).toBe("formError");
    });
  });

  // ── 15. handleSubmit uses deepest selected industry level ──
  it("submits with level3 id when all three levels selected", async () => {
    mockFetchSubIndustries.mockImplementation((id: string) =>
      id === "10" ? Promise.resolve(mockLevel2) : Promise.resolve(mockLevel3)
    );

    const { result } = renderHook(() => useTrainingForm());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.level1Industries).toHaveLength(2);
    });

    // Select all three levels
    act(() => {
      result.current.handleChange({ target: { name: "industry_id", value: "10" } } as React.ChangeEvent<HTMLSelectElement>);
    });

    await waitFor(() => {
      expect(mockFetchSubIndustries).toHaveBeenCalledWith("10");
    });

    act(() => {
      result.current.handleChange({ target: { name: "industry_level2_id", value: "101" } } as React.ChangeEvent<HTMLSelectElement>);
    });

    await waitFor(() => {
      expect(mockFetchSubIndustries).toHaveBeenCalledWith("101");
    });

    // Now set level3 and fill required fields
    act(() => {
      result.current.handleChange({ target: { name: "industry_level3_id", value: "1001" } } as React.ChangeEvent<HTMLSelectElement>);
      result.current.handleChange({ target: { name: "company_name", value: "测试公司" } } as React.ChangeEvent<HTMLInputElement>);
      result.current.handleChange({ target: { name: "contact_name", value: "张三" } } as React.ChangeEvent<HTMLInputElement>);
      result.current.handleChange({ target: { name: "telephone", value: "13800138000" } } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    await waitFor(() => {
      expect(mockSubmitTrainingRegister).toHaveBeenCalledWith(
        expect.objectContaining({ industry_id: 1001 })
      );
    });
  });

  // ── 16. EXPORT_EXPERIENCE_OPTIONS constant ──
  it("exports EXPORT_EXPERIENCE_OPTIONS with 4 options", () => {
    const { result } = renderHook(() => useTrainingForm());
    expect(result.current.EXPORT_EXPERIENCE_OPTIONS).toEqual(["3年以内", "3-5年", "5-10年", "10年以上"]);
  });

  // ── 17. Sub-industries fetch failure for level2 → empty list ──
  it("handles level2 sub-industries fetch failure gracefully", async () => {
    mockFetchSubIndustries.mockRejectedValueOnce(new Error("Failed"));
    const { result } = renderHook(() => useTrainingForm());

    act(() => {
      result.current.handleChange({
        target: { name: "industry_id", value: "10" },
      } as React.ChangeEvent<HTMLSelectElement>);
    });

    await waitFor(() => {
      expect(result.current.level2Industries).toEqual([]);
    });
  });

  // ── 18. Sub-industries fetch failure for level3 → empty list ──
  it("handles level3 sub-industries fetch failure gracefully", async () => {
    mockFetchSubIndustries.mockImplementation((id: string) =>
      id === "10" ? Promise.resolve(mockLevel2) : Promise.reject(new Error("Failed"))
    );
    const { result } = renderHook(() => useTrainingForm());

    // Select level1
    act(() => {
      result.current.handleChange({
        target: { name: "industry_id", value: "10" },
      } as React.ChangeEvent<HTMLSelectElement>);
    });

    await waitFor(() => {
      expect(result.current.level2Industries.length).toBeGreaterThanOrEqual(0);
    });

    // Select level2 → level3 fetch fails
    act(() => {
      result.current.handleChange({
        target: { name: "industry_level2_id", value: "101" },
      } as React.ChangeEvent<HTMLSelectElement>);
    });

    await waitFor(() => {
      expect(result.current.level3Industries).toEqual([]);
    });
  });

  // ── 19. handleSubmit builds certification string correctly ──
  it("builds certification string from selected certs and other_certification", async () => {
    const { result } = renderHook(() => useTrainingForm());

    act(() => {
      result.current.toggleCertification("ISO9001");
      result.current.toggleCertification("CE");
      result.current.handleChange({ target: { name: "other_certification", value: "FSC" } } as React.ChangeEvent<HTMLInputElement>);
      result.current.handleChange({ target: { name: "company_name", value: "测试公司" } } as React.ChangeEvent<HTMLInputElement>);
      result.current.handleChange({ target: { name: "industry_id", value: "10" } } as React.ChangeEvent<HTMLSelectElement>);
      result.current.handleChange({ target: { name: "contact_name", value: "张三" } } as React.ChangeEvent<HTMLInputElement>);
      result.current.handleChange({ target: { name: "telephone", value: "13800138000" } } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    await waitFor(() => {
      expect(mockSubmitTrainingRegister).toHaveBeenCalledWith(
        expect.objectContaining({
          certification: "ISO9001, CE\nFSC",
        })
      );
    });
  });
});
