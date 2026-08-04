/**
 * 加载蒙层组件
 * Loading Overlay
 *
 * @description 搜索/语言切换期间的半透明蒙层 + 旋转指示器。
 *              覆盖父容器区域，不阻断页面其他交互。
 *              Semi-transparent overlay with spinner for search/locale switching.
 *              Covers the parent container, does not block other page interactions.
 */
import { useLocale } from "@/core/i18n";

export interface LoadingOverlayProps {
  visible: boolean;
}

export function LoadingOverlay({ visible }: LoadingOverlayProps) {
  const { t } = useLocale();

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-white/75 backdrop-blur-[3px] transition-opacity duration-200 ${
        visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
      aria-hidden={!visible}
    >
      <div className="flex flex-col items-center gap-3">
        {/* 旋转动画指示器 */}
        <div className="relative h-10 w-10">
          <div className="absolute inset-0 rounded-full border-[3px] border-slate-200" />
          <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-teal-500" />
        </div>
        <span className="text-xs font-bold text-slate-500">{t("procurement_loading")}</span>
      </div>
    </div>
  );
}
