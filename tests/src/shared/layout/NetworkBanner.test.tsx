/**
 * shared/layout/NetworkBanner 组件测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NetworkBanner, useNetworkStatus } from "@/shared/layout/NetworkBanner";

describe("NetworkBanner", () => {
  const origOnLine = navigator.onLine;

  afterEach(() => {
    Object.defineProperty(navigator, "onLine", { value: origOnLine, configurable: true });
  });

  it("在线时不渲染", () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    render(<NetworkBanner />);
    expect(screen.queryByText("networkOffline")).not.toBeInTheDocument();
  });

  it("离线时渲染横幅", () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    render(<NetworkBanner />);
    expect(screen.getByText("networkOffline")).toBeInTheDocument();
  });

  it("online 事件 → 隐藏横幅", () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    render(<NetworkBanner />);
    expect(screen.getByText("networkOffline")).toBeInTheDocument();

    fireEvent(window, new Event("online"));
    expect(screen.queryByText("networkOffline")).not.toBeInTheDocument();
  });

  it("offline 事件 → 显示横幅", () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    render(<NetworkBanner />);
    expect(screen.queryByText("networkOffline")).not.toBeInTheDocument();

    fireEvent(window, new Event("offline"));
    expect(screen.getByText("networkOffline")).toBeInTheDocument();
  });
});

describe("useNetworkStatus", () => {
  function TestComp() {
    const isOnline = useNetworkStatus();
    return <div>{isOnline ? "online" : "offline"}</div>;
  }

  it("返回当前网络状态", () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    render(<TestComp />);
    expect(screen.getByText("online")).toBeInTheDocument();
  });
});
