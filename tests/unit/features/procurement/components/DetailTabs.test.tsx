import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { DetailTabs } from "@/features/procurement/components/NoticeDetail/DetailTabs";
import type { GateState } from "@/types";
import {
  DETAIL_TABS,
  deriveTabGateState,
  tabTriggerId,
  tabPanelId,
} from "@/features/procurement/components/NoticeDetail/utils";

const t = (key: string) => key;

const renderTabs = (activeTab = "summary", setActiveTab = vi.fn()) => {
  render(
    <DetailTabs
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      t={t}
      gates={undefined}
    />,
  );
  return setActiveTab;
};

describe("DetailTabs（ARIA Tabs / 键盘导航，spec 2026-09-21）", () => {
  it("容器具备 tablist 角色与 aria-label", () => {
    renderTabs();
    const tablist = screen.getByRole("tablist");
    expect(tablist).toHaveAttribute("aria-label", "detail_tabListAria");
  });

  it("每个 Tab 的 role/id/aria-selected/aria-controls 正确", () => {
    renderTabs();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(DETAIL_TABS.length);
    for (const tab of DETAIL_TABS) {
      const el = screen.getByRole("tab", { name: new RegExp(tab.labelKey) });
      expect(el).toHaveAttribute("id", tabTriggerId(tab.key));
      expect(el).toHaveAttribute("aria-controls", tabPanelId(tab.key));
      expect(el).toHaveAttribute("aria-selected", String(tab.key === "summary"));
    }
  });

  it("roving tabindex：仅激活项 tabIndex=0，其余 -1", () => {
    renderTabs("files");
    for (const tab of DETAIL_TABS) {
      const el = screen.getByRole("tab", { name: new RegExp(tab.labelKey) });
      expect(el).toHaveAttribute("tabindex", tab.key === "files" ? "0" : "-1");
    }
  });

  it("ArrowRight 激活下一项", () => {
    const setActiveTab = renderTabs("summary");
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(setActiveTab).toHaveBeenLastCalledWith(DETAIL_TABS[1].key);
  });

  it("ArrowRight 末项循环回第一项", () => {
    const setActiveTab = renderTabs(DETAIL_TABS[DETAIL_TABS.length - 1].key);
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(setActiveTab).toHaveBeenLastCalledWith(DETAIL_TABS[0].key);
  });

  it("ArrowLeft 激活上一项", () => {
    const setActiveTab = renderTabs(DETAIL_TABS[1].key);
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowLeft" });
    expect(setActiveTab).toHaveBeenLastCalledWith(DETAIL_TABS[0].key);
  });

  it("ArrowLeft 第一项循环到末项", () => {
    const setActiveTab = renderTabs("summary");
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowLeft" });
    expect(setActiveTab).toHaveBeenLastCalledWith(DETAIL_TABS[DETAIL_TABS.length - 1].key);
  });

  it("Home/End 跳首/尾", () => {
    const setActiveTab = renderTabs("ai-score");
    const tablist = screen.getByRole("tablist");
    fireEvent.keyDown(tablist, { key: "End" });
    expect(setActiveTab).toHaveBeenLastCalledWith(DETAIL_TABS[DETAIL_TABS.length - 1].key);
    fireEvent.keyDown(tablist, { key: "Home" });
    expect(setActiveTab).toHaveBeenLastCalledWith(DETAIL_TABS[0].key);
  });

  it("无关按键（如 ArrowUp）不触发切换", () => {
    const setActiveTab = renderTabs("summary");
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowUp" });
    expect(setActiveTab).not.toHaveBeenCalled();
  });

  it("点击 Tab 仍可直接激活（现状行为无回归）", () => {
    const setActiveTab = renderTabs("summary");
    fireEvent.click(screen.getByRole("tab", { name: /detail_tabSimilar/ }));
    expect(setActiveTab).toHaveBeenCalledWith("similar");
  });
});

describe("deriveTabGateState（服务端矩阵 gates → Tab 角标状态）", () => {
  const byKey = (k: string) => DETAIL_TABS.find((tab) => tab.key === k)!;

  it("全部 Tab 都由权益矩阵驱动（不再有独立的解锁类）", () => {
    const gates: Record<string, GateState> = {
      ai_summary: "free",
      qualification_access: "included",
      original_file_access: "included",
      ai_match: "upgrade",
      similar_opportunity: "free",
    };
    expect(deriveTabGateState(byKey("summary"), gates)).toBe("free");
    expect(deriveTabGateState(byKey("qualification"), gates)).toBe("included");
    expect(deriveTabGateState(byKey("files"), gates)).toBe("included");
    expect(deriveTabGateState(byKey("ai-score"), gates)).toBe("upgrade");
    expect(deriveTabGateState(byKey("similar"), gates)).toBe("free");
  });

  it("资格条件/原始文件：付费档 included，免费档 upgrade", () => {
    expect(deriveTabGateState(byKey("qualification"), { qualification_access: "included" })).toBe("included");
    expect(deriveTabGateState(byKey("files"), { original_file_access: "included" })).toBe("included");
    expect(deriveTabGateState(byKey("files"), { original_file_access: "upgrade" })).toBe("upgrade");
    expect(deriveTabGateState(byKey("qualification"), { qualification_access: "free" })).toBe("free");
  });

  it("缺 gates 数据时保守回退 upgrade", () => {
    expect(deriveTabGateState(byKey("summary"), undefined)).toBe("upgrade");
    expect(deriveTabGateState(byKey("files"), undefined)).toBe("upgrade");
  });
});
