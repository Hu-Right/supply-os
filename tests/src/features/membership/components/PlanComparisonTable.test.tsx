/**
 * PlanComparisonTable 组件测试
 * P1 — 套餐权益对比表：等级映射 + 动态表格渲染
 *
 * 三维评估：逻辑 ✅ | 业务 ✅ | 频改 ✅ → 必须测试
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanComparisonTable } from "@/features/membership/components/PlanComparisonTable";

const mockPlans = [
  { plan_code: "single_89", name: "Single", price: 89, currency: "CNY", duration_days: 30, notice_quota: 5, unlock_quota: 5, is_active: true } as any,
  { plan_code: "annual_8800", name: "Annual Basic", price: 8800, currency: "CNY", duration_days: 365, notice_quota: 500, unlock_quota: 500, is_active: true } as any,
];

describe("PlanComparisonTable", () => {
  it("渲染套餐名称", () => {
    render(<PlanComparisonTable plans={mockPlans} />);
    expect(screen.getByText("Single")).toBeTruthy();
    expect(screen.getByText("Annual Basic")).toBeTruthy();
  });

  it("空套餐列表 → 表格无数据列", () => {
    render(<PlanComparisonTable plans={[]} />);
    // 表格仍渲染框架（权益行），但没有套餐数据列
    const ths = screen.getAllByRole("columnheader");
    // 只有 1 个 th（特性名列），无套餐列
    expect(ths).toHaveLength(1);
  });

  it("单套餐 → 只渲染一列", () => {
    render(<PlanComparisonTable plans={[mockPlans[0]]} />);
    expect(screen.getByText("Single")).toBeTruthy();
    expect(screen.queryByText("Annual Basic")).toBeNull();
  });
});
