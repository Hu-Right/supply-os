import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SelectableCard } from "@/shared/ui/SelectableCard";

describe("SelectableCard", () => {
  it("渲染子元素", () => {
    render(<SelectableCard selected={false} onClick={() => {}}>内容</SelectableCard>);
    expect(screen.getByText("内容")).toBeInTheDocument();
  });

  it("role=radio + aria-checked=false（未选中）", () => {
    render(<SelectableCard selected={false} onClick={() => {}}>未选</SelectableCard>);
    const card = screen.getByRole("radio");
    expect(card).toHaveAttribute("aria-checked", "false");
  });

  it("aria-checked=true（已选中）", () => {
    render(<SelectableCard selected onClick={() => {}}>已选</SelectableCard>);
    const card = screen.getByRole("radio");
    expect(card).toHaveAttribute("aria-checked", "true");
  });

  it("点击触发 onClick", () => {
    const onClick = vi.fn();
    render(<SelectableCard selected={false} onClick={onClick}>点击</SelectableCard>);
    fireEvent.click(screen.getByRole("radio"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("disabled=true → 按钮禁用 + aria-disabled", () => {
    render(<SelectableCard selected={false} onClick={() => {}} disabled>禁用</SelectableCard>);
    const card = screen.getByRole("radio");
    expect(card).toBeDisabled();
    expect(card).toHaveAttribute("aria-disabled", "true");
  });

  it("selected=true + variant=teal → border-primary-500", () => {
    render(<SelectableCard selected onClick={() => {}} variant="teal">选中</SelectableCard>);
    expect(screen.getByRole("radio").className).toContain("border-primary-500");
  });

  it("selected=true + variant=brand → border-red-500", () => {
    render(<SelectableCard selected onClick={() => {}} variant="brand">选中</SelectableCard>);
    expect(screen.getByRole("radio").className).toContain("border-red-500");
  });

  it("selected=false → border-secondary-200", () => {
    render(<SelectableCard selected={false} onClick={() => {}}>未选</SelectableCard>);
    expect(screen.getByRole("radio").className).toContain("border-secondary-200");
  });
});
