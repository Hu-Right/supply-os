/**
 * 采购详情簇拆分 — 纯工厂函数回归测试
 * @module tests/unit/features/procurement/components/split-factories.test
 * @description 覆盖组件化拆出的两个数据工厂：
 *              buildSummaryItems（6 维度映射）、buildShareChannels（渠道清单与意图 URL）。
 *              这两处是「JSX 逐字迁移」拆分中唯一带逻辑的部分，行为回归在此钉住。
 */
import { describe, it, expect, vi } from "vitest";
import { buildSummaryItems } from "@/features/procurement/components/ai-summary/SummaryGrid";
import { buildShareChannels } from "@/features/procurement/components/NoticeDetail/share/channels";

const t = (k: string) => k;

describe("buildSummaryItems", () => {
  it("恒为 6 个维度、顺序与文案 key 固定", () => {
    const items = buildSummaryItems(null);
    expect(items.map((i) => i.titleKey)).toEqual([
      "detail_coreDeliverables",
      "detail_keyQualifications",
      "detail_paymentCycle",
      "detail_competitiveLandscape",
      "detail_bidStrategy",
      "detail_riskAlerts",
    ]);
    items.forEach((i) => expect(i.content).toBeUndefined());
  });

  it("字段按名映射到 content，未提供维度保持空", () => {
    const items = buildSummaryItems({ coreDeliverables: "A", bidStrategy: "B" });
    expect(items[0].content).toBe("A");
    expect(items[4].content).toBe("B");
    expect(items[1].content).toBeUndefined();
  });
});

describe("buildShareChannels", () => {
  it("渠道清单 9 项、key 顺序稳定（e2e/用户肌肉记忆依赖）", () => {
    const channels = buildShareChannels({ translate: t, shareText: "s", shareUrl: "u", onCopyWechat: () => {} });
    expect(channels.map((c) => c.key)).toEqual([
      "wechat", "whatsapp", "facebook", "twitter", "linkedin", "telegram", "email", "gmail", "outlook",
    ]);
  });

  it("微信渠道走复制回调，不打开分享窗口", () => {
    const onCopy = vi.fn();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const channels = buildShareChannels({ translate: t, shareText: "s", shareUrl: "https://x/notice/1", onCopyWechat: onCopy });
    channels[0].onClick();
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it("标准网页分享意图 URL 逐渠道钉住（encodeURIComponent 语义）", () => {
    const channels = buildShareChannels({ translate: t, shareText: "标题 空格", shareUrl: "https://a/b?c=1", onCopyWechat: () => {} });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const byKey = Object.fromEntries(channels.map((c) => [c.key, c]));
    byKey.whatsapp.onClick();
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining("https://api.whatsapp.com/send?text=%E6%A0%87%E9%A2%98%20%E7%A9%BA%E6%A0%BC%20https"),
      "_blank", "noopener,noreferrer,width=680,height=560",
    );
    openSpy.mockClear();
    byKey.twitter.onClick();
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining("twitter.com/intent/tweet?text="), "_blank", expect.any(String));
    openSpy.mockRestore();
  });
});
