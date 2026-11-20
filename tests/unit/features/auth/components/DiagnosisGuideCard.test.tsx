/**
 * DiagnosisGuideCard 单元测试
 *
 * @module tests/unit/features/auth/components/DiagnosisGuideCard
 * @description 资质诊断引导卡（右下角浮层，绑定主体未诊断时出现）：
 *              1. 绑定主体 + 未诊断 → 显示卡片，CTA 跳诊断页并写会话级关闭标记；
 *              2. 该主体已有诊断 → 不渲染；
 *              3. loading/主体缺失/未登录 → 不渲染（身份不确定期间禁止闪卡）；
 *              4. sessionStorage 已关 → 不渲染（会话级，跨标签页互不影响）；
 *              5. i18n 键缺失时回落到组件内中文兜底。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { dict, mockPush, apiMock, pathRef, entRef, diagRef, userIdRef } = vi.hoisted(() => ({
  dict: {
    diagGuideBadge: "下一步",
    diagGuideTitle: "评估贵司投标能力",
    diagGuideDesc: "贵司已完成企业绑定。做一次资质诊断，评估国际公共采购就绪度，获取等级与能力缺口清单。",
    diagGuideCta: "去做资质诊断",
    diagGuideLater: "稍后再说",
  } as Record<string, string>,
  mockPush: vi.fn(),
  apiMock: vi.fn(() => Promise.resolve({ success: true })),
  pathRef: { pathname: "/" } as { pathname: string },
  // 两个 hook 的返回值用可变引用承载，用例内直接改字段
  entRef: { bound: true, enterprise: { id: 121700, company: "程力汽车集团股份有限公司" }, loading: false, error: null } as Record<string, unknown>,
  diagRef: { hasDiagnosis: false, loading: false, error: null } as Record<string, unknown>,
  userIdRef: { userId: 171 as number | undefined },
}));

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ locale: "zh", t: (key: string) => dict[key] ?? "" }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => pathRef.pathname,
}));

vi.mock("@/core/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/http")>();
  return { ...actual, api: apiMock };
});

vi.mock("@/core/auth/useUserId", () => ({
  useUserId: () => userIdRef.userId,
}));

vi.mock("@/shared/hooks/useEnterpriseInfo", () => ({
  useEnterpriseInfo: () => entRef,
}));

vi.mock("@/shared/hooks/useHasDiagnosis", () => ({
  useHasDiagnosis: () => diagRef,
}));

import { DiagnosisGuideCard } from "@/features/auth/components/DiagnosisGuideCard";

const FULL: Record<string, string> = { ...dict };
const dismissKey = `supply-os:diagnosis-guide-dismissed:${userIdRef.userId}`;

beforeEach(() => {
  Object.keys(dict).forEach((k) => delete dict[k]);
  Object.assign(dict, FULL);
  entRef.bound = true;
  entRef.enterprise = { id: 121700, company: "程力汽车集团股份有限公司" };
  entRef.loading = false;
  entRef.error = null;
  diagRef.hasDiagnosis = false;
  diagRef.loading = false;
  diagRef.error = null;
  userIdRef.userId = 171;
  pathRef.pathname = "/";
  mockPush.mockClear();
  apiMock.mockClear();
  sessionStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
});

describe("DiagnosisGuideCard", () => {
  it("绑定主体且未诊断 → 显示卡片，CTA 跳诊断页并写会话级关闭标记", async () => {
    render(<DiagnosisGuideCard />);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByText("评估贵司投标能力")).toBeInTheDocument();
    expect(screen.getByText("去做资质诊断")).toBeInTheDocument();

    fireEvent.click(screen.getByText("去做资质诊断"));
    expect(mockPush).toHaveBeenCalledWith("/procurement/diagnosis");
    expect(sessionStorage.getItem(dismissKey)).toBe("1");
  });

  it("该主体已有诊断 → 不渲染", () => {
    diagRef.hasDiagnosis = true;
    const { container } = render(<DiagnosisGuideCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("身份不确定（loading / 未绑定 / 主体缺 id / 出错）→ 一律不渲染", () => {
    const baseline = () => {
      entRef.bound = true;
      entRef.enterprise = { id: 121700, company: "程力汽车集团股份有限公司" };
      entRef.loading = false;
      entRef.error = null;
      diagRef.hasDiagnosis = false;
      diagRef.loading = false;
      diagRef.error = null;
      userIdRef.userId = 171;
    };
    const mutations: Array<() => void> = [
      () => { entRef.loading = true; },
      () => { diagRef.loading = true; },
      () => { entRef.bound = false; },
      () => { entRef.enterprise = { company: "无 id" }; },
      () => { entRef.error = "net"; },
      () => { diagRef.error = "net"; },
      () => { userIdRef.userId = undefined; },
    ];
    for (const mutate of mutations) {
      baseline();
      mutate();
      const { container, unmount } = render(<DiagnosisGuideCard />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("sessionStorage 已关闭 → 本会话不再渲染；另一用户/键不受影响", () => {
    sessionStorage.setItem(dismissKey, "1");
    const { container } = render(<DiagnosisGuideCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("i18n 键缺失时回落到组件内中文兜底文案", () => {
    delete dict.diagGuideTitle;
    delete dict.diagGuideCta;
    render(<DiagnosisGuideCard />);
    expect(screen.getByText("评估贵司投标能力")).toBeInTheDocument();
    expect(screen.getByText("去做资质诊断")).toBeInTheDocument();
  });

  it("诊断页本身不弹卡（避免与吸底提交栏重叠）", () => {
    pathRef.pathname = "/procurement/diagnosis";
    const { container } = render(<DiagnosisGuideCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("曝光/点击/关闭分别上报 guide-event", async () => {
    render(<DiagnosisGuideCard />);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/api/supplier-diagnosis/guide-event",
        expect.objectContaining({
          method: "POST",
          body: expect.objectContaining({ event: "impression", supplier_id: 121700 }),
        }),
      ),
    );

    fireEvent.click(screen.getByText("去做资质诊断"));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/api/supplier-diagnosis/guide-event",
        expect.objectContaining({
          method: "POST",
          body: expect.objectContaining({ event: "click", supplier_id: 121700 }),
        }),
      ),
    );
  });

  it("点关闭按钮上报 dismiss 事件", async () => {
    render(<DiagnosisGuideCard />);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("稍后再说"));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/api/supplier-diagnosis/guide-event",
        expect.objectContaining({
          method: "POST",
          body: expect.objectContaining({ event: "dismiss" }),
        }),
      ),
    );
  });
});
