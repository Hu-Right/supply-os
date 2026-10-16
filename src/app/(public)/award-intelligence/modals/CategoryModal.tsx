"use client";

/**
 * 品类分布弹窗（自 Modals.tsx 拆出，数据与 JSX 逐字不变）。
 *
 * @module app/(public)/award-intelligence/modals/CategoryModal
 */
import { memo } from "react";
import { Award } from "lucide-react";
import { Modal } from "@/shared/ui";
import { DataSource } from "./_shared";

/* ── 品类分布弹窗 ── */
export const CategoryModal = memo(function CategoryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mainCats = [
    { name: "药品与疫苗", pct: 38, amount: "US$8.6B", growth: "+5.2%", sub: ["mRNA 疫苗", "口服补液盐", "抗疟药", "抗生素", "胰岛素"] },
    { name: "医疗设备", pct: 22, amount: "US$5.0B", growth: "+8.1%", sub: ["呼吸机", "超声诊断仪", "X 光机", "输液泵", "监护仪"] },
    { name: "建筑与工程", pct: 16, amount: "US$3.6B", growth: "+12.3%", sub: ["学校建设", "医疗设施", "供水系统", "道路基建", "临时庇护所"] },
    { name: "ICT 信息技术", pct: 10, amount: "US$2.3B", growth: "+3.7%", sub: ["数据中心", "网络设备", "软件许可", "卫星通信", "网络安全"] },
    { name: "食品与农业", pct: 7, amount: "US$1.6B", growth: "-6.4%", sub: ["营养饼干", "强化面粉", "种子包", "灌溉设备", "储存设施"] },
    { name: "其他", pct: 7, amount: "US$1.6B", growth: "+1.1%", sub: ["运输物流", "纺织品", "办公用品", "燃料", "安保服务"] },
  ];
  const topSubs = [
    { name: "mRNA 疫苗", cat: "药品与疫苗", amount: "$2.45B" },
    { name: "呼吸机", cat: "医疗设备", amount: "$1.12B" },
    { name: "学校建设", cat: "建筑与工程", amount: "$980M" },
    { name: "口服补液盐", cat: "药品与疫苗", amount: "$860M" },
    { name: "超声诊断仪", cat: "医疗设备", amount: "$740M" },
    { name: "数据中心", cat: "ICT", amount: "$620M" },
    { name: "营养饼干", cat: "食品与农业", amount: "$510M" },
    { name: "供水系统", cat: "建筑与工程", amount: "$490M" },
    { name: "抗疟药", cat: "药品与疫苗", amount: "$430M" },
    { name: "网络设备", cat: "ICT", amount: "$380M" },
  ];
  return (
    <Modal open={open} onClose={onClose} title="品类分布（2025）" className="max-w-2xl">
      {/* 主品类 */}
      <div className="space-y-2.5 mb-5">
        {mainCats.map((c) => (
          <div key={c.name} className="bg-slate-50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800">{c.name}</span>
                <span className={`text-2xs font-bold px-1.5 py-0.5 rounded ${c.growth.startsWith("+") ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
                  {c.growth}
                </span>
              </div>
              <span className="text-xs font-extrabold text-slate-900">{c.amount}</span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden mb-1.5">
              <div className="h-full bg-teal-500 rounded-full" style={{ width: `${c.pct}%` }} />
            </div>
            <div className="flex flex-wrap gap-1">
              {c.sub.map((s) => (
                <span key={s} className="text-2xs px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">{s}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 热门子品类 TOP 10 */}
      <div>
        <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1"><Award className="w-3.5 h-3.5 text-amber-500" /> 热门采购子品类 TOP 10</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-1.5 text-slate-400 font-bold w-6">#</th>
                <th className="text-left py-1.5 text-slate-400 font-bold">子品类</th>
                <th className="text-left py-1.5 text-slate-400 font-bold">所属大类</th>
                <th className="text-right py-1.5 text-slate-400 font-bold">金额</th>
              </tr>
            </thead>
            <tbody>
              {topSubs.map((s, i) => (
                <tr key={s.name} className="border-b border-slate-50">
                  <td className="py-1.5 font-bold text-slate-400">{i + 1}</td>
                  <td className="py-1.5 font-bold text-slate-800">{s.name}</td>
                  <td className="py-1.5 text-slate-500">{s.cat}</td>
                  <td className="py-1.5 text-right font-bold text-slate-700">{s.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DataSource authoritative="UN ASR 2025（大类占比）/ 平台品目分类口径" analysis="增长率与子品类金额为平台分析模型" />
    </Modal>
  );
});
