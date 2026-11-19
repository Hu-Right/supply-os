import { describe, expect, it } from "vitest";
import {
  buildShareSummary,
  SHARE_SUMMARY_MAX_EN,
  SHARE_SUMMARY_MAX_ZH,
} from "@/lib/services/notice-public/share-summary";

const ZH_LISTY = `采购描述（详细版）：招标文件附件I列出了17项眼科医疗设备，主要包括：

SLM-6D 数字裂隙灯显微镜，含仪器桌和显示器——1台
SW-500 手持式回弹眼压计——1台
20D 视网膜镜/间接检眼镜镜片——1个`;

const ZH_PLAIN = `本项目为城市道路升级改造工程，计划对 12 公里主干道进行路面翻新。施工内容包括沥青铺设、排水系统改造和交通标志更新。项目工期 12 个月。`;

const EN_HEADERS = `Tender Notice (TN) INVITATION FOR BIDS (IFB) TITLE OF TENDER: Framework agreement for Supply of Medical Equipments of Eye department at Gahini Hospital Gahini Hospital hereby invites the companies eligible, qualified and specialized in that field to submit their offers for Supply of Medical Equipments of Eye department as indicated in detail in the statement of Requirements. The contract will be a framework agreement for one year.`;

describe("buildShareSummary", () => {
  it("中文清单型正文：剥前缀、取引导句 + 前两项，去掉数量尾巴", () => {
    const { zh } = buildShareSummary({ descriptionCn: ZH_LISTY });
    expect(zh).not.toBeNull();
    expect(zh!.startsWith("招标文件附件I列出了17项眼科医疗设备，主要包括：")).toBe(true);
    expect(zh).toContain("SLM-6D 数字裂隙灯显微镜");
    expect(zh).toContain("SW-500 手持式回弹眼压计");
    expect(zh).toContain("等");
    expect(zh).not.toContain("——1台");
    expect(zh!.length).toBeLessThanOrEqual(SHARE_SUMMARY_MAX_ZH);
  });

  it("中文纯文本：合并两句、按中文习惯不加空格", () => {
    const { zh } = buildShareSummary({ descriptionCn: ZH_PLAIN });
    expect(zh).toBe(
      "本项目为城市道路升级改造工程，计划对 12 公里主干道进行路面翻新。施工内容包括沥青铺设、排水系统改造和交通标志更新。",
    );
  });

  it("英文：跳过超长堆叠句，取能完整放下的下一句", () => {
    const { en } = buildShareSummary({ description: EN_HEADERS });
    expect(en).toBe("The contract will be a framework agreement for one year.");
    expect(en!.length).toBeLessThanOrEqual(SHARE_SUMMARY_MAX_EN);
  });

  it("无正文 / 纯噪声 → null（由调用方回退标题）", () => {
    expect(buildShareSummary({})).toEqual({ zh: null, en: null });
    expect(buildShareSummary({ description: "https://example.com/tender", descriptionCn: "   " })).toEqual({
      zh: null,
      en: null,
    });
  });

  it("超长且无完整短句：截断到标点并补省略号", () => {
    const long = "本项目采购一批医疗设备，".repeat(20);
    const { zh } = buildShareSummary({ descriptionCn: long });
    expect(zh).not.toBeNull();
    expect(zh!.endsWith("…")).toBe(true);
    expect(zh!.length).toBeLessThanOrEqual(SHARE_SUMMARY_MAX_ZH);
  });
});
