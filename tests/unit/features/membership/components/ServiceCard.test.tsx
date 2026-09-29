/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ServiceCatalogRow } from "@/types/membership";

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({
    t: (k: string, p?: { name?: string }) => (p?.name ? `${k}:${p.name}` : k),
    locale: "zh",
  }),
}));
vi.mock("@/features/membership/components/ContactQrModal", () => ({
  // DEFAULT-HINT 代表调用方没传 hint，弹窗会回落到「机构/API 版」默认文案——那是错的。
  ContactQrModal: ({ open, hint }: { open: boolean; hint?: string }) =>
    open ? (
      <div>
        <span>QR-MODAL</span>
        <span data-testid="qr-hint">{hint ?? "DEFAULT-HINT"}</span>
      </div>
    ) : null,
}));

import { ServiceCard } from "@/features/membership/components/ServiceCard";

const row = (over: Partial<ServiceCatalogRow>): ServiceCatalogRow => ({
  service_code: "svc_x", category: "pro_service", name_zh: "AI 单标解析", name_en: "AI Tender",
  price_mode: "per_unit", standard_price: "199.00", price_from: 0, currency: "CNY",
  sale_mode: "self", member_discount: "none", credit_to_annual_plan: 0, deliverable_note_zh: "说明", sort_order: 1, ...over,
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

  // 报价表「500元~3,000元/单」类行：价格锚点要显示，但收款不能落在底价。
  it("起点价行：仍显示「起 ¥500」但按钮是「预约顾问」，不走 onPay", () => {
    const onPay = vi.fn();
    render(<ServiceCard row={row({ standard_price: "500.00", price_from: 1 })} onPay={onPay} />);
    expect(screen.getByText("svcPriceFrom")).toBeInTheDocument();
    expect(screen.getByText(/500/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /svcCtaPay/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /svcCtaConsult/ }));
    expect(onPay).not.toHaveBeenCalled();
  });

  it("无价：显示定制报价标签，点「预约顾问」开客服码", () => {
    render(<ServiceCard row={row({ standard_price: null, price_mode: "quote" })} onPay={vi.fn()} />);
    expect(screen.getByText("svcLabelQuote")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /svcCtaConsult/ }));
    expect(screen.getByText("QR-MODAL")).toBeInTheDocument();
  });

  // 同一个弹窗被 12 张服务卡共用，默认文案是为「机构/API 版」套餐 CTA 写的；
  // 服务卡必须传自己的商品语境，否则点「投标辅助」也会被告知去拿 API 报价。
  it("预约顾问弹窗文案带本商品名，不回落到机构/API 版默认文案", () => {
    render(
      <ServiceCard
        row={row({ service_code: "svc_bid_doc_analysis", name_zh: "投标辅助，标讯深度拆解报告", standard_price: "500.00", price_from: 1 })}
        onPay={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /svcCtaConsult/ }));
    const hint = screen.getByTestId("qr-hint").textContent ?? "";
    expect(hint).not.toBe("DEFAULT-HINT");
    expect(hint).toContain("contactQrHintService");
    expect(hint).toContain("投标辅助，标讯深度拆解报告");
  });

  // 260928 报价表：这类商品是「按需报价/面议」，即使目录存了参考起价也不能出现自助支付按钮
  it("合同成交（sale_mode=contract）有价行：仍是「预约顾问」，不走 onPay", () => {
    const onPay = vi.fn();
    render(<ServiceCard row={row({ standard_price: "26800.00", price_mode: "project", price_from: 1, sale_mode: "contract" })} onPay={onPay} />);
    expect(screen.queryByRole("button", { name: /svcCtaPay/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /svcCtaConsult/ }));
    expect(onPay).not.toHaveBeenCalled();
  });
});
