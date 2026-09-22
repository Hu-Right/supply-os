import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "@/shared/ui/StatusBadge";

describe("StatusBadge", () => {
  it("variant=new 渲染 NEW 标签", () => {
    render(<StatusBadge variant="new" />);
    expect(screen.getByText("NEW")).toBeInTheDocument();
  });

  it("variant=closing-soon 渲染即将截止", () => {
    render(<StatusBadge variant="closing-soon" />);
    expect(screen.getByText("即将截止")).toBeInTheDocument();
  });

  it("variant=closing-soon + deadlineSec 显示剩余天数", () => {
    const nowSec = Date.now() / 1000;
    const threeDaysLater = nowSec + 3 * 24 * 3600;
    render(<StatusBadge variant="closing-soon" deadlineSec={threeDaysLater} />);
    expect(screen.getByText("剩 3 天")).toBeInTheDocument();
  });

  it("variant=updated 渲染已更新", () => {
    render(<StatusBadge variant="updated" />);
    expect(screen.getByText("已更新")).toBeInTheDocument();
  });

  it("variant=has-attachment 渲染含附件", () => {
    render(<StatusBadge variant="has-attachment" />);
    expect(screen.getByText("含附件")).toBeInTheDocument();
  });

  it("variant=member-unlock 渲染会员解锁", () => {
    render(<StatusBadge variant="member-unlock" />);
    expect(screen.getByText("会员解锁")).toBeInTheDocument();
  });

  it("所有变体包含 title 属性", () => {
    const { rerender } = render(<StatusBadge variant="new" />);
    expect(screen.getByTitle("NEW")).toBeInTheDocument();

    rerender(<StatusBadge variant="closing-soon" />);
    expect(screen.getByTitle("即将截止")).toBeInTheDocument();
  });
});
