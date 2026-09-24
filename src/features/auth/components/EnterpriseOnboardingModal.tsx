"use client";
/**
 * 新用户引导弹窗（右下角）
 * Enterprise Onboarding Prompt (bottom-right)
 *
 * @module features/auth/components/EnterpriseOnboardingModal
 * @description 已登录但「未绑定企业且未添加供应商资源库」时（典型场景：刚注册完成），
 *              在页面右下角弹出一个非阻断式引导卡片，提示完善企业信息并引导体验完整权益。
 *              判定口径与 settings/layout 的「未选择身份」保持一致：
 *              useEnterpriseInfo.bound + useHasSupplierPool.hasPool，loading/error 期间不弹避免闪现。
 *              关闭后按用户维度写入 sessionStorage（会话级）：同一标签页内不再打扰，
 *              但下次重新访问时只要仍未绑定就会再次弹出——不永久隐藏，直到完成绑定后 isUncommitted 转 false 才自动收起。
 *              企业侧编辑/认领仍由 /settings/enterprise（EnterpriseInfoCard / SupplierClaimModal）承载，
 *              本组件只做「引导入口」，不复制其表单逻辑。
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Package, X, Sparkles } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useUserId } from "@/core/auth/useUserId";
import { useEnterpriseInfo } from "@/shared/hooks/useEnterpriseInfo";
import { useHasSupplierPool } from "@/shared/hooks/useHasSupplierPool";

/** 关闭态按用户 + 会话隔离（sessionStorage 标签页关闭即清），下次访问会重新提醒 */
const dismissKey = (userId: number) => `supply-os:onboarding-enterprise-dismissed:${userId}`;

export function EnterpriseOnboardingModal() {
  const { t } = useLocale();
  const router = useRouter();
  const userId = useUserId();
  const { bound, loading: entLoading, error: entError } = useEnterpriseInfo();
  const { hasPool, loading: poolLoading, error: poolError } = useHasSupplierPool(userId);

  const [dismissed, setDismissed] = useState(true); // 初值 true：SSR/首帧不闪弹，读缓存后再决定

  // 读取用户维度的关闭态（仅客户端，避免 hydration 不一致）
  useEffect(() => {
    if (!userId) {
      setDismissed(true);
      return;
    }
    try {
      setDismissed(sessionStorage.getItem(dismissKey(userId)) === "1");
    } catch {
      setDismissed(false);
    }
  }, [userId]);

  const handleClose = useCallback(() => {
    setDismissed(true);
    if (userId) {
      try {
        sessionStorage.setItem(dismissKey(userId), "1");
      } catch {
        /* 隐私模式/配额异常时静默：本次会话内隐藏即可，下次访问仍会提醒 */
      }
    }
  }, [userId]);

  const go = useCallback(
    (path: string) => {
      handleClose();
      router.push(path);
    },
    [handleClose, router],
  );

  // 身份未确定（loading/error）期间不弹，避免闪现
  const identityUncertain = entLoading || poolLoading || !!entError || !!poolError;
  // 未选择身份：两者都未绑定且身份状态已确定且已登录，才显示引导
  const isUncommitted = !identityUncertain && !bound && !hasPool && !!userId;

  if (!isUncommitted || dismissed) return null;

  return (
    <div
      role="dialog"
      aria-label={t("onboardingEnterpriseTitle") || "完善企业信息，解锁全部权益"}
      className="fixed bottom-4 right-4 z-40 w-[calc(100vw-2rem)] max-w-sm"
    >
      <div className="rounded-2xl border border-border bg-white shadow-2xl overflow-hidden">
        {/* 顶部渐变条 + 关闭 */}
        <div className="relative bg-gradient-to-br from-brand-50 to-white px-5 pt-5 pb-4">
          <button
            type="button"
            onClick={handleClose}
            aria-label={t("onboardingSkip") || "稍后再说"}
            className="absolute top-3 right-3 p-1 rounded-lg text-muted-foreground hover:bg-secondary-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 text-brand-700 px-2 py-0.5 text-2xs font-bold">
              <Sparkles className="w-3 h-3" />
              {t("onboardingBadge") || "新用户"}
            </span>
          </div>
          <h3 className="text-sm font-bold text-foreground leading-snug">
            {t("onboardingEnterpriseTitle") || "完善企业信息，解锁全部权益"}
          </h3>
          <p className="text-xs text-muted-foreground mt-1.5 leading-5">
            {t("onboardingEnterpriseDesc") ||
              "您还未绑定企业或添加合作工厂。完善企业信息即可参与国际采购撮合，体验完整的平台权益。"}
          </p>
        </div>

        {/* 操作区 */}
        <div className="px-5 py-4 space-y-2 border-t border-border">
          <button
            type="button"
            onClick={() => go("/settings/enterprise")}
            className="w-full flex items-center gap-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 text-sm font-bold transition-colors"
          >
            <Building2 className="w-4 h-4 shrink-0" />
            {t("onboardingCtaEnterprise") || "完善企业信息"}
          </button>
          <button
            type="button"
            onClick={() => go("/settings/supplier-pool")}
            className="w-full flex items-center gap-2.5 rounded-lg border border-border bg-white hover:bg-secondary-50 text-foreground px-4 py-2.5 text-sm font-medium transition-colors"
          >
            <Package className="w-4 h-4 shrink-0" />
            {t("onboardingCtaSupplier") || "添加合作工厂"}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1 transition-colors"
          >
            {t("onboardingSkip") || "稍后再说"}
          </button>
        </div>
      </div>
    </div>
  );
}

EnterpriseOnboardingModal.displayName = "EnterpriseOnboardingModal";
