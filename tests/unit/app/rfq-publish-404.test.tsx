/**
 * @module tests/unit/app/rfq-publish-404.test.tsx
 * @description 发布页加载失败态的分流：目标不存在（404）不给「重试」，
 *              只给「回到我的采购项目」；临时故障才保留重试。
 *              回归背景：通知深链指向已撤回/删除的需求时会撞 404，
 *              旧实现只有一个永远失败的「重试」按钮，用户没有出路。
 */
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { fetchProject, MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number;
    code?: number;
    constructor(status: number, message: string, code?: number) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.code = code;
    }
  }
  return { fetchProject: vi.fn(), MockApiError };
});

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

vi.mock("@/core/http", () => ({ ApiError: MockApiError }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={String(href)} className={className}>{children}</a>
  ),
}));

vi.mock("@/features/procurement-demand/api", () => ({
  fetchProject: (...args: unknown[]) => fetchProject(...args),
  copyProject: vi.fn(),
  withdrawProject: vi.fn(),
}));

vi.mock("@/features/procurement-demand/FlowStepper", () => ({ FlowStepper: () => null }));
vi.mock("@/features/procurement-demand/ProcurementWizard", () => ({ ProcurementWizard: () => null }));

import PublishFlowPageClient from "@/app/(zh)/(public)/rfq/[id]/publish/page-client";

describe("发布页加载失败态", () => {
  // useEffect 在 StrictMode 下会执行两次，故用常驻 rejection 而不是 *Once：
  // 第二次调用拿到 undefined 会把错误态冲成「加载失败」，测试就不可靠了。
  beforeEach(() => {
    fetchProject.mockReset();
  });

  it("404 目标不存在 → 给「已不存在」说明与列表入口，不给重试", async () => {
    fetchProject.mockRejectedValue(new MockApiError(404, "项目不存在", 44001));
    render(<PublishFlowPageClient projectId={1} />);

    expect(await screen.findByText("pc_gone_title")).toBeInTheDocument();
    expect(screen.getByText("pc_gone_desc")).toBeInTheDocument();
    // 主按钮退回列表
    const back = screen.getByText("pc_wb_title");
    expect(back).toBeInTheDocument();
    expect(back.getAttribute("href")).toBe("/settings/rfq");
    // 重试对 404 无意义
    expect(screen.queryByText("pc_retry")).toBeNull();
    // 服务端的 44001 文案不再单独铺开（改由 pc_gone_title 统一说明）
    expect(screen.queryByText("项目不存在")).toBeNull();
  });

  it("临时故障（500）→ 保留服务端文案与重试按钮", async () => {
    fetchProject.mockRejectedValue(new MockApiError(500, "网络异常"));
    render(<PublishFlowPageClient projectId={51} />);

    expect(await screen.findByText("网络异常")).toBeInTheDocument();
    expect(screen.getByText("pc_retry")).toBeInTheDocument();
    expect(screen.queryByText("pc_gone_title")).toBeNull();
  });
});
