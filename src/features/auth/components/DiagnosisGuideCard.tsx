"use client";
/**
 * 资质诊断引导卡（右下角）
 * Diagnosis Guide Prompt (bottom-right)
 *
 * @module features/auth/components/DiagnosisGuideCard
 * @description 已登录且已绑定企业主体、但该主体还没有资质诊断记录时，在页面右下角弹出
 *              非阻断式引导卡，提示去做供应商投标能力诊断（/procurement/diagnosis）。
 *              与 EnterpriseOnboardingModal（未绑定企业的「完善企业信息」卡）天然互斥：
 *              那边 !bound && !hasPool 才显示，这边 bound 才显示，绑定成功瞬间经
 *              supply-os:enterprise-changed 事件无缝交接，不会同屏叠卡。
 *              关闭按用户维度写 sessionStorage（会话级），下次访问只要仍未诊断会再次弹出——
 *              不永久隐藏，直到该主体完成诊断（useHasDiagnosis 翻真）自动收起。
 *              本组件只做「引导入口」，诊断表单逻辑在 DiagnosisFormPage/useDiagnosisForm。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X, Sparkles, ClipboardCheck } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import { useUserId } from "@/core/auth/useUserId";
import { useEnterpriseInfo } from "@/shared/hooks/useEnterpriseInfo";
import { useHasDiagnosis } from "@/shared/hooks/useHasDiagnosis";
import { api } from "@/core/http";

/** 关闭态按用户 + 会话隔离（sessionStorage 标签页关闭即清），下次访问会重新提醒 */
const dismissKey = (userId: number) => `supply-os:diagnosis-guide-dismissed:${userId}`;

export function DiagnosisGuideCard() {
  const { t } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const userId = useUserId();
  const { bound, enterprise, loading: entLoading, error: entError } = useEnterpriseInfo();
  const supplierId = bound ? enterprise?.id : undefined;
  const { hasDiagnosis, loading: diagLoading, error: diagError } = useHasDiagnosis(userId, supplierId);

  const [dismissed, setDismissed] = useState(true); // 初值 true：SSR/首帧不闪卡，读缓存后再决定
  const impressionSentRef = useRef(false);

  /** 卡片事件埋点：曝光/点击/关闭；失败静默，不阻断交互 */
  const sendEvent = useCallback(
    (event: "impression" | "click" | "dismiss") => {
      if (!userId) return;
      void api("/api/supplier-diagnosis/guide-event", {
        method: "POST",
        body: {
          event,
          supplier_id: supplierId ?? undefined,
          path: pathname?.split("?")[0],
        },
      }).catch(() => {});
    },
    [userId, supplierId, pathname],
  );

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

  const closeCard = useCallback(
    (event: "click" | "dismiss") => {
      sendEvent(event);
      setDismissed(true);
      if (userId) {
        try {
          sessionStorage.setItem(dismissKey(userId), "1");
        } catch {
          /* 隐私模式/配额异常时静默：本次会话内隐藏即可，下次访问仍会提醒 */
        }
      }
    },
    [sendEvent, userId],
  );

  const goDiagnosis = useCallback(() => {
    closeCard("click");
    router.push("/procurement/diagnosis");
  }, [closeCard, router]);

  // 状态不确定（loading/error/主体缺失）期间不弹，避免误唤起——错误时宁可少弹一次
  const uncertain = entLoading || diagLoading || !!entError || !!diagError || !bound || !enterprise?.id;
  // 诊断页本身不弹引导卡：避免与吸底提交栏/表单操作区重叠，也避免“点 CTA 又回到当前页”
  const onDiagnosisPage = pathname?.startsWith("/procurement/diagnosis") ?? false;
  const show = !!userId && !uncertain && !hasDiagnosis && !dismissed && !onDiagnosisPage;

  // 曝光只记一次（挂载周期内）；后续 show 变化不再重复
  useEffect(() => {
    if (!show || impressionSentRef.current) return;
    impressionSentRef.current = true;
    sendEvent("impression");
  }, [show, sendEvent]);

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label={t("diagGuideTitle") || "评估贵司投标能力"}
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-30 w-[calc(100vw-2rem)] max-w-sm"
    >
      <div className="rounded-2xl border border-border bg-white shadow-2xl overflow-hidden">
        {/* 顶部渐变条 + 关闭 */}
        <div className="relative bg-gradient-to-br from-brand-50 to-white px-5 pt-5 pb-4">
          <button
            type="button"
            onClick={() => closeCard("dismiss")}
            aria-label={t("diagGuideLater") || "稍后再说"}
            className="absolute right-3 top-3 rounded-full p-1.5 text-secondary-400 transition-colors hover:bg-secondary-100 hover:text-secondary-700"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 text-brand-700 px-2 py-0.5 text-2xs font-bold">
              <Sparkles className="w-3 h-3" />
              {t("diagGuideBadge") || "下一步"}
            </span>
          </div>
          <h3 className="text-sm font-bold text-foreground leading-snug">
            {t("diagGuideTitle") || "评估贵司投标能力"}
          </h3>
          <p className="text-xs text-muted-foreground mt-1.5 leading-5">
            {t("diagGuideDesc") ||
              "贵司已完成企业绑定。做一次资质诊断，评估国际公共采购就绪度，获取等级与能力缺口清单。"}
          </p>
        </div>

        {/* 操作区 */}
        <div className="px-5 py-4 space-y-2 border-t border-border">
          <Button
            type="button"
            onClick={goDiagnosis}
            className="w-full justify-center"
          >
            <ClipboardCheck className="w-4 h-4 shrink-0" />
            {t("diagGuideCta") || "去做资质诊断"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => closeCard("dismiss")}
            className="w-full"
          >
            {t("diagGuideLater") || "稍后再说"}
          </Button>
        </div>
      </div>
    </div>
  );
}

DiagnosisGuideCard.displayName = "DiagnosisGuideCard";
