"use client";

/**
 * 供应商企业主页 — 交互动作（询盘 / 查看联系方式 / 认领）
 *
 * @module features/supplier-profile/components/SupplierProfileActions
 * @description 页面主体是服务端渲染，只有三个动作需要客户端状态：
 *              1) 发询盘——登录用户填写需求（非 VIP 也可用），提交到 supplier_inquiry；
 *              2) 查看联系方式——保持 VIP 门槛（403 → 升级事件）；
 *              3) 认领企业——走 supplier-claims。
 *              按钮文案由服务端按 locale 传入 copy（避免 SSR 首屏回落到中文）。
 */
import { useState } from "react";
import { Mail, Send, ShieldCheck } from "lucide-react";
import { useAuth, useUserId } from "@/core/auth";
import { Button } from "@/shared/ui";
import { emitAppEvent } from "@/core/events";
import { fetchSupplierContact, type SupplierContact, type SupplierContactStatus } from "@/shared/api/supplier";
import { SupplierContactModal } from "@/shared/components/SupplierContactModal";
import { SupplierClaimModal } from "./SupplierClaimModal";
import { SupplierInquiryModal } from "./SupplierInquiryModal";
import type { SupplierProfileCopy } from "../copy";
import type { Supplier } from "@/types";

export interface SupplierProfileActionsProps {
  supplier: Supplier;
  dbId: number;
  claimed: boolean;
  copy: SupplierProfileCopy;
  /** contact：联系方式卡（联系按钮在前）；header：页头（询盘 + 联系方式 + 认领） */
  variant?: "header" | "contact";
}

export function SupplierProfileActions({
  supplier,
  dbId,
  claimed,
  copy,
  variant = "header",
}: SupplierProfileActionsProps) {
  const { isVip } = useAuth();
  const userId = useUserId();
  const [contactModal, setContactModal] = useState<{
    status: SupplierContactStatus;
    contact: SupplierContact | null;
  } | null>(null);
  const [showInquiry, setShowInquiry] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claimDone, setClaimDone] = useState(false);

  const openInquiry = () => {
    if (!userId) {
      emitAppEvent("supply-os:require-login");
      return;
    }
    setShowInquiry(true);
  };

  const handleContact = async () => {
    if (!userId || !isVip) {
      setContactModal({ status: "vipOnly", contact: null });
      return;
    }
    setContactModal({ status: "loading", contact: null });
    try {
      const contact = await fetchSupplierContact(supplier.id);
      setContactModal({ status: "success", contact });
    } catch {
      setContactModal({ status: "error", contact: null });
    }
  };

  const inquiryButton = (primary: boolean) => (
    <Button
      type="button"
      onClick={openInquiry}
      variant={primary ? "primary" : "outline"}
      className={primary ? "gap-2 px-5 py-2.5 text-sm font-bold" : "gap-2 px-4 py-2.5 text-sm font-bold"}
    >
      <Send className="h-4 w-4" />
      {copy.sendInquiry}
    </Button>
  );

  const contactButton = (primary: boolean) => (
    <Button
      type="button"
      onClick={handleContact}
      variant={primary ? "primary" : "outline"}
      className={primary ? "gap-2 px-5 py-2.5 text-sm font-bold" : "gap-2 px-4 py-2.5 text-sm font-bold"}
    >
      <Mail className="h-4 w-4" />
      {copy.viewContact}
    </Button>
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {variant === "header" && userId && !claimed && !claimDone && (
          <Button
            type="button"
            onClick={() => setShowClaimModal(true)}
            variant="outline"
            className="gap-2 border-teal-200 px-4 py-2.5 text-sm font-bold text-teal-700 hover:bg-teal-50"
          >
            <ShieldCheck className="h-4 w-4" />
            {copy.claimAction}
          </Button>
        )}
        {variant === "header" ? (
          <>
            {inquiryButton(true)}
            {contactButton(false)}
          </>
        ) : (
          <>
            {contactButton(true)}
            {inquiryButton(false)}
          </>
        )}
      </div>

      {contactModal && (
        <SupplierContactModal
          supplier={supplier}
          status={contactModal.status}
          contact={contactModal.contact}
          onClose={() => setContactModal(null)}
        />
      )}

      {showInquiry && (
        <SupplierInquiryModal
          supplierId={supplier.id}
          supplierName={supplier.nameZh}
          onClose={() => setShowInquiry(false)}
        />
      )}

      {showClaimModal && (
        <SupplierClaimModal
          supplierId={dbId}
          companyName={supplier.nameZh}
          onClose={() => setShowClaimModal(false)}
          onSuccess={() => {
            setShowClaimModal(false);
            setClaimDone(true);
          }}
        />
      )}
    </>
  );
}
