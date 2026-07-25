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

// ── Mock useLocale ──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
  pickLocale: (_l: string, zh: string, _en: string) => zh,
}));

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
const mockCerts = [
  { id: 1, name: "ISO9001" },
  { id: 2, name: "CE" },
];

describe("TrainingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchCertifications.mockResolvedValue(mockCerts);
    mockFetchIndustries.mockResolvedValue(mockLevel1);
    mockFetchSubIndustries.mockResolvedValue(mockLevel2);
    mockSubmitTrainingRegister.mockResolvedValue({ success: true });
  });

  it("renders form fields and hero section", async () => {
    render(<TrainingPage />);
    // Wait for async data loading to settle
    await waitFor(() => {
      expect(screen.getByText("trainingSubmitBtn")).toBeInTheDocument();
    });
    // Hero section
    expect(screen.getByText("trainingPageTitle")).toBeInTheDocument();
    expect(screen.getByText("trainingPageSubtitle")).toBeInTheDocument();
    // Form fields
    expect(screen.getByText("trainingFormCompanyName")).toBeInTheDocument();
    expect(screen.getByText("trainingFormContactName")).toBeInTheDocument();
    expect(screen.getByText("trainingFormPhone")).toBeInTheDocument();
    expect(screen.getByText("trainingFormEmail")).toBeInTheDocument();
    // Submit button
    expect(screen.getByText("trainingSubmitBtn")).toBeInTheDocument();
  });

  it("loads certifications and level1 industries on mount", async () => {
    render(<TrainingPage />);
    await waitFor(() => {
      expect(screen.getByText("ISO9001")).toBeInTheDocument();
      expect(screen.getByText("CE")).toBeInTheDocument();
    });
    expect(mockFetchCertifications).toHaveBeenCalled();
    expect(mockFetchIndustries).toHaveBeenCalled();
    // Check that level1 options rendered
    const options = document.querySelectorAll('select[name="industry_id"] option');
    expect(options.length).toBeGreaterThanOrEqual(3); // empty + 2 items
  });

  it("cascading: selecting level1 loads level2", async () => {
    render(<TrainingPage />);
    await waitFor(() => {
      expect(screen.getByText("ISO9001")).toBeInTheDocument();
    });

    // Select level1
    const level1Select = document.querySelector('select[name="industry_id"]') as HTMLSelectElement;
    fireEvent.change(level1Select, { target: { value: "10", name: "industry_id" } });

    await waitFor(() => {
      expect(mockFetchSubIndustries).toHaveBeenCalledWith("10");
    });
  });

  it("validation error when required fields empty", async () => {
    render(<TrainingPage />);
    await waitFor(() => {
      expect(screen.getByText("trainingSubmitBtn")).toBeInTheDocument();
    });

    // Click submit without filling required fields
    const submitBtn = screen.getByText("trainingSubmitBtn").closest("button")!;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("trainingValidationError")).toBeInTheDocument();
    });
    // Should NOT call submit API
    expect(mockSubmitTrainingRegister).not.toHaveBeenCalled();
  });

  it("successful submission shows success message", async () => {
    render(<TrainingPage />);
    await waitFor(() => {
      expect(screen.getByText("trainingSubmitBtn")).toBeInTheDocument();
    });

    // Fill required fields
    const companyName = document.querySelector('input[name="company_name"]') as HTMLInputElement;
    const contactName = document.querySelector('input[name="contact_name"]') as HTMLInputElement;
    const telephone = document.querySelector('input[name="telephone"]') as HTMLInputElement;
    const level1Select = document.querySelector('select[name="industry_id"]') as HTMLSelectElement;

    fireEvent.input(companyName, { target: { value: "测试公司", name: "company_name" } });
    fireEvent.input(contactName, { target: { value: "张三", name: "contact_name" } });
    fireEvent.input(telephone, { target: { value: "13800138000", name: "telephone" } });
    fireEvent.change(level1Select, { target: { value: "10", name: "industry_id" } });

    // Submit
    const submitBtn = screen.getByText("trainingSubmitBtn").closest("button")!;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockSubmitTrainingRegister).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText("trainingSubmittedTitle")).toBeInTheDocument();
    });
  });

  it("failed submission shows error message", async () => {
    mockSubmitTrainingRegister.mockRejectedValueOnce(new Error("Network error"));
    render(<TrainingPage />);
    await waitFor(() => {
      expect(screen.getByText("trainingSubmitBtn")).toBeInTheDocument();
    });

    // Fill required fields
    const companyName = document.querySelector('input[name="company_name"]') as HTMLInputElement;
    const contactName = document.querySelector('input[name="contact_name"]') as HTMLInputElement;
    const telephone = document.querySelector('input[name="telephone"]') as HTMLInputElement;
    const level1Select = document.querySelector('select[name="industry_id"]') as HTMLSelectElement;

    fireEvent.input(companyName, { target: { value: "测试公司", name: "company_name" } });
    fireEvent.input(contactName, { target: { value: "张三", name: "contact_name" } });
    fireEvent.input(telephone, { target: { value: "13800138000", name: "telephone" } });
    fireEvent.change(level1Select, { target: { value: "10", name: "industry_id" } });

    const submitBtn = screen.getByText("trainingSubmitBtn").closest("button")!;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });
});
