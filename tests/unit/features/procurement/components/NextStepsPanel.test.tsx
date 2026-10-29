import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
}));

import { NextStepsPanel } from "@/features/procurement/components/NextStepsPanel";
import type { GateState } from "@/types";
import type { NoticeItem } from "@/features/procurement/types";

const mockNotice = { noticePk: 1, noticeId: "N1", title: "Test Notice" } as NoticeItem;

const gatesOf = (overrides: Record<string, GateState> = {}): Record<string, GateState> => ({
  evidence_library: "included",
  original_file_access: "included",
  concierge_service: "upgrade",
  order_crm: "included",
  ...overrides,
});

describe("NextStepsPanel（动作区由权益矩阵驱动）", () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it("渲染标题与 4 个动作（文案已对齐模块命名）", () => {
    render(<NextStepsPanel notice={mockNotice} isLoggedIn gates={gatesOf()} />);
    expect(screen.getByText("detail_nextStepsTitle")).toBeInTheDocument();
    expect(screen.getByText("detail_stepUpload")).toBeInTheDocument();
    expect(screen.getByText("detail_stepUnlock")).toBeInTheDocument();
    expect(screen.getByText("detail_stepConsultant")).toBeInTheDocument();
    expect(screen.getByText("detail_stepCrm")).toBeInTheDocument();
  });

  it("角标由 gates 下发：已包含 / 需升级 取代硬编码档位标签", () => {
    render(<NextStepsPanel notice={mockNotice} isLoggedIn gates={gatesOf()} />);
    // evidence_library / original_file_access / order_crm = included；concierge_service = upgrade
    expect(screen.getAllByText("detail_gateIncluded")).toHaveLength(3);
    expect(screen.getByText("detail_gateUpgrade")).toBeInTheDocument();
    // 旧档位标签彻底下线
    expect(screen.queryByText("detail_tierFree")).toBeNull();
    expect(screen.queryByText("detail_tierMember")).toBeNull();
    expect(screen.queryByText("detail_tierPro")).toBeNull();
  });

  it("缺 gates 数据时四个动作保守回退「需升级」", () => {
    render(<NextStepsPanel notice={mockNotice} isLoggedIn gates={undefined} />);
    expect(screen.getAllByText("detail_gateUpgrade")).toHaveLength(4);
  });

  it("「查看原始文件」：套餐已含且已解锁 → 切到原始文件 Tab；未解锁 → 发起解锁", () => {
    const onUnlock = vi.fn();
    const onViewFiles = vi.fn();
    const { rerender } = render(
      <NextStepsPanel
        notice={mockNotice} isLoggedIn
        gates={gatesOf({ original_file_access: "included" })}
        coreUnlocked={false} onUnlock={onUnlock} onViewFiles={onViewFiles}
      />,
    );
    fireEvent.click(screen.getByText("detail_stepUnlock"));
    expect(onUnlock).toHaveBeenCalledTimes(1);
    expect(onViewFiles).not.toHaveBeenCalled();

    rerender(
      <NextStepsPanel
        notice={mockNotice} isLoggedIn
        gates={gatesOf({ original_file_access: "included" })}
        coreUnlocked onUnlock={onUnlock} onViewFiles={onViewFiles}
      />,
    );
    fireEvent.click(screen.getByText("detail_stepUnlock"));
    expect(onViewFiles).toHaveBeenCalledTimes(1);
  });

  it("「查看原始文件」套餐未含 → 引导升级（不调用解锁）", () => {
    const onUnlock = vi.fn();
    render(
      <NextStepsPanel
        notice={mockNotice} isLoggedIn
        gates={gatesOf({ original_file_access: "upgrade" })}
        coreUnlocked={false} onUnlock={onUnlock}
      />,
    );
    fireEvent.click(screen.getByText("detail_stepUnlock"));
    expect(pushMock).toHaveBeenCalledWith("/membership?notice_id=1");
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it("「履约台账」动作触发加入跟进回调，缺失时跳转 /crm", () => {
    const onJoinCrm = vi.fn();
    const { rerender } = render(
      <NextStepsPanel notice={mockNotice} isLoggedIn gates={gatesOf()} onJoinCrm={onJoinCrm} />,
    );
    fireEvent.click(screen.getByText("detail_stepCrm"));
    expect(onJoinCrm).toHaveBeenCalledTimes(1);

    rerender(<NextStepsPanel notice={mockNotice} isLoggedIn gates={gatesOf()} />);
    fireEvent.click(screen.getByText("detail_stepCrm"));
    expect(pushMock).toHaveBeenCalledWith("/crm");
  });

  // 2026-10-29 操作条大一统：感兴趣/订阅/升级会员上移至 DetailHeader 操作条，
  // 本面板不再渲染升级块（对应用例随功能迁移删除）。
});
