"use client";

/**
 * 供应商企业主页 — 交互动作（联系 / 认领）
 *
 * @module features/supplier-profile/components/SupplierProfileActions
 * @description 从旧版 SupplierProfilePage 中抽出的最小客户端边界：页面主体是服务端渲染，
 *              只有「发询盘 / 查看联系方式」「认领企业」两个动作需要客户端状态与弹窗。
 *              联系方式仍走 VIP 门槛（403 → 升级事件），认领仍走 supplier-claims API。
 */
import { useState } from "react";
import { Send, ShieldCheck } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useAuth, useUserId } from "@/core/auth";
import { Button } from "@/shared/ui";
import { fetchSupplierContact, type SupplierContact, type SupplierContactStatus } from "@/shared/api/supplier";
import { SupplierContactModal } from "@/shared/components/SupplierContactModal";
import { SupplierClaimModal } from "./SupplierClaimModal";
import type { Supplier } from "@/types";

export interface SupplierProfileActionsProps {
  supplier: Supplier;
  dbId: number;
  claimed: boolean;
  /** contact：只渲染联系按钮（详情正文的联系卡复用）；header：联系 + 认领 */
  variant?: "header" | "contact";
}

export function SupplierProfileActions({
  supplier,
  dbId,
  claimed,
  variant = "header",
}: SupplierProfileActionsProps) {
  const { t } = useLocale();
  const { isVip } = useAuth();
  const userId = useUserId();
  const [contactModal, setContactModal] = useState<{
    status: SupplierContactStatus;
    contact: SupplierContact | null;
  } | null>(null);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claimDone, setClaimDone] = useState(false);

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
            {t("profile_claimTitle")}
          </Button>
        )}
        <Button
          type="button"
          onClick={handleContact}
          variant="primary"
          className="gap-2 px-5 py-2.5 text-sm font-bold"
        >
          <Send className="h-4 w-4" />
          {t("profile_sendInquiry")}
        </Button>
      </div>

      {contactModal && (
        <SupplierContactModal
          supplier={supplier}
          status={contactModal.status}
          contact={contactModal.contact}
          onClose={() => setContactModal(null)}
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
