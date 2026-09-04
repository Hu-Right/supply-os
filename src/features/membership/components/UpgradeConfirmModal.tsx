/**
 * 会员升级确认弹窗
 * Membership Upgrade Confirm Modal
 *
 * @module features/membership/components/UpgradeConfirmModal
 * @description 展示升级预览（补差价、次数保留、有效期追溯），确认后触发升级支付。
 */
import { ArrowUpCircle, Clock, Loader2 } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Button, Modal } from "@/shared/ui";
import { formatDateShort } from "@/shared/utils/format";
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

export function UpgradeConfirmModal({
  open, preview, loading, submitting, currency, onClose, onConfirm,
}: UpgradeConfirmModalProps) {
  const { t } = useLocale();

  if (!open) return null;

  const symbol = currency === "CNY" ? "¥" : "$";

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={!submitting}
      closeOnEsc={!submitting}
      closeOnDrag={!submitting}
      className="max-w-md"
    >
      {/* 头部 */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-orange-50 -mx-4 md:-mx-6 px-4 md:px-6 py-4 rounded-t-2xl">
        <div className="flex items-center gap-2">
          <ArrowUpCircle className="w-5 h-5 text-amber-600" />
          <h3 className="text-base font-bold text-slate-900">{t("upgradeConfirmTitle")}</h3>
        </div>
      </div>

      {/* 内容 */}
      <div>
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
              <p className="text-3xs font-bold text-slate-400 uppercase">{t("upgradeCurrentPlan")}</p>
              <p className="text-sm font-bold text-slate-800 mt-1">{preview.current_plan?.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {t("upgradeUsed")}：{preview.quota_used} / {preview.current_plan?.unlock_quota} {t("statusPanelTimes")}
              </p>
            </div>

            {/* 目标套餐 */}
            <div className="rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 p-3.5">
              <p className="text-3xs font-bold text-amber-600 uppercase">{t("upgradeTargetPlan")}</p>
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
                    <span className="text-slate-400">（{formatDateShort(preview.current_plan.expires_at)}）</span>
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
      <div className="flex gap-3 pt-4 mt-4 border-t border-slate-100">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={submitting}
          className="flex-1 rounded-xl text-slate-600"
        >
          {t("upgradeCancelBtn")}
        </Button>
        <Button
          type="button"
          variant="accent"
          onClick={onConfirm}
          disabled={submitting || loading || !preview?.can_upgrade}
          className="flex-1 py-2.5 rounded-xl text-sm shadow-md transition-all duration-300 gap-1.5"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {t("upgradeConfirmBtn")}
        </Button>
      </div>
    </Modal>
  );
}

UpgradeConfirmModal.displayName = "UpgradeConfirmModal";
