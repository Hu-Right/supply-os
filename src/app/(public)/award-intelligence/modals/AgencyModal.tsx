"use client";

/**
 * 机构画像弹窗：S0 无多来源真实画像 → 诚实空态（不再展示假 UNICEF 画像）。
 *
 * @module app/(public)/award-intelligence/modals/AgencyModal
 */
import { memo } from "react";
import { Modal, EmptyState } from "@/shared/ui";
import { useLocale } from "@/core/i18n";

export const AgencyModal = memo(function AgencyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLocale();
  return (
    <Modal open={open} onClose={onClose} title={t("awardBuyerProfileTitle")} className="max-w-lg">
      <EmptyState title={t("awardUiAgencyEmptyTitle")} description={t("awardUiAgencyEmptyDesc")} />
    </Modal>
  );
});
