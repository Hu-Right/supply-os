/**
 * shared/ui/Select 组件测试
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Select } from "@/shared/ui/Select";

describe("Select", () => {
  it("渲染 select + options", () => {
    render(
      <Select aria-label="color">
        <option value="red">Red</option>
        <option value="blue">Blue</option>
      </Select>,
    );
    expect(screen.getByRole("combobox", { name: /color/i })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("error 状态添加错误样式", () => {
    render(<Select error aria-label="err"><option>A</option></Select>);
    expect(screen.getByRole("combobox")).toHaveClass("border-rose-500");
  });

  it("用户选择 option", async () => {
    const user = userEvent.setup();
    render(
      <Select aria-label="fruit">
        <option value="apple">Apple</option>
        <option value="banana">Banana</option>
      </Select>,
    );
    await user.selectOptions(screen.getByRole("combobox"), "banana");
    expect(screen.getByRole("combobox")).toHaveValue("banana");
  });

  it("disabled 属性", () => {
    render(<Select disabled aria-label="dis"><option>A</option></Select>);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("自定义 className", () => {
    render(<Select className="custom" aria-label="f"><option>A</option></Select>);
    expect(screen.getByRole("combobox")).toHaveClass("custom");
  });
});
