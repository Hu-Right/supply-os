/**
 * shared/ui/Card 组件测试
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Card } from "@/shared/ui/Card";

describe("Card", () => {
  it("渲染 children", () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  it("无 onClick 时无 role=button", () => {
    const { container } = render(<Card>Static</Card>);
    expect(container.firstChild).not.toHaveAttribute("role");
  });

  it("有 onClick 时 role=button + tabIndex=0", () => {
    render(<Card onClick={() => {}}>Clickable</Card>);
    const card = screen.getByRole("button");
    expect(card).toHaveAttribute("tabindex", "0");
  });

  it("点击触发 onClick", async () => {
    const user = userEvent.setup();
    let clicked = false;
    render(<Card onClick={() => { clicked = true; }}>Go</Card>);
    await user.click(screen.getByRole("button"));
    expect(clicked).toBe(true);
  });

  it("Enter 键触发 onClick", async () => {
    const user = userEvent.setup();
    let clicked = false;
    render(<Card onClick={() => { clicked = true; }}>Go</Card>);
    screen.getByRole("button").focus();
    await user.keyboard("{Enter}");
    expect(clicked).toBe(true);
  });

  it("Space 键触发 onClick", async () => {
    const user = userEvent.setup();
    let clicked = false;
    render(<Card onClick={() => { clicked = true; }}>Go</Card>);
    screen.getByRole("button").focus();
    await user.keyboard(" ");
    expect(clicked).toBe(true);
  });

  it("自定义 className", () => {
    const { container } = render(<Card className="extra">X</Card>);
    expect(container.firstChild).toHaveClass("extra");
  });
});
