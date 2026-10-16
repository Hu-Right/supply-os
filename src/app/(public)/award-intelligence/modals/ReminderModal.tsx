"use client";

/**
 * 设置提醒弹窗（自 Modals.tsx 拆出，行为逐字不变）。
 *
 * @module app/(public)/award-intelligence/modals/ReminderModal
 */
import { useState, memo } from "react";
import { Bell } from "lucide-react";
import { Modal } from "@/shared/ui";

/* ── 设置提醒弹窗 ── */
export const ReminderModal = memo(function ReminderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [agencies, setAgencies] = useState("UNICEF");
  const [categories, setCategories] = useState("医疗耗材, 疫苗");
  const [regions, setRegions] = useState("全球");
  const [frequency, setFrequency] = useState("weekly");

  return (
    <Modal open={open} onClose={onClose} title="设置采购提醒" className="max-w-lg">
      <div className="mb-4 p-3 rounded-lg bg-teal-50 border border-teal-100">
        <p className="text-xs font-bold text-teal-700 flex items-center gap-1.5"><Bell className="w-4 h-4" /> 订阅说明</p>
        <p className="text-2xs text-teal-600 mt-1">订阅后将在新公告发布时通过邮件 / 站内信通知您。可按机构、品类、地区、预算等条件精准筛选。</p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-bold text-slate-700 mb-1 block">关注机构</label>
          <input value={agencies} onChange={(e) => setAgencies(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="如 UNICEF, WHO, WFP" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-700 mb-1 block">关注品类</label>
          <input value={categories} onChange={(e) => setCategories(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="如 医疗耗材, 疫苗, 检验设备" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-700 mb-1 block">关注地区</label>
            <input value={regions} onChange={(e) => setRegions(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="如 非洲, 东南亚" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 mb-1 block">通知频率</label>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white">
              <option value="realtime">实时推送</option>
              <option value="daily">每日汇总</option>
              <option value="weekly">每周汇总</option>
              <option value="monthly">每月汇总</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex gap-3 justify-end mt-5 pt-4 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">取消</button>
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white transition-colors">确认订阅</button>
      </div>
    </Modal>
  );
});
