import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import CrmPage from "@/features/crm/pages/CrmPage";

// Mock useLocale
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
  pickLocale: (_locale: string, zh: string, _en: string) => zh,
}));

// Mock useCrmData
const mockUseCrmData = vi.fn();
vi.mock("@/features/crm/hooks/useCrmData", () => ({
  useCrmData: (...args: any[]) => mockUseCrmData(...args),
}));

const mockLead = {
  id: "lead-1",
  companyName: "测试科技有限公司",
  country: "China",
  city: "Beijing",
  contactPerson: "张三",
  contactMethod: "email",
  email: "test@example.com",
  industry: "电子",
  mainProducts: "芯片",
  has国际公共采购Participation: false,
  notes: "测试备注",
  type: "custom" as const,
  status: "new" as const,
  createdAt: "2026-01-01T00:00:00Z",
  followUpLogs: [],
};

function defaultCrmData(overrides = {}) {
  return {
    leads: [],
    isLoadingLeads: false,
    totalSuppliersList: [],
    matchSelectedSupplier: null,
    matchSelectedOpportunity: null,
    isAiMatching: false,
    aiReport: "",
    subscribingOppMessage: null,
    setMatchSelectedSupplier: vi.fn(),
    setMatchSelectedOpportunity: vi.fn(),
    triggerAiMatchmaking: vi.fn(),
    subscribeOpportunity: vi.fn(),
    ...overrides,
  };
}

describe("CrmPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCrmData.mockReturnValue(defaultCrmData());
  });

  it("renders StatsCards section", () => {
    render(<CrmPage />);
    // StatsCards renders labels: leadCount, oppCount, clientPool, crmFollowUpHistory
    expect(screen.getByText("leadCount")).toBeInTheDocument();
    expect(screen.getByText("oppCount")).toBeInTheDocument();
  });

  it("renders OpportunityList section", () => {
    render(<CrmPage />);
    expect(screen.getByText("opportunityHub")).toBeInTheDocument();
  });

  it("renders AiMatchmaker section", () => {
    render(<CrmPage />);
    expect(screen.getByText("aiMatchmaking")).toBeInTheDocument();
  });

  it("renders LeadTracker section", () => {
    render(<CrmPage />);
    expect(screen.getByText("leadTracker")).toBeInTheDocument();
  });

  it("shows loading text when isLoadingLeads is true", () => {
    mockUseCrmData.mockReturnValue(
      defaultCrmData({ isLoadingLeads: true })
    );
    render(<CrmPage />);
    expect(screen.getByText("crmLoadingLeads")).toBeInTheDocument();
  });

  it("renders lead cards when leads data is available", () => {
    mockUseCrmData.mockReturnValue(
      defaultCrmData({ leads: [mockLead] })
    );
    render(<CrmPage />);
    expect(screen.getByText("测试科技有限公司")).toBeInTheDocument();
  });
});
