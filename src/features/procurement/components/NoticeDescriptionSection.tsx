/**
 * 公告详情描述区
 * Notice Description Section
 *
 * @module features/procurement/components/NoticeDescriptionSection
 * @description 描述区：翻译状态指示、译文/原文切换开关与描述内容展示。
 *              Description block: translation status, original/translated
 *              toggle and the description body.
 */
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";

export interface NoticeDescriptionSectionProps {
  /** 翻译进行中 */
  translating: boolean;
  /** 翻译失败 */
  failed: boolean;
  /** 是否存在译文（决定切换开关可见性） */
  hasTranslation: boolean;
  /** 当前显示原文 */
  showOriginal: boolean;
  /** 当前显示译文（决定是否展示译文声明） */
  showTranslated: boolean;
  toggleOriginal: () => void;
  /** 依据内容优先级规则计算后的展示描述
   * A2 strict 修复：上游计算结果可能为 undefined（无描述数据），放宽类型；
   * JSX 渲染 undefined 为空白，与原运行时行为一致。 */
  displayDescription: string | undefined;
}

export function NoticeDescriptionSection({
  translating,
  failed,
  hasTranslation,
  showOriginal,
  showTranslated,
  toggleOriginal,
  displayDescription,
}: NoticeDescriptionSectionProps) {
  const { t } = useLocale();
  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <h4 className="text-sm font-extrabold text-slate-900">{t("procurement_description")}</h4>
        {translating && (
          <span className="text-xs font-bold text-blue-600 animate-pulse">
            {t("procurement_translating")}
          </span>
        )}
        {failed && !translating && (
          <span className="text-xs font-bold text-amber-600">
            {t("procurement_translateFailed")}
          </span>
        )}
        {hasTranslation && (
          <Button
            onClick={toggleOriginal}
            variant="link"
            size="sm"
            className="px-0"
          >
            {showOriginal ? t("procurement_viewTranslation") : t("procurement_viewOriginal")}
          </Button>
        )}
      </div>
      <p dir="auto" className="text-sm text-slate-600 leading-7 whitespace-pre-line break-words">
        {displayDescription || t("procurement_noDesc")}
      </p>
      {showTranslated && (
        <p className="text-3xs text-slate-400 mt-2">{t("procurement_translateNote")}</p>
      )}
    </div>
  );
}
