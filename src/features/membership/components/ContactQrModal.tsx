/**
 * 联系咨询客服码弹窗（企业版 contact 档 / 非自助服务共用）
 * Contact QR modal — 展示客服微信码，不登录、不下单
 *
 * @module features/membership/components/ContactQrModal
 */
"use client";

import Image from "next/image";
import { QrCode } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Modal } from "@/shared/ui";

export interface ContactQrModalProps {
  open: boolean;
  onClose: () => void;
}

export function ContactQrModal({ open, onClose }: ContactQrModalProps) {
  const { t } = useLocale();
  if (!open) return null;
  return (
    <Modal open onClose={onClose} title={t("contactQrTitle")}>
      <div className="flex flex-col items-center gap-3 py-2">
        <Image
          src="/wechat-service-qr.png"
          alt={t("svcQrAlt")}
          width={180}
          height={180}
          className="rounded-xl"
          unoptimized
        />
        <p className="flex items-start gap-1.5 text-xs text-slate-500 text-center leading-relaxed">
          <QrCode className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{t("contactQrHint")}</span>
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-1 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-700 cursor-pointer"
        >
          {t("contactQrClose")}
        </button>
      </div>
    </Modal>
  );
}

ContactQrModal.displayName = "ContactQrModal";
