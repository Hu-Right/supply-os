import type { Locale } from "@/core/i18n";
import type { UnspscOption } from "./types";

/**
 * UNSPSC 级联选项文案（AuthModal 三级联动与公采页五级联动共用）。
 * 只展示按语言选择的标题：中文优先 title_zh，其余语言回退英文（与 fallbackLng: "en" 策略一致）；
 * 编码不进入文案（编码 - 名称的旧格式在窄下拉里会把名称挤出可视区），
 * 仅在类目完全无标题时降级显示编码，兜底占位符防空白选项。
 */
export const getUnspscOptionLabel = (item: UnspscOption, locale: Locale): string => {
  const title =
    locale === "zh"
      ? item.title_zh || item.title || item.name
      : item.title_en || item.title || item.name || item.title_zh;
  return title || item.code || "Unnamed category";
};
