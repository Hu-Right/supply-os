import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SupplierContactModal } from "@/features/supplier/components/SupplierContactModal";

// ── Mock useLocale（t 返回 key）与 pickLocale ──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
  pickLocale: (l: string, zh: string, en: string) => (l === "zh" ? zh : en),
}));

const supplier = { id: "s1", nameZh: "测试供应商", nameEn: "Test Supplier" } as any;

describe("SupplierContactModal", () => {
  it("vipOnly: upgrade button dispatches supply-os:require-vip and closes", () => {
    const onClose = vi.fn();
    const listener = vi.fn();
    window.addEventListener("supply-os:require-vip", listener);
    render(
      <SupplierContactModal supplier={supplier} status="vipOnly" contact={null} onClose={onClose} />
    );
    expect(screen.getByText("supplierContactVipOnly")).toBeInTheDocument();
    fireEvent.click(screen.getByText("supplierContactUpgradeBtn"));
    expect(onClose).toHaveBeenCalled();
    expect(listener).toHaveBeenCalled();
    window.removeEventListener("supply-os:require-vip", listener);
  });

  it("success: renders three fields with mailto/tel links (dir=ltr)", () => {
    render(
      <SupplierContactModal
        supplier={supplier}
        status="success"
        contact={{ contactPerson: "张三", contactEmail: "a@b.com", contactPhone: "138001" }}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("张三")).toBeInTheDocument();
    // 邮箱/电话为 mailto/tel 链接，dir="ltr" 保证阿语环境下不乱序
    const mail = screen.getByText("a@b.com");
    expect(mail).toHaveAttribute("href", "mailto:a@b.com");
    expect(mail).toHaveAttribute("dir", "ltr");
    const tel = screen.getByText("138001");
    expect(tel).toHaveAttribute("href", "tel:138001");
    expect(tel).toHaveAttribute("dir", "ltr");
  });

  it("loading: shows spinner and loading text", () => {
    render(
      <SupplierContactModal supplier={supplier} status="loading" contact={null} onClose={vi.fn()} />
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("supplierContactLoading")).toBeInTheDocument();
  });

  it("error: shows failure hint and close button triggers onClose", () => {
    const onClose = vi.fn();
    render(
      <SupplierContactModal supplier={supplier} status="error" contact={null} onClose={onClose} />
    );
    expect(screen.getByText("supplierContactFailed")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("关闭"));
    expect(onClose).toHaveBeenCalled();
  });
});
