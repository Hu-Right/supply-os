"use client";

/**
 * 品类分布弹窗：真实聚合，无品类字段则诚实空态（不再展示假 US$ 金额/增长率）。
 *
 * @module app/(public)/award-intelligence/modals/CategoryModal
 */
import { memo } from "react";
import { Modal, EmptyState } from "@/shared/ui";
import { useLocale } from "@/core/i18n";
import type { Section, CategoryRow } from "@/features/procurement/awards/awardViewModel";

export const CategoryModal = memo(function CategoryModal({ open, onClose, section }: { open: boolean; onClose: () => void; section: Section<CategoryRow[]> }) {
  const { t } = useLocale();
  return (
    <Modal open={open} onClose={onClose} title={t("awardUiCategoryTitle")} className="max-w-xl">
      {section.present ? (
        <div className="space-y-2.5">
          {section.data.map((c) => {
            const max = Math.max(...section.data.map((x) => x.count), 1);
            return (
              <div key={c.name} className="bg-slate-50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-800">{c.name}</span>
                  <span className="text-xs font-extrabold text-slate-900">{t("awardUiCategoryCount", { n: c.count })}</span>
                </div>
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-500 rounded-full" style={{ width: `${(c.count / max) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState title={t("awardUiCategoryEmptyTitle")} description={section.reason} />
      )}
    </Modal>
  );
});
