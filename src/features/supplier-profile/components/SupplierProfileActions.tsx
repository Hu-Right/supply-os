"use client";

/**
 * 供应商企业主页 — 交互动作（询盘 / 认领）
 *
 * @module features/supplier-profile/components/SupplierProfileActions
 * @description 页面主体是服务端渲染，只有两个动作需要客户端状态：
 *              1) 发询盘——登录用户填写需求（非 VIP 也可用），提交到 supplier_inquiry；
 *              2) 认领企业——走 supplier-claims。
 *              联系方式不走按钮：正文「联系方式」卡片自身按会员状态展示脱敏/明文
 *              （见 SupplierContactCard），页头再放一个「查看联系方式」属于重复入口。
 *              按钮文案由服务端按 locale 传入 copy（避免 SSR 首屏回落到中文）。
 */
import { useState } from "react";
import { Send, ShieldCheck } from "lucide-react";
import { useUserId } from "@/core/auth";
import { Button } from "@/shared/ui";
import { emitAppEvent } from "@/core/events";
import { SupplierClaimModal } from "./SupplierClaimModal";
import { SupplierInquiryModal } from "./SupplierInquiryModal";
import type { SupplierProfileCopy } from "../copy";
import type { Supplier } from "@/types";

export interface SupplierProfileActionsProps {
  supplier: Supplier;
  dbId: number;
  claimed: boolean;
  copy: SupplierProfileCopy;
}

export function SupplierProfileActions({
  supplier,
  dbId,
  claimed,
  copy,
}: SupplierProfileActionsProps) {
  const userId = useUserId();
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

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {userId && !claimed && !claimDone && (
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
        <Button
          type="button"
          onClick={openInquiry}
          variant="primary"
          className="gap-2 px-5 py-2.5 text-sm font-bold"
        >
          <Send className="h-4 w-4" />
          {copy.sendInquiry}
        </Button>
      </div>

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