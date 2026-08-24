/**
 * 加载蒙层组件
 * Loading Overlay
 *
 * @module shared/ui/LoadingOverlay
 * @description 搜索/语言切换期间的半透明蒙层 + 旋转指示器。
 *              覆盖全屏、阻断所有交互（点击 + 滚动）。
 *              Full-screen overlay that blocks all interactions (click + scroll).
 */
import { useEffect } from "react";
import { useLocale } from "@/core/i18n";

export interface LoadingOverlayProps {
  visible: boolean;
}

export function LoadingOverlay({ visible }: LoadingOverlayProps) {
  const { t } = useLocale();

  // 加载期间锁定 body 滚动，防止用户滑动页面
  useEffect(() => {
    if (visible) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [visible]);

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
