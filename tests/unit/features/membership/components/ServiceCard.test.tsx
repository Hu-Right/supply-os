/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ServiceCatalogRow } from "@/types/membership";

vi.mock("@/core/i18n", () => ({ useLocale: () => ({ t: (k: string) => k, locale: "zh" }) }));
vi.mock("@/features/membership/components/ContactQrModal", () => ({
  ContactQrModal: ({ open }: { open: boolean }) => (open ? <div>QR-MODAL</div> : null),
}));

import { ServiceCard } from "@/features/membership/components/ServiceCard";

const row = (over: Partial<ServiceCatalogRow>): ServiceCatalogRow => ({
  service_code: "svc_x", category: "pro_service", name_zh: "AI 单标解析", name_en: "AI Tender",
  price_mode: "per_unit", standard_price: "199.00", price_from: 0, currency: "CNY",
  sale_mode: "self", member_discount: 0, deliverable_note_zh: "说明", sort_order: 1, ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("ServiceCard", () => {
  it("有价：显示价格与「立即支付」，点击回调 onPay(row)", () => {
    const onPay = vi.fn();
    const r = row({});
    render(<ServiceCard row={r} onPay={onPay} />);
    expect(screen.getByText(/199/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /svcCtaPay/ }));
    expect(onPay).toHaveBeenCalledWith(r);
  });

  it("price_from=1 显示「起」", () => {
    render(<ServiceCard row={row({ standard_price: "9800.00", price_mode: "contact", price_from: 1 })} onPay={vi.fn()} />);
    expect(screen.getByText("svcPriceFrom")).toBeInTheDocument();
  });

  it("无价：显示定制报价标签 + 「扫码咨询」，点击开客服码", () => {
    render(<ServiceCard row={row({ standard_price: null, price_mode: "quote" })} onPay={vi.fn()} />);
    expect(screen.getByText("svcLabelQuote")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /svcCtaConsult/ }));
    expect(screen.getByText("QR-MODAL")).toBeInTheDocument();
  });
});
