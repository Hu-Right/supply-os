"use client";

/**
 * 中标情报页 — 中国企业联合国采购中标案例板块（自 page-client.tsx 拆出，JSX 逐字不变）。
 *
 * 半容器：类别筛选/搜索/展开全部均为本板块私有的浏览态，内聚于此；
 * 案例详情弹窗目标（cnDetail）归页面容器——弹窗集合在容器统一挂载。
 *
 * @module app/(public)/award-intelligence/sections/CnCaseSection
 */
import { useState, memo } from "react";
import { Search, ArrowRight } from "lucide-react";
import { CN_AWARD_CASES, CN_CASE_CATEGORIES, type CnAwardCase } from "@/data/cn-award-cases";

export const CnCaseSection = memo(function CnCaseSection({ onOpenDetail }: { onOpenDetail: (c: CnAwardCase) => void }) {
  const [cnCategory, setCnCategory] = useState("全部");
  const [cnSearch, setCnSearch] = useState("");
  const [cnShowAll, setCnShowAll] = useState(false);

  return (
    <section className="px-4 sm:px-6 lg:px-8 mb-10">
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">中国企业联合国采购中标案例</h3>
            <p className="text-xs text-slate-500 mt-0.5">30 个官方可核验案例 · 涵盖 UNICEF / WHO / UNDP / UNOPS / UNHCR</p>
          </div>
          <span className="text-xs font-bold text-teal-600 bg-teal-50 px-2.5 py-1 rounded-lg">{CN_AWARD_CASES.length} 例</span>
        </div>

        {/* 类别筛选 */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {["全部", ...CN_CASE_CATEGORIES].map((cat) => (
            <button key={cat} onClick={() => { setCnCategory(cat); setCnShowAll(false); }}
              className={`text-2xs font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                cnCategory === cat ? "bg-teal-600 text-white border-teal-600" : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              }`}>
              {cat}
            </button>
          ))}
        </div>

        {/* 搜索 */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input type="text" value={cnSearch} onChange={(e) => { setCnSearch(e.target.value); setCnShowAll(false); }}
            placeholder="搜索：企业名 / 采购内容 / 合同编号 / UN机构"
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
        </div>

        {/* 案例卡片 */}
        {(() => {
          const filtered = CN_AWARD_CASES.filter((c) => {
            const matchCat = cnCategory === "全部" || c.category === cnCategory;
            const q = cnSearch.trim().toLowerCase();
            const matchSearch = !q || c.winnerCN.toLowerCase().includes(q) || c.winnerEN.toLowerCase().includes(q) ||
              c.content.toLowerCase().includes(q) || c.contractNo.toLowerCase().includes(q) || c.agency.toLowerCase().includes(q);
            return matchCat && matchSearch;
          });
          const displayed = cnShowAll ? filtered : filtered.slice(0, 6);
          if (filtered.length === 0) {
            return <p className="text-center text-xs text-slate-400 py-8">无匹配案例</p>;
          }
          return (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {displayed.map((c) => {
                  const fmtAmt = c.amountUSD ? `USD ${c.amountUSD.toLocaleString()}` : c.amountText;
                  return (
                    <div key={c.id} onClick={() => onOpenDetail(c)}
                      className="border border-slate-200 rounded-lg p-3.5 hover:border-teal-300 hover:shadow-sm cursor-pointer transition-all group">
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-2xs font-bold text-slate-400">#{c.id}</span>
                        <span className={`text-2xs font-bold px-1.5 py-0.5 rounded ${
                          c.evidenceLevel.includes("A+") ? "bg-emerald-100 text-emerald-700" :
                          c.evidenceLevel === "A" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                        }`}>{c.evidenceLevel}</span>
                      </div>
                      <p className="text-xs font-bold text-slate-800 mb-1 line-clamp-2 group-hover:text-teal-700 transition-colors">{c.content}</p>
                      <p className="text-2xs font-bold text-teal-700 mb-1.5 truncate">{c.winnerCN}</p>
                      <div className="flex items-center justify-between text-2xs text-slate-400">
                        <span>{c.agency}</span>
                        <span className="font-bold text-slate-600">{fmtAmt}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {filtered.length > 6 && !cnShowAll && (
                <button onClick={() => setCnShowAll(true)}
                  className="mt-4 mx-auto block text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1">
                  查看全部 {filtered.length} 个案例 <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </>
          );
        })()}
      </div>
    </section>
  );
});
