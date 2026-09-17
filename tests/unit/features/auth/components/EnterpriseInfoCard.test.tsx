import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

import { EnterpriseInfoCard } from "@/features/auth/components/EnterpriseInfoCard";
import type { Supplier } from "@/types";

const mockSupplier = {
  id: "sup-db-1",
  nameZh: "测试企业有限公司",
  nameEn: "Test Co",
  type: "domestic",
  industryZh: "信息技术",
  industryEn: "IT",
  countryZh: "中国",
  countryEn: "China",
  cityZh: "深圳",
  cityEn: "Shenzhen",
  mainProductsZh: ["服务器", "交换机"],
  mainProductsEn: ["server", "switch"],
  complianceLabelsZh: ["ISO 9001", "CE"],
  complianceLabelsEn: ["ISO 9001", "CE"],
  contactPerson: "",
  contactEmail: "",
  contactPhone: "",
  status: "approved",
} as Supplier;

const noop = vi.fn();

describe("EnterpriseInfoCard", () => {
  it("加载中显示骨架屏", () => {
    const { container } = render(
      <EnterpriseInfoCard supplier={null} loading error={null} onRetry={noop} onManage={noop} onBind={noop} />,
    );
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("加载失败显示错误与重试", () => {
    render(
      <EnterpriseInfoCard supplier={null} loading={false} error="boom" onRetry={noop} onManage={noop} onBind={noop} />,
    );
    expect(screen.getByText("authEnterpriseLoadError")).toBeInTheDocument();
    expect(screen.getByText("authEnterpriseRetry")).toBeInTheDocument();
  });

  it("未绑定显示引导与立即绑定", () => {
    render(
      <EnterpriseInfoCard supplier={null} loading={false} error={null} onRetry={noop} onManage={noop} onBind={noop} />,
    );
    expect(screen.getByText("authEnterpriseNotBoundDesc")).toBeInTheDocument();
    expect(screen.getByText("authEnterpriseBindNow")).toBeInTheDocument();
  });

  it("已绑定显示企业名称与管理按钮", () => {
    render(
      <EnterpriseInfoCard supplier={mockSupplier} loading={false} error={null} onRetry={noop} onManage={noop} onBind={noop} />,
    );
    expect(screen.getByText("测试企业有限公司")).toBeInTheDocument();
    expect(screen.getByText("authEnterpriseManage")).toBeInTheDocument();
    // 资质/产品以 、 join 展示
    expect(screen.getByText("ISO 9001、CE")).toBeInTheDocument();
    expect(screen.getByText("服务器、交换机")).toBeInTheDocument();
  });
});
