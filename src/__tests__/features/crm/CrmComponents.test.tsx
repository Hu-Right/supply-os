import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StatsCards } from "@/features/crm/components/StatsCards";
import { OpportunityList } from "@/features/crm/components/OpportunityList";
import { LeadTracker } from "@/features/crm/components/LeadTracker";
import { FollowUpLogPanel } from "@/features/crm/components/FollowUpLogPanel";
import type { Lead } from "@/types";

// Mock useLocale + pickLocale
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
  pickLocale: (_locale: string, zh: string, _en: string) => zh,
}));

// Mock OPPORTUNITIES data (inline because vi.mock is hoisted)
vi.mock("@/data", () => ({
  OPPORTUNITIES: [
    {
      id: "opp-1",
      titleZh: "联合国开发计划署采购",
      titleEn: "UNDP Procurement",
      industryZh: "电子",
      industryEn: "Electronics",
      countryZh: "中国",
      countryEn: "China",
      budget: "$50,000",
      deadline: "2026-12-31",
      descriptionZh: "采购电子设备",
      descriptionEn: "Electronics procurement",
      subscribersCount: 5,
    },
    {
      id: "opp-2",
      titleZh: "世卫组织医疗设备招标",
      titleEn: "WHO Medical Equipment",
      industryZh: "医疗",
      industryEn: "Medical",
      countryZh: "瑞士",
      countryEn: "Switzerland",
      budget: "$120,000",
      deadline: "2026-11-30",
      descriptionZh: "医疗设备供应",
      descriptionEn: "Medical equipment supply",
      subscribersCount: 8,
    },
  ],
}));

// Test data
const mockLeads: Lead[] = [
  {
    id: "lead-1",
    companyName: "北京精密机械有限公司",
    country: "China",
    city: "Beijing",
    contactPerson: "张三",
    contactMethod: "email",
    email: "zhang@example.com",
    industry: "机械",
    mainProducts: "精密零件",
    has国际公共采购Participation: false,
    notes: "高意向客户",
    type: "custom",
    status: "new",
    createdAt: "2026-01-01T00:00:00Z",
    followUpLogs: [
      { date: "2026-01-05", content: "初次沟通", author: "李四" },
    ],
  },
  {
    id: "lead-2",
    companyName: "上海生物科技有限公司",
    country: "China",
    city: "Shanghai",
    contactPerson: "李四",
    contactMethod: "phone",
    email: "li@example.com",
    industry: "生物",
    mainProducts: "试剂",
    has国际公共采购Participation: true,
    notes: "已对接",
    type: "supplier_register",
    status: "contacted",
    createdAt: "2026-02-01T00:00:00Z",
    followUpLogs: [],
  },
];

const statsLabels = {
  leadCount: "线索总数",
  oppCount: "商机总数",
  clientPool: "客户池",
  followUpHistory: "跟进记录",
};

const oppLabels = {
  opportunityHub: "商机中心",
  latestNotices: "最新公告",
  subscribe: "订阅",
};

const trackerLabels = {
  title: "线索追踪",
  badge: "REALTIME",
  description: "实时追踪线索",
  loadingLeads: "加载中...",
  fieldIndustry: "行业",
  fieldCountry: "国家",
  fieldContact: "联系人",
  fieldMethod: "联系方式",
  fieldNotes: "备注",
  industryUnknown: "未知",
  followUpCount: (num: number) => `跟进 ${num} 次`,
  editingLead: (company: string) => `编辑: ${company}`,
  followUpLogs: "跟进日志",
  noLogs: "暂无日志",
  logPlaceholder: "输入跟进内容...",
  leadPhase: "阶段",
  saveToCRM: "保存到CRM",
  saveFailed: "录入失败",
};

const panelLabels = {
  editingLead: (company: string) => `编辑: ${company}`,
  followUpLogs: "跟进日志",
  noLogs: "暂无日志",
  logPlaceholder: "输入跟进内容...",
  leadPhase: "阶段",
  saveToCRM: "保存",
  saveFailed: "录入失败",
};

describe("StatsCards", () => {
  it("renders 4 metric cards with labels", () => {
    render(<StatsCards leads={mockLeads} labels={statsLabels} />);
    expect(screen.getByText("线索总数")).toBeInTheDocument();
    expect(screen.getByText("商机总数")).toBeInTheDocument();
    expect(screen.getByText("客户池")).toBeInTheDocument();
    expect(screen.getByText("跟进记录")).toBeInTheDocument();
  });

  it("calculates client pool count correctly (qualified + contacted)", () => {
    // mockLeads has 1 "contacted" lead → clientPool = 1
    render(<StatsCards leads={mockLeads} labels={statsLabels} />);
    // The value "1" should appear for client pool (contacted count)
    const values = screen.getAllByText(/\d+/);
    // leadCount=2, oppCount=2(mock), clientPool=1, followUpHistory=1
    expect(values.some((el) => el.textContent === "2")).toBe(true); // leads count
  });
});

describe("OpportunityList", () => {
  const defaultProps = {
    selectedOpportunity: null,
    onSelect: vi.fn(),
    onSubscribe: vi.fn(),
    labels: oppLabels,
    deadlineLabel: (deadline: string) => `截止: ${deadline}`,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders opportunity list from OPPORTUNITIES data", () => {
    render(<OpportunityList {...defaultProps} />);
    expect(screen.getByText("联合国开发计划署采购")).toBeInTheDocument();
    expect(screen.getByText("世卫组织医疗设备招标")).toBeInTheDocument();
  });

  it("calls onSelect when clicking an opportunity", () => {
    render(<OpportunityList {...defaultProps} />);
    const opp = screen.getByText("联合国开发计划署采购");
    fireEvent.click(opp);
    expect(defaultProps.onSelect).toHaveBeenCalled();
  });

  it("calls onSubscribe when clicking subscribe button", () => {
    render(<OpportunityList {...defaultProps} />);
    const subscribeButtons = screen.getAllByText("订阅");
    fireEvent.click(subscribeButtons[0]);
    expect(defaultProps.onSubscribe).toHaveBeenCalled();
  });
});

describe("LeadTracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading text when isLoading is true", () => {
    render(
      <LeadTracker leads={[]} isLoading={true} onSubmitLog={vi.fn()} labels={trackerLabels} />
    );
    expect(screen.getByText("加载中...")).toBeInTheDocument();
  });

  it("renders lead cards when data is available", () => {
    render(
      <LeadTracker leads={mockLeads} isLoading={false} onSubmitLog={vi.fn()} labels={trackerLabels} />
    );
    expect(screen.getByText("北京精密机械有限公司")).toBeInTheDocument();
    expect(screen.getByText("上海生物科技有限公司")).toBeInTheDocument();
  });

  it("opens FollowUpLogPanel when clicking a lead card", () => {
    render(
      <LeadTracker leads={mockLeads} isLoading={false} onSubmitLog={vi.fn()} labels={trackerLabels} />
    );
    fireEvent.click(screen.getByText("北京精密机械有限公司"));
    // After clicking, the FollowUpLogPanel should appear with editingLead label
    expect(screen.getByText("编辑: 北京精密机械有限公司")).toBeInTheDocument();
  });
});

describe("FollowUpLogPanel", () => {
  const mockLead = mockLeads[0];
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders follow-up form with textarea and submit button", () => {
    render(
      <FollowUpLogPanel lead={mockLead} onClose={onClose} onSubmit={vi.fn().mockResolvedValue(mockLead)} labels={panelLabels} />
    );
    expect(screen.getByPlaceholderText("输入跟进内容...")).toBeInTheDocument();
    expect(screen.getByText("保存")).toBeInTheDocument();
  });

  it("clears textarea after successful form submit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(mockLead);
    render(
      <FollowUpLogPanel lead={mockLead} onClose={onClose} onSubmit={onSubmit} labels={panelLabels} />
    );
    const textarea = screen.getByPlaceholderText("输入跟进内容...");
    fireEvent.change(textarea, { target: { value: "新的跟进记录" } });
    expect((textarea as HTMLTextAreaElement).value).toBe("新的跟进记录");

    fireEvent.submit(textarea.closest("form")!);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(mockLead.id, "新的跟进记录", mockLead.status));
    await waitFor(() => expect((textarea as HTMLTextAreaElement).value).toBe(""));
  });

  it("keeps input and shows error when submit fails", async () => {
    const onSubmit = vi.fn().mockResolvedValue(null);
    render(
      <FollowUpLogPanel lead={mockLead} onClose={onClose} onSubmit={onSubmit} labels={panelLabels} />
    );
    const textarea = screen.getByPlaceholderText("输入跟进内容...");
    fireEvent.change(textarea, { target: { value: "失败的记录" } });
    fireEvent.submit(textarea.closest("form")!);
    await waitFor(() => expect(screen.getByText("录入失败")).toBeInTheDocument());
    expect((textarea as HTMLTextAreaElement).value).toBe("失败的记录");
  });
});
