/**
 * 资格条件 Tab 门控测试
 *
 * @description 回归：qualification_access 是独立权益，free 档打开后即使 announcement
 *              正文仍 coreLocked，也应直接展示资格条件，而不是走会员锁定面板。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QualificationTab } from "@/features/procurement/components/NoticeDetail/QualificationTab";
import type { NoticeDetailItem } from "@/types";

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ locale: "zh", t: (key: string) => key }),
}));

const notice = {
  noticePk: 1,
  registrationLevel: "basic",
  supplierConditions: "供应商投标条件内容",
  eligibility: "资格要求内容",
  technicalHurdles: "技术门槛内容",
} as NoticeDetailItem;

describe("QualificationTab — 资格条件独立权益", () => {
  it("qualification_access 放行时，coreLocked 也应展示资格内容", () => {
    render(<QualificationTab notice={notice} coreAccessible={false} qualificationAccessible />);
    expect(screen.getByText("供应商投标条件内容")).toBeInTheDocument();
    expect(screen.getByText("资格要求内容")).toBeInTheDocument();
    expect(screen.getByText("技术门槛内容")).toBeInTheDocument();
    expect(screen.queryByText("detail_qualLockedIntro")).not.toBeInTheDocument();
  });

  it("资格权益未放行时仍展示锁定面板", () => {
    render(<QualificationTab notice={notice} coreAccessible={false} qualificationAccessible={false} />);
    expect(screen.getByText("detail_qualLockedIntro")).toBeInTheDocument();
    expect(screen.queryByText("资格要求内容")).not.toBeInTheDocument();
  });

  it("coreAccessible=true 时沿用原有完整展示", () => {
    render(<QualificationTab notice={notice} coreAccessible />);
    expect(screen.getByText("资格要求内容")).toBeInTheDocument();
  });
});
