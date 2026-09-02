/**
 * 企业微信二维码弹窗（黄框）
 * WeChat Work QR Code Modal (amber border)
 *
 * @module shared/ui/WechatQRModal
 * @description 展示企业微信客服二维码，引导用户扫码咨询。
 *              ARCH-P1a（2026-08-31）：从 features/training/components 迁至 shared/ui，
 *              消除 procurement → training 跨 feature 依赖。
 */

import { MessageCircle } from "lucide-react";
import Image from "next/image";
import { useLocale } from "@/core/i18n";
import { Modal } from "./Modal";

export interface WechatQRModalProps {
  onClose: () => void;
}

export default function WechatQRModal({ onClose }: WechatQRModalProps) {
  const { t } = useLocale();

  return (
    <Modal open onClose={onClose} title={t("tlWechatModalTitle")}>
      <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-amber-400 bg-amber-50/50 p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-400 text-white">
          <MessageCircle className="h-6 w-6" />
        </div>
        <div className="overflow-hidden rounded-xl border-4 border-amber-400 bg-white p-2 shadow-md">
          <Image
            src="/wechat-service-qr.png"
            alt={t("tlWechatModalTitle")}
            width={208}
            height={208}
            className="h-52 w-52 object-contain"
          />
        </div>
        <p className="text-center text-sm leading-relaxed text-slate-600">{t("tlWechatModalDesc")}</p>
      </div>
    </Modal>
  );
}

WechatQRModal.displayName = "WechatQRModal";
