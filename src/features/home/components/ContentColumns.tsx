/**
 * 三栏内容区 — 热门商机 / 优质供应商 / RFQ 需求
 * Content Columns — Hot Notices / Quality Suppliers / RFQ
 *
 * @module features/home/components/ContentColumns
 * @description 首页三栏卡片区，数据来自真实 API。
 *              宽表字段回退链与列表页 NoticeCard 一致。
 */
import { memo, useState, useEffect } from "react";
import { useLocale } from "@/core/i18n";
import { api } from "@/core/http";
import { getCountryDisplayName } from "@/shared/data/countryNames";
import { CountryFlag } from "@/shared/ui";
import { noticeTypeKey } from "@/shared/utils/notice-type";
import {
  displayNoticeTitle, displayNoticeAgency, displayNoticeBudget, displayDeadlineLabel,
  type NoticeDisplayFields,
} from "@/shared/utils/noticeDisplay";

/** 三栏卡片共用的宽表字段口径（与列表页 NoticeCard 一致） */
interface HomeNoticeItem extends NoticeDisplayFields {
  id: number;
}

/** 三栏内容区 — 热门商机 / 优质供应商 / RFQ 需求 */
export const ContentColumns = memo(function ContentColumns() {
  const { t, locale } = useLocale();
  const [suppliers, setSuppliers] = useState<Array<{
    id: string; nameZh: string; countryZh: string; cityZh: string; complianceLabelsZh: string[];
    mainProductsZh: string[]; status: string;
  }>>([]);
  const [hotNotices, setHotNotices] = useState<HomeNoticeItem[]>([]);
  const [rfqNotices, setRfqNotices] = useState<HomeNoticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  
  // 复用 shared 工具函数，与 procurement/NoticeCard 保持口径一致
  const displayCountry = (n: HomeNoticeItem) => getCountryDisplayName(n.country, locale);
  // 采购类型徽章文案：noticeTypeKey + i18n，未知类型不展示
  const typeLabel = (n: HomeNoticeItem) => {
    const key = noticeTypeKey(n.notice_type);
    return key ? t(key) : "";
  };

  /** 基于字符串哈希生成确定性 HSL 颜色（同一名称始终同色） */
  const nameToColor = (name: string): string => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 55%, 50%)`;
  };

  useEffect(() => {
    const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    let completed = 0;
    let failed = 0;
    const total = 3;
    const onSettle = () => {
      completed++;
      if (completed >= total) {
        setLoading(false);
        // 全部失败时才标记为错误态
        if (failed >= total) setHasError(true);
      }
    };

    // 获取已审核的优质供应商（最新 3 条）
    api<{ items: Array<{ id: string; nameZh: string; countryZh: string; cityZh: string; complianceLabelsZh: string[]; mainProductsZh: string[]; status: string }> }>("/api/suppliers?page=1&pageSize=3&sort=latest")
      .then((data) => setSuppliers(data.items ?? []))
      .catch((e) => { failed++; console.warn("[ContentColumns] suppliers fetch failed:", e); })
      .finally(onSettle);

    // 热门商机：仅取运营精选（is_featured=1）
    api<{ items: HomeNoticeItem[] }>(`/api/notices/unified-search?page=1&page_size=3&featured=1&sort=newest&deadline_from=${today}`)
      .then((data) => setHotNotices((data.items ?? []).slice(0, 3)))
      .catch((e) => { failed++; console.warn("[ContentColumns] hot notices fetch failed:", e); })
      .finally(onSettle);

    // 最新 RFQ 询价类公告
    api<{ items: HomeNoticeItem[] }>(`/api/notices/unified-search?page=1&page_size=3&notice_type=RFQ&sort=newest&deadline_from=${today}`)
      .then((data) => setRfqNotices((data.items ?? []).slice(0, 3)))
      .catch((e) => { failed++; console.warn("[ContentColumns] RFQ notices fetch failed:", e); })
      .finally(onSettle);
  }, []);

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-10">
      <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 热门商机 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-extrabold text-slate-900">今日热门商机</h3>
            <a href="/procurement" className="text-xs text-slate-400 hover:text-teal-600 font-semibold transition-colors">
              更多 &gt;
            </a>
          </div>
          <div className="flex-1">
            {loading ? (
              <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-16 rounded-lg bg-slate-100 animate-pulse" />)}</div>
            ) : hasError && hotNotices.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">加载失败，请稍后刷新重试</div>
            ) : hotNotices.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">暂无热门商机</div>
            ) : (
              hotNotices.map((notice) => (
                <a key={notice.id} href={`/procurement?notice_id=${notice.id}`} className="block group py-4 border-b border-slate-100 last:border-b-0">
                  <div className="flex items-center gap-2">
                    <CountryFlag name={notice.country} />
                    {notice.notice_type && (
                      <span className="px-2 py-0.5 rounded border border-teal-200 bg-teal-50 text-2xs font-bold text-teal-700">
                        {typeLabel(notice)}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-amber-600 shrink-0">{displayDeadlineLabel(notice.deadline_sec)}</span>
                  </div>
                  <p className="text-[15px] font-extrabold text-slate-900 group-hover:text-teal-700 transition-colors line-clamp-2 mt-2">
                    {displayNoticeTitle(notice)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1.5 truncate">
                    {[displayCountry(notice), displayNoticeAgency(notice)].filter(Boolean).join(" / ")}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-semibold text-slate-800">预算：{displayNoticeBudget(notice.estimated_value)}</span>
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
            {loading ? (
              <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-12 rounded-lg bg-slate-100 animate-pulse" />)}</div>
            ) : hasError && suppliers.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">加载失败，请稍后刷新重试</div>
            ) : suppliers.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">暂无推荐供应商</div>
            ) : (
              suppliers.map((supplier) => (
                <a key={supplier.id} href={`/supplier?id=${supplier.id}`} className="block group py-5 border-b border-slate-100 last:border-b-0">
                  {/* 第一行：头像 + 公司名 + 认证标签 */}
                  <div className="flex items-center gap-3">
                    <div
                      className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-extrabold"
                      style={{ backgroundColor: nameToColor(supplier.nameZh) }}
                    >
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
                      <p className="text-xs text-slate-500 mt-1">
                        {[supplier.countryZh, supplier.cityZh].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                  {/* 第二行：资质标签 */}
                  <div className="flex flex-wrap gap-1 mt-3">
                    {(supplier.complianceLabelsZh ?? []).slice(0, 3).map((label, j) => (
                      <span key={j} className="text-2xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                        {label}
                      </span>
                    ))}
                  </div>
                  {/* 第三行：主营产品 + 按钮 */}
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-xs text-slate-500 truncate flex-1 mr-3">
                      {(supplier.mainProductsZh ?? []).slice(0, 3).join(" · ")}
                    </p>
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
          <div className="flex-1">
            {loading ? (
              <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-16 rounded-lg bg-slate-100 animate-pulse" />)}</div>
            ) : hasError && rfqNotices.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">加载失败，请稍后刷新重试</div>
            ) : rfqNotices.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">暂无 RFQ 询价公告</div>
            ) : (
              rfqNotices.map((notice) => (
                <a key={notice.id} href={`/procurement?notice_id=${notice.id}`} className="block group py-4 border-b border-slate-100 last:border-b-0">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-2xs font-bold text-blue-700">
                      询价公告 (RFQ)
                    </span>
                    <span className="ml-auto text-xs text-slate-400 shrink-0">{displayDeadlineLabel(notice.deadline_sec)}</span>
                  </div>
                  <p className="text-[15px] font-extrabold text-slate-900 group-hover:text-blue-700 transition-colors line-clamp-2 mt-2">
                    {displayNoticeTitle(notice)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1.5 truncate">
                    {[displayNoticeAgency(notice), displayCountry(notice)].filter(Boolean).join(" / ")}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-semibold text-slate-800">预算：{displayNoticeBudget(notice.estimated_value)}</span>
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
});
