import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormField } from "@/shared/forms/FormField";

describe("FormField", () => {
  it("renders label text", () => {
    render(
      <FormField label="用户名">
        <input data-testid="input" />
      </FormField>
    );
    expect(screen.getByText("用户名")).toBeInTheDocument();
  });

  it("shows red asterisk when required is true", () => {
    const { container } = render(
      <FormField label="邮箱" required>
        <input />
      </FormField>
    );
    const asterisk = container.querySelector(".text-rose-500");
    expect(asterisk).toBeInTheDocument();
    expect(asterisk?.textContent).toBe("*");
  });

  it("does not show asterisk when required is false (default)", () => {
    const { container } = render(
      <FormField label="备注">
        <input />
      </FormField>
    );
    const asterisk = container.querySelector(".text-rose-500");
    expect(asterisk).not.toBeInTheDocument();
  });

  it("renders error message when error prop is provided", () => {
    render(
      <FormField label="密码" error="密码不能为空">
        <input />
      </FormField>
    );
    expect(screen.getByText("密码不能为空")).toBeInTheDocument();
  });

  it("renders children (input element)", () => {
    render(
      <FormField label="电话">
        <input data-testid="phone-input" />
      </FormField>
    );
    expect(screen.getByTestId("phone-input")).toBeInTheDocument();
  });
});
