"use client";

/**
 * 免费用户行业引导条（列表页顶部，可关闭）
 * Free-user industry guide banner (dismissible)
 *
 * @module features/procurement/components/procurement-page/IndustryGuideBanner
 * @description 行业墙对 free 生效后的引导入口：免费用户（无生效订阅）且未绑行业时展示，
 *              引导去设置页行业偏好（/settings/profile 的 IndustryPrefsForm）。
 *              关闭状态存 localStorage；已绑行业/订阅用户不渲染。纯前端引导，不影响列表请求。
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Compass, X } from "lucide-react";
import { useLocale } from "@/core/i18n";

/** 关闭标记的 localStorage 键（低风险最小实现：关过一次就不再打扰） */
const DISMISS_STORAGE_KEY = "supply-os:industry-guide-dismissed";

export function IndustryGuideBanner({ visible }: { visible: boolean }) {
  const { t } = useLocale();
  const router = useRouter();
  // 默认按已关闭渲染（SSR/首帧不出条），挂载后读 localStorage 纠正，避免水合不一致
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_STORAGE_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!visible || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, "1");
    } catch {
      // 隐私模式等写不进 localStorage：本次会话内关闭即可
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3"
      data-testid="industry-guide-banner"
    >
      <Compass className="h-4 w-4 shrink-0 text-teal-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-teal-800">{t("industryGuideTitle")}</p>
        <p className="mt-0.5 text-xs text-teal-700/80">{t("industryGuideDesc")}</p>
      </div>
      <button
        type="button"
        onClick={() => router.push("/settings/profile")}
        className="cursor-pointer rounded-lg bg-teal-600 px-3.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-teal-700"
      >
        {t("industryGuideCta")}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("industryGuideDismiss")}
        className="cursor-pointer rounded-full p-1 text-teal-500 transition-colors hover:bg-teal-100 hover:text-teal-700"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
