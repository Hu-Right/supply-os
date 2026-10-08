/**
 * ClaimExpiryBanner 单元测试
 *
 * @module tests/unit/features/auth/components/ClaimExpiryBanner
 * @description 认领待完善倒计时横幅（账户设置页与企业信息页共用）：
 *              1. 无剩余时长且未到期 → 不渲染任何东西；
 *              2. 剩余时长按 locale 模板组装，{time} 占位被替换；
 *              3. withCta 才出现跳转按钮，点击回调原样透传；
 *              4. 到期态优先于剩余时长，显示过期文案；
 *              5. i18n 键缺失时回落到组件内中文兜底（服务端 bundle 缺键的老问题）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CountdownResult } from "@/shared/utils/countdown";

// t() 用可变的中文词典：既能验证占位替换，也能删键验证兜底分支
const { dict } = vi.hoisted(() => ({
  dict: {
    authClaimBannerTitle: "企业认领待完善",
    authClaimBannerDesc: "请在 {time} 内前往企业信息页上传营业执照并保存，逾期将自动解除绑定",
    authClaimBannerCta: "前往完善",
    authClaimExpiredBanner: "认领已过期，绑定已自动解除。如需绑定请重新认领。",
    authClaimCountdown: "{d}天 {h}小时 {m}分钟",
  } as Record<string, string>,
}));

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ locale: "zh", t: (key: string) => dict[key] ?? "" }),
}));

import { ClaimExpiryBanner } from "@/features/auth/components/ClaimExpiryBanner";

const FULL: Record<string, string> = { ...dict };
const remaining = (days: number, hours: number, minutes: number): CountdownResult => ({
  days,
  hours,
  minutes,
  time: "00:00:00",
});

beforeEach(() => {
  Object.keys(dict).forEach((k) => delete dict[k]);
  Object.assign(dict, FULL);
});

describe("ClaimExpiryBanner", () => {
  it("无剩余时长且未到期 → 不渲染", () => {
    const { container } = render(<ClaimExpiryBanner remaining={null} expired={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("剩余时长按模板组装并替换 {time}", () => {
    render(<ClaimExpiryBanner remaining={remaining(6, 12, 30)} expired={false} />);
    expect(screen.getByText("企业认领待完善")).toBeInTheDocument();
    expect(
      screen.getByText("请在 6天 12小时 30分钟 内前往企业信息页上传营业执照并保存，逾期将自动解除绑定"),
    ).toBeInTheDocument();
    // 本页已在设置页的场景不需要跳转按钮
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("withCta 时渲染跳转按钮并把点击透传给调用方", () => {
    const onCta = vi.fn();
    render(<ClaimExpiryBanner remaining={remaining(0, 0, 59)} expired={false} withCta onCta={onCta} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("前往完善")).toBeInTheDocument();
    expect(onCta).toHaveBeenCalledTimes(1);
  });

  it("已到期优先于剩余时长：只出现过期的红色横幅", () => {
    render(<ClaimExpiryBanner remaining={remaining(1, 0, 0)} expired withCta onCta={vi.fn()} />);
    expect(
      screen.getByText("认领已过期，绑定已自动解除。如需绑定请重新认领。"),
    ).toBeInTheDocument();
    expect(screen.queryByText("企业认领待完善")).not.toBeInTheDocument();
  });

  it("i18n 键缺失时回落到组件内中文兜底文案", () => {
    delete dict.authClaimBannerTitle;
    delete dict.authClaimCountdown;
    delete dict.authClaimBannerDesc;
    render(<ClaimExpiryBanner remaining={remaining(2, 3, 4)} expired={false} />);
    expect(screen.getByText("企业认领待完善")).toBeInTheDocument();
    expect(
      screen.getByText("请在 2天 3小时 4分钟 内前往企业信息页上传营业执照并保存，逾期将自动解除绑定"),
    ).toBeInTheDocument();
  });
});
