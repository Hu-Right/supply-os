/**
 * shared/forms/FormField 组件测试
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormField } from "@/shared/forms/FormField";

describe("FormField", () => {
  it("渲染 label 和 children", () => {
    render(
      <FormField label="用户名">
        <input data-testid="input" />
      </FormField>,
    );
    expect(screen.getByText("用户名")).toBeInTheDocument();
    expect(screen.getByTestId("input")).toBeInTheDocument();
  });

  it("required 时显示红色星号", () => {
    const { container } = render(
      <FormField label="邮箱" required>
        <input />
      </FormField>,
    );
    const star = container.querySelector(".text-rose-500");
    expect(star).toBeTruthy();
    expect(star!.textContent).toBe("*");
  });

  it("非 required 时不显示星号", () => {
    const { container } = render(
      <FormField label="备注">
        <textarea />
      </FormField>,
    );
    expect(container.querySelector(".text-rose-500")).toBeNull();
  });

  it("有 error 时显示错误消息", () => {
    render(
      <FormField label="密码" error="密码太短">
        <input />
      </FormField>,
    );
    expect(screen.getByText("密码太短")).toBeInTheDocument();
  });

  it("无 error 时不渲染错误段落", () => {
    const { container } = render(
      <FormField label="密码">
        <input />
      </FormField>,
    );
    expect(container.querySelector(".text-rose-600")).toBeNull();
  });

  it("自定义 className 合并到容器", () => {
    const { container } = render(
      <FormField label="字段" className="my-custom-class">
        <input />
      </FormField>,
    );
    expect(container.firstElementChild!.className).toContain("my-custom-class");
  });

  it("displayName 为 FormField", () => {
    expect(FormField.displayName).toBe("FormField");
  });
});
