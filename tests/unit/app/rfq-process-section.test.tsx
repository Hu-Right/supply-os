/**
 * /rfq 服务端流程说明区版式契约
 *
 * @description 锁住两件事（Trendee 审计 P0「商业核心页对 AI 不可见」的回归防线）：
 *              1) 七步流程进服务端 HTML，口径与 FlowStepper（pc_flow_s1~s7）逐字一致；
 *              2) HowTo 结构化数据存在且只描述这七步（ADR-0023：不引入页面外事实）。
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// 交互面（buyer 探测/向导/广场）不在本测试范围，桩掉避免拉起浏览器 API
vi.mock("@/app/(zh)/(public)/rfq/page-client", () => ({ default: () => null }));

import { RfqProcessSection } from "@/app/(zh)/(public)/rfq/page";

const STEP_NAMES = ["主体认证", "填写需求", "确认版本", "生成授权书", "盖章签署", "云境核验", "发布匹配"];

describe("/rfq 服务端流程说明区", () => {
  it("七步全部进 HTML，顺序与 FlowStepper 口径一致", () => {
    render(<RfqProcessSection />);
    expect(screen.getByRole("heading", { name: "采购需求发布（RFQ）七步流程" })).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(7);
    STEP_NAMES.forEach((name, i) => {
      expect(items[i].textContent).toContain(name);
    });
  });

  it("HowTo 结构化数据存在且恰好描述这七步", () => {
    render(<RfqProcessSection />);
    const script = document.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const howTo = JSON.parse(script?.textContent || "null") as {
      "@type": string;
      step: Array<{ "@type": string; position: number; name: string }>;
    };
    expect(howTo["@type"]).toBe("HowTo");
    expect(howTo.step).toHaveLength(7);
    howTo.step.forEach((s, i) => {
      expect(s["@type"]).toBe("HowToStep");
      expect(s.position).toBe(i + 1);
      expect(s.name).toBe(STEP_NAMES[i]);
    });
  });
});
