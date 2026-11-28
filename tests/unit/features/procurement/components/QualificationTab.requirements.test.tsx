/**
 * 资格条件 Tab —— 结构化要求清单
 *
 * @description 回归：notice.requirements（来自 notice_requirement_items）存在时，按
 *              mandatory/scored/preferred 分组渲染为可判读条目；两套口径都为空时给"未抽取"空态，
 *              而不是渲染三个空文本框。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QualificationTab } from "@/features/procurement/components/NoticeDetail/QualificationTab";
import type { NoticeDetailItem } from "@/types";

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ locale: "zh", t: (key: string) => key }),
}));

const base = { noticePk: 1, registrationLevel: "basic" } as NoticeDetailItem;

describe("QualificationTab — 结构化要求清单", () => {
  it("按强制/评分/加分分组渲染，并标出低置信度为待核验", () => {
    const notice = {
      ...base,
      requirements: [
        { seq: 1, type: "certification", importance: "mandatory", title: "具备 SASO 认证", rawText: "原文片段A", confidence: 0.9 },
        { seq: 2, type: "experience", importance: "scored", title: "近三年同类业绩", confidence: 0.5 },
        { seq: 3, type: "language", importance: "preferred", title: "英文技术文件", confidence: 0.8 },
      ],
    } as NoticeDetailItem;

    render(<QualificationTab notice={notice} coreAccessible />);

    expect(screen.getByText("强制项 · 1")).toBeInTheDocument();
    expect(screen.getByText("评分项 · 1")).toBeInTheDocument();
    expect(screen.getByText("加分项 · 1")).toBeInTheDocument();
    expect(screen.getByText("具备 SASO 认证")).toBeInTheDocument();
    expect(screen.getByText("近三年同类业绩")).toBeInTheDocument();
    // confidence=0.5 < 0.6 → 待核验
    expect(screen.getByText("待核验")).toBeInTheDocument();
    // 原文与标题不同 → 折叠区出现
    expect(screen.getByText("查看原文")).toBeInTheDocument();
  });

  it("两套口径都为空时展示未抽取空态，而不是三个空文本框", () => {
    render(<QualificationTab notice={{ noticePk: 2 } as NoticeDetailItem} coreAccessible />);
    expect(screen.getByText("procurement_noQualificationInfo")).toBeInTheDocument();
    expect(screen.queryByText("detail_qualEmptyConditions")).not.toBeInTheDocument();
  });

  it("仅有原文、无结构化要求时，给未抽取提示并保留原文摘录", () => {
    const notice = {
      ...base,
      eligibility: "资格要求内容",
    } as NoticeDetailItem;

    render(<QualificationTab notice={notice} coreAccessible />);
    expect(screen.getByText("资格要求内容")).toBeInTheDocument();
    // 空的三列不再渲染占位框
    expect(screen.queryByText("detail_qualEmptyConditions")).not.toBeInTheDocument();
    expect(screen.queryByText("detail_qualEmptyHurdles")).not.toBeInTheDocument();
  });
});
