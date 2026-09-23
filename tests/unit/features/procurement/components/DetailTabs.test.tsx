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
      coreUnlocked={false}
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
    fireEvent.click(screen.getByRole("tab", { name: /detail_tabHistory/ }));
    expect(setActiveTab).toHaveBeenCalledWith("history");
  });
});

describe("deriveTabGateState（服务端矩阵 gates → Tab 角标状态）", () => {
  const byKey = (k: string) => DETAIL_TABS.find((tab) => tab.key === k)!;

  it("benefit 类：直接采用 gates 下发的状态", () => {
    const gates: Record<string, GateState> = {
      ai_match: "upgrade",
      history_notice_db: "upgrade",
      similar_opportunity: "free",
    };
    expect(deriveTabGateState(byKey("ai-score"), gates, false)).toBe("upgrade");
    expect(deriveTabGateState(byKey("history"), gates, false)).toBe("upgrade");
    expect(deriveTabGateState(byKey("similar"), gates, false)).toBe("free");
  });

  it("同类权益不再出现互相矛盾的档位标签（ai-score 与 history 同 gate）", () => {
    const gates: Record<string, GateState> = { ai_match: "upgrade", history_notice_db: "upgrade" };
    expect(deriveTabGateState(byKey("ai-score"), gates, false)).toBe(
      deriveTabGateState(byKey("history"), gates, false),
    );
  });

  it("unlock 类：已解锁→included；未解锁且有额度→unlock；无额度→upgrade", () => {
    expect(deriveTabGateState(byKey("files"), { notice_view: "included" }, true)).toBe("included");
    expect(deriveTabGateState(byKey("files"), { notice_view: "included" }, false)).toBe("unlock");
    expect(deriveTabGateState(byKey("files"), { notice_view: "upgrade" }, false)).toBe("upgrade");
  });

  it("缺 gates 数据时保守回退 upgrade", () => {
    expect(deriveTabGateState(byKey("summary"), undefined, false)).toBe("upgrade");
  });
});
