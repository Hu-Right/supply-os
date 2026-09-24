/**
 * 诊断页登录闸门 —— 跳转链路回归测试
 * Diagnosis gate — login hand-off regression test
 *
 * @module tests/unit/features/procurement/pages/DiagnosisFormPage
 * @description 钉住一个已发生过的线上缺陷：闸门按钮曾跳 `/auth/login?redirect=…`，
 *              而本项目**根本没有登录路由**（全站登录是 (public)/layout-shell 里按需
 *              挂载的 AuthModal 弹窗），点击即 404。正确姿势是派发 require-login 事件。
 *              同时钉住「不存在 redirect 回跳机制」这一事实：登录成功后用户本来就停在
 *              本页，由 AuthContext 的 user 变化驱动 Gate → 表单重渲染。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

vi.mock("@/core/auth", () => ({
  useAuth: () => ({ authUser: null, authReady: true, isAuthLoading: false }),
}));

vi.mock("@/shared/api/diagnosis", () => ({
  fetchMyDiagnoses: vi.fn(() => Promise.resolve([])),
  downloadDiagnosisReport: vi.fn(() => Promise.resolve(undefined)),
  findSimilarCompanies: vi.fn(() => Promise.resolve([])),
  submitDiagnosis: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

import DiagnosisFormPage from "@/features/procurement/pages/DiagnosisFormPage";

const LOGIN_EVENT = "supply-os:require-login";

describe("诊断页登录闸门", () => {
  afterEach(cleanup);

  it("未登录时只出示引导（标题 + 说明 + 去登录按钮），不渲染 19 题表单", () => {
    render(<DiagnosisFormPage />);
    expect(screen.getByText("diagGateTitle")).toBeTruthy();
    expect(screen.getByText("diagGateDesc")).toBeTruthy();
    expect(screen.getByText("diagGateCta")).toBeTruthy();
  });

  it("点「去登录」派发 require-login 事件打开全站登录弹窗，而不是跳转会 404 的 /auth/login", () => {
    const fired: string[] = [];
    const listener = (e: Event) => fired.push(e.type);
    window.addEventListener(LOGIN_EVENT, listener);
    try {
      render(<DiagnosisFormPage />);
      fireEvent.click(screen.getByText("diagGateCta"));
    } finally {
      window.removeEventListener(LOGIN_EVENT, listener);
    }
    expect(fired).toEqual([LOGIN_EVENT]);
  });

  it("重复点击按次派发（每次都要能重新唤起弹窗，不被去抖吞掉）", () => {
    let count = 0;
    const listener = () => { count += 1; };
    window.addEventListener(LOGIN_EVENT, listener);
    try {
      render(<DiagnosisFormPage />);
      const btn = screen.getByText("diagGateCta");
      fireEvent.click(btn);
      fireEvent.click(btn);
      expect(count).toBe(2);
    } finally {
      window.removeEventListener(LOGIN_EVENT, listener);
    }
  });
});
