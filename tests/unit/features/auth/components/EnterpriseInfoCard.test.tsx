import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

import { EnterpriseInfoCard } from "@/features/auth/components/EnterpriseInfoCard";
import type { EnterpriseInfo } from "@/shared/hooks/useEnterpriseInfo";

// supplier 企业表整行（snake_case 列名）
const mockRow: EnterpriseInfo = {
  id: 54,
  company: "宝通集团有限公司",
  name_confirmed: "宝通集团有限公司",
  country: "中国",
  country_code: "CN",
  province: "上海",
  city: "上海",
  address: "上海市徐汇区定安路55号",
  registered_address: "香港九龙观塘成业街27号",
  addtime: 1780000000,
  data_quality_score: "75.00",
  contact: "卢慧慧",
  position: "销售经理",
  phone: "15849125405",
  email: "huihui.lu@ex-channel.com",
  website: "-",
  legal_rep: "-",
  established_at: "2003-09-19",
  registered_capital: "3000万元",
  credit_code: "-",
  industry: "it",
  type: "国内",
  certification: "-",
  products: "智算模块",
  intro: "智算模块提供商",
  coop_status: 1,
};

const noop = vi.fn();

describe("EnterpriseInfoCard", () => {
  it("加载中显示骨架屏", () => {
    const { container } = render(
      <EnterpriseInfoCard enterprise={null} loading error={null} onRetry={noop} onBind={noop} />,
    );
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("加载失败显示错误与重试", () => {
    render(
      <EnterpriseInfoCard enterprise={null} loading={false} error="boom" onRetry={noop} onBind={noop} />,
    );
    expect(screen.getByText("authEnterpriseLoadError")).toBeInTheDocument();
    expect(screen.getByText("authEnterpriseRetry")).toBeInTheDocument();
  });

  it("未绑定显示引导与立即绑定", () => {
    render(
      <EnterpriseInfoCard enterprise={null} loading={false} error={null} onRetry={noop} onBind={noop} />,
    );
    expect(screen.getByText("authEnterpriseNotBoundDesc")).toBeInTheDocument();
    expect(screen.getByText("authEnterpriseBindNow")).toBeInTheDocument();
  });

  it("已绑定渲染分组表格（公司名/分组标题/字段值）", () => {
    render(
      <EnterpriseInfoCard enterprise={mockRow} loading={false} error={null} onRetry={noop} onBind={noop} />,
    );
    // 头部公司名 + 确认后公司名单元格（多处出现）
    expect(screen.getAllByText("宝通集团有限公司").length).toBeGreaterThan(0);
    expect(screen.getByText("authEnterpriseDomestic")).toBeInTheDocument();
    expect(screen.getByText("authEnterpriseCoop")).toBeInTheDocument();
    // 三个分组标题
    expect(screen.getByText("settingsBasicInfo")).toBeInTheDocument();
    expect(screen.getByText("authEnterpriseGroupContact")).toBeInTheDocument();
    expect(screen.getByText("authEnterpriseGroupBusiness")).toBeInTheDocument();
    // 字段值（联系/工商）
    expect(screen.getByText("卢慧慧")).toBeInTheDocument();
    expect(screen.getByText("3000万元")).toBeInTheDocument();
    expect(screen.getByText("智算模块")).toBeInTheDocument();
    // 资料完整度百分比
    expect(screen.getByText("75.00%")).toBeInTheDocument();
  });

  it("认证标三态：审核中/已认证/已驳回", () => {
    const { rerender } = render(
      <EnterpriseInfoCard enterprise={{ ...mockRow, verify_status: "pending" }} loading={false} error={null} onRetry={noop} onBind={noop} />,
    );
    expect(screen.getByText("authEnterpriseVerifyProcessing")).toBeInTheDocument();

    rerender(
      <EnterpriseInfoCard enterprise={{ ...mockRow, verify_status: "done" }} loading={false} error={null} onRetry={noop} onBind={noop} />,
    );
    expect(screen.getByText("authEnterpriseVerifyApproved")).toBeInTheDocument();

    rerender(
      <EnterpriseInfoCard enterprise={{ ...mockRow, verify_status: "rejected", check_note: "资质不全" }} loading={false} error={null} onRetry={noop} onBind={noop} />,
    );
    expect(screen.getByText("authEnterpriseVerifyRejected")).toBeInTheDocument();
    expect(screen.getByText(/资质不全/)).toBeInTheDocument();
  });
});
