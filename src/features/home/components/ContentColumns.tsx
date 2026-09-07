/**
 * 三栏内容区 — 热门商机 / 优质供应商 / RFQ 需求
 * Content Columns — Hot Notices / Quality Suppliers / RFQ
 *
 * @module features/home/components/ContentColumns
 * @description 首页三栏卡片区，数据来自真实 API。
 *              宽表字段回退链与列表页 NoticeCard 一致。
 */
import { useState, useEffect } from "react";
import { useLocale } from "@/core/i18n";
import { api } from "@/core/http";
import { getCountryDisplayName } from "@/shared/data/countryNames";
import { CountryFlag } from "@/shared/ui";
import { noticeTypeKey } from "@/features/procurement/notice-type";

/** 三栏卡片共用的宽表字段口径（与列表页 NoticeCard 一致） */
interface HomeNoticeItem {
  id: number; title: string; country: string; estimated_value: string; deadline_sec: number | null;
  notice_type?: string;
  title_i18n?: string; title_en?: string; agency?: string; agency_i18n?: string;
}

/** 三栏内容区 — 热门商机 / 优质供应商 / RFQ 需求 */
export function ContentColumns() {
  const { t, locale } = useLocale();
  const [suppliers, setSuppliers] = useState<Array<{
    id: string; nameZh: string; countryZh: string; cityZh: string; complianceLabelsZh: string[];
    mainProductsZh: string[]; status: string;
  }>>([]);
  const [hotNotices, setHotNotices] = useState<HomeNoticeItem[]>([]);
  const [rfqNotices, setRfqNotices] = useState<HomeNoticeItem[]>([]);

  // 与 NoticeCard 相同的宽表字段回退链：本地化标题 / 机构 i18n / 国家 中文名
  const displayTitle = (n: HomeNoticeItem) => n.title_i18n || n.title_en || n.title;
  const displayAgency = (n: HomeNoticeItem) => n.agency_i18n || n.agency || "";
  const displayCountry = (n: HomeNoticeItem) => getCountryDisplayName(n.country, locale);
  const displayBudget = (n: HomeNoticeItem) =>
    n.estimated_value && n.estimated_value !== "0.00"
      ? `USD ${Number(n.estimated_value).toLocaleString()}`
      : "预算详谈";
  // 采购类型徽章文案：noticeTypeKey + i18n（如"招标邀请（ITB）"），未知类型不展示徽章
  const typeLabel = (n: HomeNoticeItem) => {
    const key = noticeTypeKey(n.notice_type);
    return key ? t(key) : "";
  };
  // 兜底显示：宽表 NULLIF 后 deadline_sec 可能为 null；正常数据已被 deadline_from 过滤为未截止。
  // 超长截止（框架协议/动态采购系统可达数年）显示具体日期，避免"截止 2154 天"式观感（规划 §8 数据质量）
  const deadlineLabel = (n: HomeNoticeItem) => {
    if (!n.deadline_sec || n.deadline_sec <= 0) return "无截止日期";
    const left = Math.ceil((new Date(n.deadline_sec * 1000).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (left <= 0) return "已截止";
    if (left > 365) {
      const d = new Date(n.deadline_sec * 1000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} 截止`;
    }
    return `截止 ${left} 天`;
  };

  useEffect(() => {
    // 获取已审核的优质供应商（最新 3 条）
    api<{ items: Array<{ id: string; nameZh: string; countryZh: string; cityZh: string; complianceLabelsZh: string[]; mainProductsZh: string[]; status: string }> }>("/api/suppliers?page=1&pageSize=3&sort=latest")
      .then((data) => setSuppliers(data.items ?? []))
      .catch(() => {});

    // 热门商机：仅取运营精选（is_featured=1），与主流列表同管道（统一搜索 → Meili → 宽表详情）；
    // deadline_from=北京时区今天 排除过期/无截止，首页只推可行动机会
    const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    api<{ items: HomeNoticeItem[] }>(`/api/notices/unified-search?page=1&page_size=3&featured=1&sort=newest&deadline_from=${today}`)
      .then((data) => setHotNotices((data.items ?? []).slice(0, 3)))
      .catch(() => {});

    // 获取最新 RFQ 询价类公告（统一搜索 notice_type=RFQ，2026-09-06 起真数据渲染）
    api<{ items: HomeNoticeItem[] }>(`/api/notices/unified-search?page=1&page_size=3&notice_type=RFQ&sort=newest&deadline_from=${today}`)
      .then((data) => setRfqNotices((data.items ?? []).slice(0, 3)))
      .catch(() => {});
  }, []);

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-10">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 热门商机 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-extrabold text-slate-900">今日热门商机</h3>
            <a href="/procurement" className="text-xs text-slate-400 hover:text-teal-600 font-semibold transition-colors">
              更多 &gt;
            </a>
          </div>
          <div className="space-y-5 flex-1">
            {hotNotices.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">暂无热门商机</div>
            ) : (
              hotNotices.map((notice) => (
                <a key={notice.id} href={`/procurement?notice_id=${notice.id}`} className="block group">
                  <div className="flex items-center gap-2">
                    <CountryFlag name={notice.country} />
                    {notice.notice_type && (
                      <span className="px-2 py-0.5 rounded border border-teal-200 bg-teal-50 text-2xs font-bold text-teal-700">
                        {typeLabel(notice)}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-amber-600 shrink-0">{deadlineLabel(notice)}</span>
                  </div>
                  <p className="text-[15px] font-extrabold text-slate-900 group-hover:text-teal-700 transition-colors line-clamp-2 mt-2">
                    {displayTitle(notice)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1.5 truncate">
                    {[displayCountry(notice), displayAgency(notice)].filter(Boolean).join(" / ")}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-semibold text-slate-800">预算：{displayBudget(notice)}</span>
                    <span className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 group-hover:border-teal-400 group-hover:text-teal-700 transition-colors">
                      查看详情
                    </span>
                  </div>
                </a>
              ))
            )}
          </div>
          <a href="/procurement" className="mt-5 text-center text-sm font-bold text-teal-600 hover:underline block">
            查看全部商机 →
          </a>
        </div>

        {/* 优质供应商 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-extrabold text-slate-900">优质供应商推荐</h3>
            <a href="/supplier" className="text-xs text-slate-400 hover:text-teal-600 font-semibold transition-colors">
              更多 &gt;
            </a>
          </div>
          <div className="space-y-5 flex-1">
            {suppliers.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">加载中...</div>
            ) : (
              suppliers.map((supplier) => (
                <a key={supplier.id} href={`/supplier?id=${supplier.id}`} className="block group">
                  <div className="flex items-center gap-3">
                    <div className="shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center text-white text-sm font-extrabold">
                      {supplier.nameZh.slice(0, 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-extrabold text-slate-900 group-hover:text-teal-700 transition-colors truncate">
                          {supplier.nameZh}
                        </p>
                        {supplier.status === "approved" && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded border border-teal-200 bg-teal-50 text-2xs font-bold text-teal-700">
                            认证供应商
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 truncate">
                        {[supplier.countryZh, supplier.cityZh, ...(supplier.mainProductsZh ?? []).slice(0, 2)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex flex-wrap gap-1 min-w-0">
                      {(supplier.complianceLabelsZh ?? []).slice(0, 3).map((label, j) => (
                        <span key={j} className="text-2xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          {label}
                        </span>
                      ))}
                    </div>
                    <span className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 group-hover:border-teal-400 group-hover:text-teal-700 transition-colors">
                      查看详情
                    </span>
                  </div>
                </a>
              ))
            )}
          </div>
          <a href="/supplier" className="mt-5 text-center text-sm font-bold text-teal-600 hover:underline block">
            查看全部供应商 →
          </a>
        </div>

        {/* 最新 RFQ 询价公告（真数据：统一搜索 notice_type=RFQ） */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-extrabold text-slate-900">最新 RFQ 询价</h3>
            <a href="/procurement?notice_type=RFQ" className="text-xs text-slate-400 hover:text-teal-600 font-semibold transition-colors">
              更多 &gt;
            </a>
          </div>
          <div className="space-y-5 flex-1">
            {rfqNotices.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">暂无 RFQ 询价公告</div>
            ) : (
              rfqNotices.map((notice) => (
                <a key={notice.id} href={`/procurement?notice_id=${notice.id}`} className="block group">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-2xs font-bold text-blue-700">
                      询价公告 (RFQ)
                    </span>
                    <span className="ml-auto text-xs text-slate-400 shrink-0">{deadlineLabel(notice)}</span>
                  </div>
                  <p className="text-[15px] font-extrabold text-slate-900 group-hover:text-blue-700 transition-colors line-clamp-2 mt-2">
                    {displayTitle(notice)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1.5 truncate">
                    {[displayAgency(notice), displayCountry(notice)].filter(Boolean).join(" / ")}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-semibold text-slate-800">预算：{displayBudget(notice)}</span>
                    <span className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 group-hover:border-blue-400 group-hover:text-blue-700 transition-colors">
                      查看详情
                    </span>
                  </div>
                </a>
              ))
            )}
          </div>
          <a href="/procurement?notice_type=RFQ" className="mt-5 text-center text-sm font-bold text-teal-600 hover:underline block">
            查看全部RFQ →
          </a>
        </div>
      </div>
    </section>
  );
}
