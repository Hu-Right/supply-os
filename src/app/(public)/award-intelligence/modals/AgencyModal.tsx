"use client";

/**
 * 机构画像弹窗：S0 无多来源真实画像 → 诚实空态（不再展示假 UNICEF 画像）。
 *
 * @module app/(public)/award-intelligence/modals/AgencyModal
 */
import { memo } from "react";
import { Modal, EmptyState } from "@/shared/ui";

export const AgencyModal = memo(function AgencyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="采购机构画像" className="max-w-lg">
      <EmptyState title="机构画像接入中" description="买家画像需多来源中标数据积累，S1（TED）起提供。" />
    </Modal>
  );
});
