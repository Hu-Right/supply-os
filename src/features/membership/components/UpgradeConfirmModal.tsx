/**
 * 会员升级确认弹窗
 * Membership Upgrade Confirm Modal
 *
 * @module features/membership/components/UpgradeConfirmModal
 * @description 展示升级预览（补差价、次数保留、有效期追溯），确认后触发升级支付。
 */
import { X, ArrowUpCircle, Clock, Loader2 } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { UpgradePreview } from "@/types";

export interface UpgradeConfirmModalProps {
  open: boolean;
  preview: UpgradePreview | null;
  /** 加载升级预览中 */
  loading: boolean;
  /** 确认升级下单中 */
  submitting: boolean;
  currency: string;
  onClose: () => void;
  onConfirm: () => void;
}

/** 格式化日期为本地化短格式 */
function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function UpgradeConfirmModal({
  open, preview, loading, submitting, currency, onClose, onConfirm,
}: UpgradeConfirmModalProps) {
  const { t } = useLocale();

  if (!open) return null;

  const symbol = currency === "CNY" ? "¥" : "$";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={submitting ? undefined : onClose}
      />

      {/* 弹窗主体 */}
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-center gap-2">
            <ArrowUpCircle className="w-5 h-5 text-amber-600" />
            <h3 className="text-base font-bold text-slate-900">{t("upgradeConfirmTitle")}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-white/60 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容 */}
        <div className="px-6 py-5">
          {loading || !preview ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              <p className="text-sm">{t("upgradeLoading")}</p>
            </div>
          ) : !preview.can_upgrade ? (
            <div className="py-8 text-center">
              <p className="text-sm text-red-600 font-semibold">
                {t("upgradeNotAvailable")}
              </p>
              {preview.reason && (
                <p className="text-xs text-slate-500 mt-1.5">{preview.reason}</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* 当前套餐 */}
              <div className="rounded-xl bg-slate-50 border border-slate-200/60 p-3.5">
                <p className="text-[11px] font-bold text-slate-400 uppercase">{t("upgradeCurrentPlan")}</p>
                <p className="text-sm font-bold text-slate-800 mt-1">{preview.current_plan?.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t("upgradeUsed")}：{preview.quota_used} / {preview.current_plan?.unlock_quota} {t("statusPanelTimes")}
                </p>
              </div>

              {/* 目标套餐 */}
              <div className="rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 p-3.5">
                <p className="text-[11px] font-bold text-amber-600 uppercase">{t("upgradeTargetPlan")}</p>
                <p className="text-sm font-bold text-slate-900 mt-1">{preview.target_plan?.name}</p>
                <div className="mt-1.5 space-y-0.5">
                  <p className="text-xs text-slate-600">
                    {t("upgradeTargetQuota")}：{preview.target_plan?.unlock_quota} {t("statusPanelTimes")}
                  </p>
                  <p className="text-xs text-slate-600">
                    {t("upgradeRemaining")}：
                    <span className="font-bold text-amber-700">{preview.remaining_after_upgrade}</span>
                    {" "}{t("statusPanelTimes")}
                  </p>
                  <p className="text-xs text-slate-600 inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {t("upgradeValidity")}：{t("upgradeValidityUnchanged")}
                    {preview.current_plan?.expires_at && (
                      <span className="text-slate-400">（{formatDate(preview.current_plan.expires_at)}）</span>
                    )}
                  </p>
                </div>
              </div>

              {/* 差价 */}
              <div className="flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3">
                <span className="text-xs font-semibold text-slate-300">{t("upgradePriceDiff")}</span>
                <span className="text-lg font-extrabold text-amber-400">
                  {symbol}{preview.price_difference.toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="px-6 pb-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {t("upgradeCancelBtn")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting || loading || !preview?.can_upgrade}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 shadow-md transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("upgradeConfirmBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}

UpgradeConfirmModal.displayName = "UpgradeConfirmModal";
