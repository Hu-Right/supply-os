import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/core/http", () => ({ api: apiMock }));

import { FeasibilityReportPanel } from "@/features/procurement/components/NoticeDetail/FeasibilityReportPanel";
import type { FeasibilityReport } from "@/lib/services/feasibility-report/types";

function fixtureReport(): FeasibilityReport {
  return {
    meta: {
      noticePk: 7,
      enterpriseId: 1001,
      promptVersion: "feas-rules-v0.1",
      model: null,
      generatedAt: "2026-10-29T00:00:00.000Z",
      dataCompleteness: { requirementItems: 3, capabilities: 2, unknowns: 1 },
      review: { status: "ai_draft" },
    },
    verdict: {
      decision: "no_go",
      score: 0.42,
      reasons: [{ text: "强制项不满足：ISO 14001 认证（缺失）", refs: ["req-1"], confidence: "high", kind: "rule" }],
    },
    gaps: [
      { requirementId: "req-1", status: "missing", title: "ISO 14001 认证", suggest: "需补齐证书", refs: ["req-1"], ruleId: "CERT-01" },
    ],
    matrix: [
      { requirementId: "req-1", title: "ISO 14001 认证", requirement: "ISO14001", capability: "—", status: "missing", refs: ["req-1"], judgedBy: "rule" },
    ],
    unknowns: [{ requirementId: "req-2", title: "本地代理", reason: "企业档案缺本地化信息", need: "补充证据", ruleId: "LOC-00" }],
    deterministic: { rulesRun: 3, rulesPassed: 1, rulesFailed: 1, rulesUnknown: 1, rulesNotApplicable: 0 },
    aiAdvice: [],
    disclaimer: "AI 初稿，请人工复核。",
  };
}

describe("FeasibilityReportPanel（投标可行性报告）", () => {
  it("无报告但企业已认证：显示生成按钮，点击后渲染报告（结论/缺口/矩阵/待确认）", async () => {
    apiMock.mockReset();
    apiMock
      .mockResolvedValueOnce({ report: null, enterprise: { id: 1001, name: "宁波照明" } })
      .mockResolvedValueOnce({ report: fixtureReport(), cached: false, enterprise: { id: 1001, name: "宁波照明" } });

    render(<FeasibilityReportPanel noticePk={7} enabled />);
    const generate = await screen.findByTestId("feasibility-generate");
    fireEvent.click(generate);
    expect(await screen.findByTestId("feasibility-decision")).toHaveTextContent("feasibilityDecisionNoGo");
    expect(screen.getByText("ISO 14001 认证")).toBeInTheDocument();
    expect(screen.getByTestId("feasibility-matrix")).toBeInTheDocument();
    expect(screen.getByText(/本地代理/)).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(2);
    expect(apiMock.mock.calls[1][1]).toMatchObject({ method: "POST" });
  });

  it("未认证企业：提示去企业认证，不显示生成按钮", async () => {
    apiMock.mockReset();
    apiMock.mockResolvedValueOnce({ report: null, enterprise: null });
    render(<FeasibilityReportPanel noticePk={7} enabled />);
    expect(await screen.findByText("feasibilityNeedEnterprise")).toBeInTheDocument();
    expect(screen.queryByTestId("feasibility-generate")).toBeNull();
  });

  it("加载失败：显示错误与重试", async () => {
    apiMock.mockReset();
    apiMock.mockRejectedValueOnce(new Error("boom"));
    render(<FeasibilityReportPanel noticePk={7} enabled />);
    expect(await screen.findByText("feasibilityLoadFailed")).toBeInTheDocument();
    expect(screen.getByText("feasibilityRetry")).toBeInTheDocument();
  });

  it("未启用（无权益/未解锁）不渲染", () => {
    apiMock.mockReset();
    const { container } = render(<FeasibilityReportPanel noticePk={7} enabled={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(apiMock).not.toHaveBeenCalled();
  });
});
