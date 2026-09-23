import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── 隔离 mock：保留真实 pickLocale，仅打桩 useLocale ──
vi.mock("@/core/i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/i18n")>();
  return { ...actual, useLocale: () => ({ t: (k: string) => k, locale: "zh" }) };
});

vi.mock("@/core/auth", () => ({
  useAuth: () => ({ isVip: false }),
  useUserId: () => undefined,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "123" }),
}));

// 弹窗仅在交互后渲染，打桩避免拉入重依赖
vi.mock("@/shared/components/SupplierContactModal", () => ({
  SupplierContactModal: () => null,
}));
vi.mock("@/features/supplier-profile/components/SupplierClaimModal", () => ({
  SupplierClaimModal: () => null,
}));

// ── 供应商数据：真实 mapSupplierRow 只写 complianceLabels*，不写 certifications ──
const { mockSupplier } = vi.hoisted(() => ({
  mockSupplier: {
    id: "sup-db-123",
    nameZh: "杭州某某机械有限公司",
    nameEn: "Hangzhou XX Machinery Co.",
    type: "domestic",
    industryZh: "机械",
    industryEn: "Machinery",
    countryZh: "中国",
    countryEn: "China",
    cityZh: "杭州",
    cityEn: "Hangzhou",
    mainProductsZh: ["数控机床"],
    mainProductsEn: ["CNC Machine"],
    // 真实认证数据落在 complianceLabels 上（与后端 mapSupplierRow 一致）
    complianceLabelsZh: ["ISO9001质量管理体系认证", "CE认证（欧盟）"],
    complianceLabelsEn: ["ISO9001", "CE"],
    // certifications 故意缺失——复现"详情页只读 certifications 导致恒空"的场景
    contactPerson: "",
    contactEmail: "",
    contactPhone: "",
    status: "approved",
    dataCompleteness: 80,
  } as any,
}));

vi.mock("@/features/supplier-profile/hooks/useSupplierProfile", () => ({
  useSupplierProfile: () => ({
    supplier: mockSupplier,
    loading: false,
    error: null,
    claimed: false,
  }),
}));

import { SupplierProfilePage } from "@/features/supplier-profile/components/SupplierProfilePage";

describe("SupplierProfilePage — 资质证书 Tab", () => {
  it("应展示真实认证数据（complianceLabels），而非空态", () => {
    render(<SupplierProfilePage />);
    // 切到「资质证书」Tab
    fireEvent.click(screen.getByText("profile_tabCerts"));

    expect(screen.getByText("ISO9001质量管理体系认证")).toBeInTheDocument();
    expect(screen.getByText("CE认证（欧盟）")).toBeInTheDocument();
    expect(screen.queryByText("暂无资质证书")).not.toBeInTheDocument();
  });
});
