/**
 * 三栏内容区 — 热门商机 / 优质供应商 / RFQ 需求
 * Content Columns — Hot Notices / Quality Suppliers / RFQ
 *
 * @module features/home/components/ContentColumns
 * @description 首页三栏卡片区（容器组件），数据来自真实 API。
 *              2026-10 组件拆分：卡片渲染抽出 content/NoticeScrollCard 与
 *              content/SupplierScrollCard（原内联 renderItem 共 180+ 行，
 *              单文件破 200 行红线）；头像色工具上收 shared/utils/format。
 *              本文件只保留取数编排 + 三列布局。
 */
import { memo, useState, useEffect } from "react";
import { useLocale } from "@/core/i18n";
import { apiCached } from "@/core/http";
import { VerticalMarquee } from "./VerticalMarquee";
import { NoticeScrollCard, type HomeNoticeItem } from "./content/NoticeScrollCard";
import { SupplierScrollCard, type HomeSupplierItem } from "./content/SupplierScrollCard";

/** 三栏内容区 — 热门商机 / 优质供应商 / RFQ 需求 */
export const ContentColumns = memo(function ContentColumns() {
  const { t, locale } = useLocale();
  const [suppliers, setSuppliers] = useState<HomeSupplierItem[]>([]);
  const [hotNotices, setHotNotices] = useState<HomeNoticeItem[]>([]);
  const [rfqNotices, setRfqNotices] = useState<HomeNoticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

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

    // 获取已审核的优质供应商（20 条用于滚动展示）
    apiCached<{ items: HomeSupplierItem[] }>("/api/suppliers?page=1&pageSize=20&sort=latest")
      .then((data) => setSuppliers(data.items ?? []))
      .catch((e) => { failed++; console.warn("[ContentColumns] suppliers fetch failed:", e); })
      .finally(onSettle);

    // 热门商机：仅取运营精选（is_featured=1），20 条用于滚动
    apiCached<{ items: HomeNoticeItem[] }>(`/api/notices/unified-search?page=1&page_size=20&featured=1&sort=newest&deadline_from=${today}`)
      .then((data) => setHotNotices(data.items ?? []))
      .catch((e) => { failed++; console.warn("[ContentColumns] hot notices fetch failed:", e); })
      .finally(onSettle);

    // 最新 RFQ 询价类公告，20 条用于滚动
    apiCached<{ items: HomeNoticeItem[] }>(`/api/notices/unified-search?page=1&page_size=20&notice_type=RFQ&sort=newest&deadline_from=${today}`)
      .then((data) => setRfqNotices(data.items ?? []))
      .catch((e) => { failed++; console.warn("[ContentColumns] RFQ notices fetch failed:", e); })
      .finally(onSettle);
  }, []);

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-10">
      <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 热门商机 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-extrabold text-slate-900">{t("homeHotTitle")}</h3>
            <a href="/procurement" className="text-xs text-slate-400 hover:text-teal-600 font-semibold transition-colors">
              {t("homeMore")} &gt;
            </a>
          </div>
          <div className="flex-1">
            <VerticalMarquee
              items={hotNotices}
              loading={loading}
              maxHeight={380}
              emptyText={hasError ? t("homeLoadFailed") : t("homeEmptyHot")}
              renderItem={(notice: HomeNoticeItem) => (
                <NoticeScrollCard notice={notice} locale={locale} t={t} variant="hot" />
              )}
            />
          </div>
          <a href="/procurement" className="mt-5 text-center text-sm font-bold text-teal-600 hover:underline block">
            {t("homeViewAllNotices")}
          </a>
        </div>

        {/* 优质供应商 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-extrabold text-slate-900">{t("homeSuppliersTitle")}</h3>
            <a href="/supplier" className="text-xs text-slate-400 hover:text-teal-600 font-semibold transition-colors">
              {t("homeMore")} &gt;
            </a>
          </div>
          <div className="flex-1">
            <VerticalMarquee
              items={suppliers}
              loading={loading}
              maxHeight={380}
              emptyText={hasError ? t("homeLoadFailed") : t("homeEmptySuppliers")}
              renderItem={(supplier: HomeSupplierItem) => <SupplierScrollCard supplier={supplier} t={t} />}
            />
          </div>
          <a href="/supplier" className="mt-5 text-center text-sm font-bold text-teal-600 hover:underline block">
            {t("homeViewAllSuppliers")}
          </a>
        </div>

        {/* 最新 RFQ 询价公告（真数据：统一搜索 notice_type=RFQ） */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-extrabold text-slate-900">{t("homeRfqTitle")}</h3>
            <a href="/procurement?notice_type=RFQ" className="text-xs text-slate-400 hover:text-teal-600 font-semibold transition-colors">
              {t("homeMore")} &gt;
            </a>
          </div>
          <div className="flex-1">
            <VerticalMarquee
              items={rfqNotices}
              loading={loading}
              maxHeight={380}
              emptyText={hasError ? t("homeLoadFailed") : t("homeEmptyRfq")}
              renderItem={(notice: HomeNoticeItem) => (
                <NoticeScrollCard notice={notice} locale={locale} t={t} variant="rfq" />
              )}
            />
          </div>
          <a href="/procurement?notice_type=RFQ" className="mt-5 text-center text-sm font-bold text-teal-600 hover:underline block">
            {t("homeViewAllRfq")}
          </a>
        </div>
      </div>
    </section>
  );
});
