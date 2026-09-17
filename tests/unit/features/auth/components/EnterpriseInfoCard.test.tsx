import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

import { EnterpriseInfoCard } from "@/features/auth/components/EnterpriseInfoCard";
import type { EnterpriseInfo } from "@/features/auth/hooks/useEnterpriseInfo";

const mockEnterprise: EnterpriseInfo = {
  id: 1,
  companyName: "测试企业有限公司",
  enterpriseNature: "工厂",
  supplierGrade: "L2",
  industry: "信息技术",
  mainProduct: "服务器、交换机",
  certification: "ISO 9001、CE",
  exportExperience: "3 年",
  country: "中国",
  dataQualityScore: 88.5,
  createdAt: "2026-01-15T00:00:00.000Z",
  registrationCount: 1,
  isPaid: false,
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

  it("已绑定展示企业表字段", () => {
    render(
      <EnterpriseInfoCard enterprise={mockEnterprise} loading={false} error={null} onRetry={noop} onBind={noop} />,
    );
    expect(screen.getByText("测试企业有限公司")).toBeInTheDocument();
    expect(screen.getByText("ISO 9001、CE")).toBeInTheDocument();
    expect(screen.getByText("服务器、交换机")).toBeInTheDocument();
    expect(screen.getByText("88.5")).toBeInTheDocument();
    expect(screen.getByText("2026-01-15")).toBeInTheDocument();
  });
});
