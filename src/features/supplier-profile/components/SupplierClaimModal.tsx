/**
 * 供应商认领弹窗
 * Supplier Claim Modal
 *
 * @module features/supplier-profile/components/SupplierClaimModal
 * @description 用户在供应商详情页点击"认领该企业"后弹出规则确认：
 *              确认即创建认领（立即临时绑定）并直接跳转企业设置页。
 *              2026-09-29 简化：联系人字段废弃；执照不在弹窗内上传——
 *              用户须在 1 小时内于设置页上传执照并保存，逾期自动解绑；
 *              执照保存成功即自动续期 7 天（管理员审核窗口，双时钟见 supplier-claims API）。
 *              文案全部走 i18n（supplier.json 的 profile_claim* 键）。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Clock } from "lucide-react";
import { api } from "@/core/http";
import { useLocale } from "@/core/i18n";

interface SupplierClaimModalProps {
  supplierId: number;
  companyName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function SupplierClaimModal({ supplierId, companyName, onClose, onSuccess }: SupplierClaimModalProps) {
  const router = useRouter();
  const { t } = useLocale();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    setError("");
    setSubmitting(true);
    try {
      await api("/api/supplier-claims", {
        method: "POST",
        body: { supplier_id: supplierId },
      });
      onSuccess();
      // 确认即跳转企业设置页：限时 1 小时内上传执照并保存
      router.push("/settings/enterprise");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("profile_claimFailed") || "提交失败，请稍后重试");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={submitting ? undefined : onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">{t("profile_claimTitle") || "认领该企业"}</h2>
          <button type="button" onClick={onClose} disabled={submitting} className="p-1 rounded hover:bg-slate-100">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600">
          <p className="font-medium text-slate-800">{companyName}</p>
          <p className="text-xs text-slate-500 mt-1">{t("profile_claimBoundNote") || "确认后该企业立即临时绑定到您的账号。"}</p>
        </div>

        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700 flex items-start gap-2">
          <Clock className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            {t("profile_claimDeadlineNote") || "请在 1 小时内前往企业信息页上传营业执照并保存，逾期将自动解绑；执照核验通过后即正式认证。"}
          </p>
        </div>

        {error && (
          <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-3">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {submitting
              ? t("profile_claimSubmitting") || "认领中…"
              : t("profile_claimConfirmCta") || "确认认领，去上传执照"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-100 transition-colors"
          >
            {t("cancel") || "取消"}
          </button>
        </div>
      </div>
    </div>
  );
}
