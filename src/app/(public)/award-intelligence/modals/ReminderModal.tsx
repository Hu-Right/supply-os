"use client";

/**
 * 设置提醒弹窗（自 Modals.tsx 拆出，行为逐字不变）。
 *
 * @module app/(public)/award-intelligence/modals/ReminderModal
 */
import { useState, memo } from "react";
import { Bell } from "lucide-react";
import { Modal } from "@/shared/ui";
import { useLocale } from "@/core/i18n";

/* ── 设置提醒弹窗 ── */
export const ReminderModal = memo(function ReminderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLocale();
  const [agencies, setAgencies] = useState("UNICEF");
  const [categories, setCategories] = useState(t("awardUiReminderDefaultCategories"));
  const [regions, setRegions] = useState(t("awardUiReminderDefaultRegions"));
  const [frequency, setFrequency] = useState("weekly");

  return (
    <Modal open={open} onClose={onClose} title={t("awardUiReminderTitle")} className="max-w-lg">
      <div className="mb-4 p-3 rounded-lg bg-teal-50 border border-teal-100">
        <p className="text-xs font-bold text-teal-700 flex items-center gap-1.5"><Bell className="w-4 h-4" /> {t("awardUiReminderIntroTitle")}</p>
        <p className="text-2xs text-teal-600 mt-1">{t("awardUiReminderIntroDesc")}</p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-bold text-slate-700 mb-1 block">{t("awardUiReminderAgencies")}</label>
          <input value={agencies} onChange={(e) => setAgencies(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder={t("awardUiReminderAgenciesPlaceholder")} />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-700 mb-1 block">{t("awardUiReminderCategories")}</label>
          <input value={categories} onChange={(e) => setCategories(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder={t("awardUiReminderCategoriesPlaceholder")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-700 mb-1 block">{t("awardUiReminderRegions")}</label>
            <input value={regions} onChange={(e) => setRegions(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder={t("awardUiReminderRegionsPlaceholder")} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 mb-1 block">{t("awardUiReminderFrequency")}</label>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white">
              <option value="realtime">{t("awardUiReminderRealtime")}</option>
              <option value="daily">{t("awardUiReminderDaily")}</option>
              <option value="weekly">{t("awardUiReminderWeekly")}</option>
              <option value="monthly">{t("awardUiReminderMonthly")}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex gap-3 justify-end mt-5 pt-4 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">{t("cancel")}</button>
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white transition-colors">{t("awardUiReminderConfirm")}</button>
      </div>
    </Modal>
  );
});
