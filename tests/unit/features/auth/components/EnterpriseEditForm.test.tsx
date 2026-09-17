import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

import { EnterpriseEditForm } from "@/features/auth/components/EnterpriseEditForm";

describe("EnterpriseEditForm", () => {
  it("渲染分组编辑表格与保存/取消按钮", () => {
    render(<EnterpriseEditForm initial={null} saving={false} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("settingsBasicInfo")).toBeInTheDocument();
    expect(screen.getByText("authEnterpriseGroupContact")).toBeInTheDocument();
    expect(screen.getByText("authEnterpriseGroupBusiness")).toBeInTheDocument();
    expect(screen.getByText("authEnterpriseSave")).toBeInTheDocument();
    expect(screen.getByText("authEnterpriseCancel")).toBeInTheDocument();
  });

  it("已绑定初始值回填到输入框", () => {
    render(
      <EnterpriseEditForm
        initial={{ company: "宝通集团", contact: "卢慧慧" } as never}
        saving={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    const values = inputs.map((i) => i.value);
    expect(values).toContain("宝通集团");
    expect(values).toContain("卢慧慧");
  });

  it("点击保存回调 onSubmit", () => {
    const onSubmit = vi.fn();
    render(<EnterpriseEditForm initial={null} saving={false} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText("authEnterpriseSave"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0] as Record<string, string>;
    expect(payload).toHaveProperty("company");
    expect(payload).toHaveProperty("intro");
  });

  it("点击取消回调 onCancel", () => {
    const onCancel = vi.fn();
    render(<EnterpriseEditForm initial={null} saving={false} onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("authEnterpriseCancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
