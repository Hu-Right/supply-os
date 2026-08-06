import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TrainingPage from "@/features/training/pages/TrainingPage";

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
  pickLocale: (_l: string, zh: string, _en: string) => zh,
}));

const mockLevel1 = [
  { id: 10, code: "1000", title_zh: "机械设备", title_en: "Machinery", name: "机械设备" },
  { id: 20, code: "", title_zh: "电子元器件", title_en: "Electronics", name: "电子元器件" },
];
const mockLevel2 = [
  { id: 101, code: "1001", title_zh: "数控机床", title_en: "CNC", name: "数控机床" },
];
const mockLevel3 = [
  { id: 1001, code: "100101", title_zh: "五轴加工中心", title_en: "5-Axis CNC", name: "五轴加工中心" },
];
const mockCerts = [
  { id: 1, name: "ISO9001" },
  { id: 2, name: "CE" },
  { id: 3, name: "", title_zh: "FSC认证", title_en: "FSC Cert" },
];

describe("TrainingPage — additional branch coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchCertifications.mockResolvedValue(mockCerts);
    mockFetchIndustries.mockResolvedValue(mockLevel1);
    mockFetchSubIndustries.mockResolvedValue(mockLevel2);
    mockSubmitTrainingRegister.mockResolvedValue({ success: true });
  });

  // ── 1. labelOf with code and name ──
  it("renders industry options with code-name format", async () => {
    render(<TrainingPage />);
    await waitFor(() => {
      expect(screen.getByText("trainingSubmitBtn")).toBeInTheDocument();
    });

    // Level1 option with code: "1000 - 机械设备"
    const options = document.querySelectorAll('select[name="industry_id"] option');
    const texts = Array.from(options).map((o) => o.textContent);
    expect(texts).toContain("1000 - 机械设备");
  });

  // ── 2. labelOf without code (empty code) ──
  it("renders industry options without code prefix when code is empty", async () => {
    render(<TrainingPage />);
    await waitFor(() => {
      expect(screen.getByText("trainingSubmitBtn")).toBeInTheDocument();
    });

    const options = document.querySelectorAll('select[name="industry_id"] option');
    const texts = Array.from(options).map((o) => o.textContent);
    // Item with empty code should just show name
    expect(texts).toContain("电子元器件");
  });

  // ── 3. Certification toggle buttons ──
  it("renders certification toggle buttons from API data", async () => {
    render(<TrainingPage />);
    await waitFor(() => {
      expect(screen.getByText("ISO9001")).toBeInTheDocument();
      expect(screen.getByText("CE")).toBeInTheDocument();
    });
  });

  // ── 4. Certification with name fallback to title_zh ──
  it("renders certification with title_zh fallback when name is empty", async () => {
    render(<TrainingPage />);
    await waitFor(() => {
      expect(screen.getByText("FSC认证")).toBeInTheDocument();
    });
  });

  // ── 5. Export experience select options ──
  it("renders export experience select with all options", async () => {
    render(<TrainingPage />);
    await waitFor(() => {
      expect(screen.getByText("trainingFormExportExperience")).toBeInTheDocument();
    });

    const select = document.querySelector('select[name="export_experience"]') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.textContent);
    expect(options).toContain("3年以内");
    expect(options).toContain("3-5年");
    expect(options).toContain("5-10年");
    expect(options).toContain("10年以上");
  });

  // ── 6. Level2 select disabled when no level2 data ──
  it("disables level2 select when no level2 industries loaded", async () => {
    render(<TrainingPage />);
    await waitFor(() => {
      expect(screen.getByText("trainingSubmitBtn")).toBeInTheDocument();
    });

    const level2Select = document.querySelector('select[name="industry_level2_id"]') as HTMLSelectElement;
    expect(level2Select).toBeDisabled();
  });

  // ── 7. Level3 select disabled when no level3 data ──
  it("disables level3 select when no level3 industries loaded", async () => {
    render(<TrainingPage />);
    await waitFor(() => {
      expect(screen.getByText("trainingSubmitBtn")).toBeInTheDocument();
    });

    const level3Select = document.querySelector('select[name="industry_level3_id"]') as HTMLSelectElement;
    expect(level3Select).toBeDisabled();
  });

  // ── 8. Level2 enabled after level1 selection ──
  it("enables level2 select after level1 selection loads data", async () => {
    render(<TrainingPage />);
    await waitFor(() => {
      expect(screen.getByText("trainingSubmitBtn")).toBeInTheDocument();
    });

    const level1Select = document.querySelector('select[name="industry_id"]') as HTMLSelectElement;
    fireEvent.change(level1Select, { target: { value: "10", name: "industry_id" } });

    await waitFor(() => {
      const level2Select = document.querySelector('select[name="industry_level2_id"]') as HTMLSelectElement;
      expect(level2Select).not.toBeDisabled();
    });
  });

  // ── 9. Textarea remark field renders ──
  it("renders remark textarea field", async () => {
    render(<TrainingPage />);
    await waitFor(() => {
      expect(screen.getByText("trainingFormRemark")).toBeInTheDocument();
    });

    const textarea = document.querySelector('textarea[name="remark"]') as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.rows).toBe(3);
  });

  // ── 10. Submit button disabled state during loading ──
  it("disables submit button during loading", async () => {
    // Make submit hang
    mockSubmitTrainingRegister.mockImplementation(() => new Promise(() => {}));

    render(<TrainingPage />);
    await waitFor(() => {
      expect(screen.getByText("trainingSubmitBtn")).toBeInTheDocument();
    });

    // Fill required fields
    fireEvent.input(document.querySelector('input[name="company_name"]')!, { target: { value: "测试公司", name: "company_name" } });
    fireEvent.input(document.querySelector('input[name="contact_name"]')!, { target: { value: "张三", name: "contact_name" } });
    fireEvent.input(document.querySelector('input[name="telephone"]')!, { target: { value: "13800138000", name: "telephone" } });
    fireEvent.change(document.querySelector('select[name="industry_id"]')!, { target: { value: "10", name: "industry_id" } });

    // Submit
    fireEvent.click(screen.getByText("trainingSubmitBtn").closest("button")!);

    await waitFor(() => {
      expect(screen.getByText("trainingSubmitting")).toBeInTheDocument();
    });

    const submitBtn = screen.getByText("trainingSubmitting").closest("button")!;
    expect(submitBtn).toBeDisabled();
  });

  // ── 11. displayName is set ──
  it("has displayName set", () => {
    expect(TrainingPage.displayName).toBe("TrainingPage");
  });

  // ── 12. Hero section renders correctly ──
  it("renders hero section with icon and title", async () => {
    render(<TrainingPage />);
    await waitFor(() => {
      expect(screen.getByText("trainingPageTitle")).toBeInTheDocument();
      expect(screen.getByText("trainingPageSubtitle")).toBeInTheDocument();
    });
  });

  // ── 13. Position field renders ──
  it("renders position field", async () => {
    render(<TrainingPage />);
    await waitFor(() => {
      expect(screen.getByText("trainingFormPosition")).toBeInTheDocument();
    });
  });

  // ── 14. Other certification input renders ──
  it("renders other certification input field", async () => {
    render(<TrainingPage />);
    await waitFor(() => {
      // The placeholder is rendered as an attribute, not text content
      expect(screen.getByPlaceholderText("trainingFormOtherCertPlaceholder")).toBeInTheDocument();
    });
  });
});
