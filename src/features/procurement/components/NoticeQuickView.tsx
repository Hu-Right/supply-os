/**
 * 本标概况速览表
 * Notice Quick View — Key Facts at a Glance
 *
 * @module features/procurement/components/NoticeQuickView
 * @description 展示项目编号、招标方式、评标方式、货币、保函要求、联合体接受等关键信息。
 *              数据来自 NoticeDetailItem 现有字段，预留扩展字段接口供后端补充。
 */
import { useLocale } from "@/core/i18n";
import type { NoticeDetailItem } from "../types";
import { getCountryDisplayName } from "@/shared/data/countryNames";

/** 速览表扩展字段（后端后续补充） */
export interface QuickViewExtraFields {
  project_number?: string;
  bidding_method?: string;
  evaluation_method?: string;
  currency?: string;
  needs_guarantee?: boolean;
  accepts_consortium?: boolean;
}

export interface NoticeQuickViewProps {
  notice: NoticeDetailItem;
  /** 后端补充的扩展字段 */
  extra?: QuickViewExtraFields;
}

/** 本标概况速览表 */
export function NoticeQuickView({ notice, extra }: NoticeQuickViewProps) {
  const { t, locale } = useLocale();

  const rows: Array<[string, string]> = [
    [
      t("procurement_quickViewProjectNo") || "项目编号",
      extra?.project_number || notice.reference || notice.notice_id || "-",
    ],
    [
      t("procurement_quickViewBiddingMethod") || "招标方式",
      extra?.bidding_method || notice.notice_type || "-",
    ],
    [
      t("procurement_quickViewEvaluationMethod") || "评标方式",
      extra?.evaluation_method || "-",
    ],
    [
      t("procurement_quickViewCurrency") || "货币",
      extra?.currency || "USD",
    ],
    [
      t("procurement_quickViewCountry") || "国家/地区",
      getCountryDisplayName(notice.country || "", locale) || "-",
    ],
    [
      t("procurement_quickViewDeadline") || "截止时间",
      notice.deadline || "-",
    ],
  ];

  // 扩展字段存在时追加
  if (extra?.needs_guarantee !== undefined) {
    rows.push([
      t("procurement_quickViewGuarantee") || "是否需要保函",
      extra.needs_guarantee ? "是" : "否",
    ]);
  }
  if (extra?.accepts_consortium !== undefined) {
    rows.push([
      t("procurement_quickViewConsortium") || "是否接受联合体",
      extra.accepts_consortium ? "是" : "否",
    ]);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-base font-extrabold text-slate-900 mb-4">
        {t("procurement_quickViewTitle") || "本标概况速览"}
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {rows.map(([label, value]) => (
          <div key={label} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
            <p className="text-2xs font-bold text-slate-400 uppercase mb-1">{label}</p>
            <p className="text-sm font-bold text-slate-800 break-words">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
