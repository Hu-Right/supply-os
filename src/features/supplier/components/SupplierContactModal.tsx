/**
 * 供应商联络弹窗
 * Supplier Contact Modal
 *
 * @module features/supplier/components/SupplierContactModal
 * @description 替代原生 alert 的联络交互弹窗：VIP 门槛提示 / 加载中 / 联系方式展示 / 失败提示
 *              Contact modal replacing native alert: VIP gate / loading / contact info / error
 */

import { Crown, User, Mail, Phone, AlertCircle } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { Modal, Spinner } from "@/shared/ui";
import type { Supplier } from "@/types";
import type { SupplierContact } from "../api";
import { emitAppEvent } from "@/core/events";

export type SupplierContactStatus = "vipOnly" | "loading" | "success" | "error";

export type SupplierContactModalProps = {
  supplier: Supplier;
  status: SupplierContactStatus;
  contact: SupplierContact | null;
  onClose: () => void;
};

export function SupplierContactModal({
  supplier,
  status,
  contact,
  onClose,
}: SupplierContactModalProps) {
  const { t, locale } = useLocale();
  const name = pickLocale(locale, supplier.nameZh, supplier.nameEn);

  // VIP 门槛：关闭弹窗并复用全局事件打开登录/升级入口（与 ProtectedRoute 同款门槛模式）
  const handleUpgrade = () => {
    onClose();
    emitAppEvent("supply-os:require-vip");
  };

  return (
    <Modal open onClose={onClose} title={t("supplierContactTitle", { name })}>
      {status === "vipOnly" && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            <Crown className="mt-0.5 h-5 w-5 shrink-0" />
            <p>{t("supplierContactVipOnly")}</p>
          </div>
          <button
            type="button"
            onClick={handleUpgrade}
            className="w-full cursor-pointer rounded-lg bg-gradient-to-tr from-teal-600 to-indigo-600 py-2.5 text-sm font-bold text-white shadow-md transition-opacity hover:opacity-90"
          >
            {t("supplierContactUpgradeBtn")}
          </button>
        </div>
      )}

      {status === "loading" && (
        <div className="flex flex-col items-center gap-3 py-8">
          <Spinner size="lg" />
          <p className="text-sm text-slate-500">{t("supplierContactLoading")}</p>
        </div>
      )}

      {status === "success" && contact && (
        <div className="space-y-3">
          {[
            {
              icon: User,
              label: t("supplierContactPersonLabel"),
              value: <span>{contact.contactPerson}</span>,
            },
            {
              icon: Mail,
              label: t("supplierContactEmailLabel"),
              value: (
                <a
                  href={`mailto:${contact.contactEmail}`}
                  dir="ltr"
                  className="text-teal-700 hover:underline"
                >
                  {contact.contactEmail}
                </a>
              ),
            },
            {
              icon: Phone,
              label: t("supplierContactPhoneLabel"),
              value: (
                <a
                  href={`tel:${contact.contactPhone}`}
                  dir="ltr"
                  className="text-teal-700 hover:underline"
                >
                  {contact.contactPhone}
                </a>
              ),
            },
          ].map((row) => {
            const Icon = row.icon;
            return (
              <div
                key={row.label}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
              >
                <span className="flex items-center gap-2 text-slate-500">
                  <Icon className="h-4 w-4" />
                  {row.label}
                </span>
                <span className="font-semibold text-slate-900">{row.value}</span>
              </div>
            );
          })}
        </div>
      )}

      {status === "error" && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{t("supplierContactFailed")}</p>
        </div>
      )}
    </Modal>
  );
}

SupplierContactModal.displayName = "SupplierContactModal";
