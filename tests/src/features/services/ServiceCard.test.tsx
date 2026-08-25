/**
 * features/services/components/ServiceCard 组件测试
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ServiceCard } from "@/features/services/components/ServiceCard";
import type { ServiceItem } from "@/features/services/types";

// lucide-react 图标已被全局 mock 为 _StubIcon，可直接作为 icon 传入
import { Building2 } from "lucide-react";

function makeService(overrides: Partial<ServiceItem> = {}): ServiceItem {
  return {
    title: "供应商入库",
    desc: "帮助供应商完成国际采购平台注册",
    icon: Building2,
    specs: ["UNGM", "世行"],
    ...overrides,
  };
}

describe("ServiceCard", () => {
  it("渲染标题和描述", () => {
    render(<ServiceCard service={makeService()} onBook={vi.fn()} bookLabel="预约" />);
    expect(screen.getByText("供应商入库")).toBeInTheDocument();
    expect(screen.getByText("帮助供应商完成国际采购平台注册")).toBeInTheDocument();
  });

  it("渲染 specs 标签", () => {
    render(<ServiceCard service={makeService()} onBook={vi.fn()} bookLabel="预约" />);
    expect(screen.getByText("UNGM")).toBeInTheDocument();
    expect(screen.getByText("世行")).toBeInTheDocument();
  });

  it("渲染预约按钮文案", () => {
    render(<ServiceCard service={makeService()} onBook={vi.fn()} bookLabel="立即预约" />);
    expect(screen.getByRole("button", { name: "立即预约" })).toBeInTheDocument();
  });

  it("点击按钮触发 onBook", async () => {
    const user = userEvent.setup();
    const onBook = vi.fn();
    render(<ServiceCard service={makeService()} onBook={onBook} bookLabel="预约" />);
    await user.click(screen.getByRole("button", { name: "预约" }));
    expect(onBook).toHaveBeenCalledTimes(1);
  });

  it("displayName 为 ServiceCard", () => {
    expect(ServiceCard.displayName).toBe("ServiceCard");
  });
});
