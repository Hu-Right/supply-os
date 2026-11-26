/**
 * 公告「基本信息」表（展示型组件，无 hooks，服务端/客户端都能渲染）
 *
 * @module features/procurement/components/NoticeBasicInfoCard
 * @description 用户详情页（锁定/解锁）与 SEO 公开页共用同一张表，避免两套版式各写一份：
 *              - 公开页与锁定态：只传非会员字段；
 *              - 解锁态：额外传 platform（VIP，`/detail` 只在解锁后下发）。
 *
 * 版式与 2026-11-26 详情页改版一致：4 列表格（标签/值 ×2），字段缺失时整行不渲染。
 * 标签由调用方传入（详情页走 i18n，公开页是中文单语），本组件不读 locale。
 */
import type { ReactNode } from "react";

export interface NoticeBasicInfoLabels {
  title: string;
  reference: string;
  buyer: string;
  country: string;
  noticeType: string;
  publishDate: string;
  deadline: string;
  industry: string;
  budget: string;
  sourcePlatform: string;
}

export interface NoticeBasicInfoCardProps {
  labels: NoticeBasicInfoLabels;
  /** 参考编号（可含原文外链） */
  reference: ReactNode;
  buyer: ReactNode;
  country: string | null;
  noticeType: string;
  publishDate: string;
  /** 截止时间；倒计时由调用方拼进同一单元格 */
  deadline: ReactNode;
  industry?: string | null;
  /** 已格式化的预算；空值走 budgetPlaceholder */
  budget?: string | null;
  budgetPlaceholder: string;
  /** VIP 字段：只有解锁后才有值；为空则整行不渲染 */
  platform?: string | null;
}

const TH =
  "border-r border-slate-100 bg-slate-50/60 px-3 py-2 text-left font-normal text-slate-500";
const TH_LEFT = `${TH} w-[92px] sm:w-[110px]`;
const TH_MID = `${TH} border-l`;

/** 区块标题条（与详情页 SectionHeader 同形制，导出供公开页复用） */
export function NoticeSectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
      <span className="h-3.5 w-1 rounded-sm bg-teal-600" />
      <h2 className="text-sm font-extrabold text-slate-800">{title}</h2>
    </div>
  );
}

export function NoticeBasicInfoCard({
  labels,
  reference,
  buyer,
  country,
  noticeType,
  publishDate,
  deadline,
  industry,
  budget,
  budgetPlaceholder,
  platform,
}: NoticeBasicInfoCardProps) {
  const hasIndustry = !!industry;
  const hasBudget = !!budget;
  return (
    <section className="border border-slate-200 bg-white">
      <NoticeSectionHeader title={labels.title} />
      <table className="w-full border-collapse text-[13px]">
        <tbody>
          <tr className="border-b border-slate-100">
            <th scope="row" className={TH_LEFT}>
              {labels.reference}
            </th>
            <td className="px-3 py-2">{reference}</td>
            <th scope="row" className={TH_MID}>
              {labels.buyer}
            </th>
            <td className="px-3 py-2 font-bold text-slate-800">{buyer}</td>
          </tr>
          <tr className="border-b border-slate-100">
            <th scope="row" className={TH}>
              {labels.country}
            </th>
            <td className="px-3 py-2 text-slate-700">{country || "-"}</td>
            <th scope="row" className={TH_MID}>
              {labels.noticeType}
            </th>
            <td className="px-3 py-2 text-slate-700">{noticeType}</td>
          </tr>
          <tr className="border-b border-slate-100">
            <th scope="row" className={TH}>
              {labels.publishDate}
            </th>
            <td className="px-3 py-2 text-slate-700">{publishDate}</td>
            <th scope="row" className={TH_MID}>
              {labels.deadline}
            </th>
            <td className="px-3 py-2 font-bold text-rose-600">{deadline}</td>
          </tr>
          {(hasIndustry || hasBudget) && (
            <tr className="border-b border-slate-100">
              <th scope="row" className={TH}>
                {labels.industry}
              </th>
              <td className="px-3 py-2 text-slate-700">{industry ?? "—"}</td>
              <th scope="row" className={TH_MID}>
                {labels.budget}
              </th>
              <td className="px-3 py-2 font-bold text-teal-700">
                {hasBudget ? budget : budgetPlaceholder}
              </td>
            </tr>
          )}
          {platform ? (
            <tr className="border-t border-slate-100">
              <th scope="row" className={TH}>
                {labels.sourcePlatform}
              </th>
              <td colSpan={3} className="px-3 py-2 text-slate-700">
                {platform}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}
