/**
 * AiEvaluationPanel 组件测试
 * @module tests/unit/features/procurement/components/AiEvaluationPanel.test
 * @description 用 mock 数据确定性验证统一评估面板各状态渲染（LLM 环境不可用时，成功路径的唯一可靠验证）：
 *              引导态 / 结果态（self 高亮置顶、候选排名、对比小结、self 与友商不同编辑入口、完整度提示）/
 *              空态 / 全失败态 / 专业版升级门。t 返回 key 本身，断言以 key 字符串进行。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

// 门控：仅当 error.kind === "vipGate" 时组件自行取 requiredRank 渲染升级卡（不再依赖 parseVipRank）
vi.mock("@/features/procurement/api/notice-gate", () => ({
  rankToTierKey: vi.fn(() => "tierPro"),
}));

import { AiEvaluationPanel } from "@/features/procurement/components/AiEvaluationPanel";
import type { AiMatchData, MatchedSupplier } from "@/features/procurement/api/ai-match";
import type { ErrorClassification } from "@/core/http";

function candidate(partial: Partial<MatchedSupplier> & { supplierId: number; company: string; isSelf: boolean }): MatchedSupplier {
  return {
    qualification: 60, experience: 60, certification: 60, region: 60, scale: 60, delivery: 60, price: 60,
    overall: 60, details: {}, reasoning: "", poolId: null, source: partial.isSelf ? "self" : "pool",
    baseComplete: true, diagComplete: true,
    ...partial,
  } as MatchedSupplier;
}

const noop = () => {};
const baseProps = {
  loading: false, cacheLoading: false, error: null as ErrorClassification | null,
  onStart: noop, onRegenerate: noop, onGoToPool: noop, onGoToEnterprise: noop, onEditDiag: noop,
};

describe("AiEvaluationPanel 状态渲染", () => {
  it("引导态：无数据无错误 → 标题 + 开始评估按钮", () => {
    render(<AiEvaluationPanel data={null} {...baseProps} />);
    expect(screen.getByText("aiEvalTitle")).toBeTruthy();
    expect(screen.getByText("aiEvalStart")).toBeTruthy();
  });

  it("结果态：self 置顶高亮、候选排名、对比小结、self/友商不同编辑入口", () => {
    const data: AiMatchData = {
      cached: false, poolSize: 2, evaluated: 2, failed: 0, diagPending: 0,
      top: [
        candidate({ supplierId: 10, company: "我的公司", isSelf: true, overall: 75 }),
        candidate({ supplierId: 12, company: "工厂B", isSelf: false, overall: 88, poolId: 6, baseComplete: false, diagComplete: false }),
      ],
    };
    render(<AiEvaluationPanel data={data} {...baseProps} />);
    // self 徽标 + 自己行「编辑基本信息」入口
    expect(screen.getByText("aiEvalSelfBadge")).toBeTruthy();
    expect(screen.getByText("aiEvalEditBase")).toBeTruthy();
    // 友商行「编辑诊断表」入口 + 不完整画像提示
    expect(screen.getByText("aiEvalEditDiag")).toBeTruthy();
    expect(screen.getByText("aiEvalBaseReadonly")).toBeTruthy();
    expect(screen.getByText("aiEvalDiagIncomplete")).toBeTruthy();
    // 对比小结出现（self + 最佳候选都在）
    expect(screen.getByText("aiEvalCompare")).toBeTruthy();
    // 候选公司名渲染
    expect(screen.getByText("工厂B")).toBeTruthy();
  });

  it("空态：top 为空且无失败 → 引导完善企业信息 / 建立资源库", () => {
    const data: AiMatchData = { cached: false, poolSize: 0, evaluated: 0, failed: 0, diagPending: 0, top: [] };
    render(<AiEvaluationPanel data={data} {...baseProps} />);
    expect(screen.getByText("aiEvalEmpty")).toBeTruthy();
    expect(screen.getByText("aiEvalGoEnterprise")).toBeTruthy();
    expect(screen.getByText("aiEvalGoPool")).toBeTruthy();
  });

  it("全失败态：top 为空且 failed>0 → 全部评估失败 + 重试", () => {
    const data: AiMatchData = { cached: false, poolSize: 2, evaluated: 2, failed: 2, diagPending: 0, top: [] };
    render(<AiEvaluationPanel data={data} {...baseProps} />);
    expect(screen.getByText(/aiEvalAllFailed/)).toBeTruthy();
  });

  it("升级门：专业版不足 error → 琥珀引导卡（会员/专业版专享）", () => {
    render(<AiEvaluationPanel data={null} {...baseProps} error={{ kind: "vipGate", key: "errVipFeatureOnly", requiredRank: 3, message: "" }} />);
    expect(screen.getByText("aiGateMatchTitle")).toBeTruthy();
    expect(screen.getByText("aiGateViewPlans")).toBeTruthy();
  });
});
