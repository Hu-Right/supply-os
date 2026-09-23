import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));
// next/image 在 jsdom 下直接渲染为 img，便于断言 alt
vi.mock("next/image", () => ({
  default: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} />,
}));

import { ContactQrModal } from "@/features/membership/components/ContactQrModal";

describe("ContactQrModal", () => {
  it("open=false 不渲染", () => {
    const { container } = render(<ContactQrModal open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("open=true 渲染客服码图与提示", () => {
    render(<ContactQrModal open onClose={() => {}} />);
    expect(screen.getByAltText("svcQrAlt")).toBeInTheDocument();
    expect(screen.getByText("contactQrHint")).toBeInTheDocument();
  });
});
