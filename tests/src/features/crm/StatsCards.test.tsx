/**
 * features/crm/components/StatsCards 组件测试
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// 补充全局 mock 缺失的图标
vi.mock("lucide-react", () => {
  const Stub = () => null;
  return { Activity: Stub, Clock: Stub, TrendingUp: Stub, Users: Stub };
});

import { StatsCards } from "@/features/crm/components/StatsCards";
import type { Lead } from "@/types";

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "L1",
    companyName: "Test Co",
    country: "CN",
    city: "Beijing",
    contactPerson: "Alice",
    contactMethod: "email",
    email: "a@x.com",
    industry: "Tech",
    mainProducts: "SW",
    hasIntlProcurement: false,
    notes: "",
    type: "custom",
    status: "new",
    createdAt: "2026-01-01",
    followUpLogs: [],
    ...overrides,
  };
}

const labels = {
  leadCount: "线索数",
  oppCount: "商机数",
  clientPool: "客户池",
  followUpHistory: "跟进记录",
};

describe("StatsCards", () => {
  it("渲染 4 张统计卡片", () => {
    render(<StatsCards leads={[makeLead()]} labels={labels} />);
    expect(screen.getByText("线索数")).toBeInTheDocument();
    expect(screen.getByText("商机数")).toBeInTheDocument();
    expect(screen.getByText("客户池")).toBeInTheDocument();
    expect(screen.getByText("跟进记录")).toBeInTheDocument();
  });

  it("线索数等于 leads.length", () => {
    const leads = [makeLead({ id: "1" }), makeLead({ id: "2" }), makeLead({ id: "3" })];
    const { container } = render(<StatsCards leads={leads} labels={labels} />);
    // 第一张卡片（线索数）的值
    const vals = container.querySelectorAll(".font-black");
    expect(vals[0].textContent).toBe("3");
  });

  it("客户池统计 qualified + contacted", () => {
    const leads = [
      makeLead({ id: "1", status: "qualified" }),
      makeLead({ id: "2", status: "contacted" }),
      makeLead({ id: "3", status: "new" }),
      makeLead({ id: "4", status: "lost" }),
    ];
    const { container } = render(<StatsCards leads={leads} labels={labels} />);
    // 第三张卡片（客户池）的值 = 2
    const vals = container.querySelectorAll(".font-black");
    expect(vals[2].textContent).toBe("2");
  });

  it("跟进记录统计 followUpLogs 总数", () => {
    const leads = [
      makeLead({ id: "1", followUpLogs: [{ date: "d1", content: "c1", author: "a" }] }),
      makeLead({
        id: "2",
        followUpLogs: [
          { date: "d1", content: "c1", author: "a" },
          { date: "d2", content: "c2", author: "a" },
        ],
      }),
      makeLead({ id: "3" }), // 0 logs
    ];
    const { container } = render(<StatsCards leads={leads} labels={labels} />);
    // 第四张卡片（跟进记录）的值 = 3
    const vals = container.querySelectorAll(".font-black");
    expect(vals[3].textContent).toBe("3");
  });

  it("空 leads 时线索数为 0", () => {
    const { container } = render(<StatsCards leads={[]} labels={labels} />);
    // 第一张卡片（线索数）= 0
    const vals = container.querySelectorAll(".font-black");
    expect(vals[0].textContent).toBe("0");
  });

  it("displayName 为 StatsCards", () => {
    expect(StatsCards.displayName).toBe("StatsCards");
  });
});
