/**
 * features/supplier/components/SupplierCardSkeleton 组件测试
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SupplierCardSkeleton } from "@/features/supplier/components/SupplierCardSkeleton";

describe("SupplierCardSkeleton", () => {
  it("渲染骨架屏占位", () => {
    const { getByTestId } = render(<SupplierCardSkeleton />);
    expect(getByTestId("supplier-skeleton")).toBeInTheDocument();
  });

  it("包含 animate-pulse 动画类", () => {
    const { getByTestId } = render(<SupplierCardSkeleton />);
    expect(getByTestId("supplier-skeleton").className).toContain("animate-pulse");
  });

  it("displayName 为 SupplierCardSkeleton", () => {
    expect(SupplierCardSkeleton.displayName).toBe("SupplierCardSkeleton");
  });
});
