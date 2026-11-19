/**
 * 公告分享卡（OG 图）取数与视图模型
 * @module lib/services/seo/notice-og-data
 *
 * @description 只读 notice_public 公开字段；摘要优先用构建期生成的
 *              share_summary / share_summary_en，为空时用 buildShareSummary 现场回退。
 *              卡片不展示联系人/附件/正文全文（与 SEO 页同一公开口径）。
 */
import type { RowDataPacket } from "mysql2/promise";
import { getContext } from "@/lib/db/context";
import { buildShareSummary } from "@/lib/services/notice-public/share-summary";
import { countryName } from "@/shared/constants/countries";
import { CODE_TO_LOCALE_KEY, noticeTypeCodeLabel } from "@/shared/utils/notice-type";
import type { NoticeTypeStdCode } from "@/shared/constants/notice-type";
import {
  formatNoticeCstDate,
  formatNoticeUTCDate,
  resolveNoticeDeadlineTs,
} from "@/shared/utils/notice-datetime/format";
import zhProcurement from "@/core/i18n/locales/zh/procurement.json";
import enProcurement from "@/core/i18n/locales/en/procurement.json";

export type OgLocale = "zh" | "en";

export interface NoticeShareCard {
  id: number;
  title: string;
  summary: string | null;
  typeLabel: string;
  countryLabel: string;
  countryCode: string | null;
  buyerLabel: string;
  deadlineLabel: string | null;
  /** 截止时间是否为北京时间（false=源站墙上时间、时区未知，卡片不标时区） */
  deadlineIsCst: boolean;
}

/** 采购类型：std 码 → 对应语言的既有标签（与站内徽标同源） */
function typeLabel(raw: string | null, locale: OgLocale): string {
  const code = noticeTypeCodeLabel(raw ?? "");
  if (!code) return "";
  const key = CODE_TO_LOCALE_KEY[code as NoticeTypeStdCode];
  const dict = (locale === "zh" ? zhProcurement : enProcurement) as Record<string, string>;
  return (key ? dict[key] : "") || code;
}

/** 截止时间：与 SEO 页同口径（assumed_utc 的墙上时间不倒时区） */
function deadlineOf(row: RowDataPacket): { label: string | null; isCst: boolean } {
  const ts = resolveNoticeDeadlineTs({
    state: row.deadline_state == null ? null : String(row.deadline_state),
    effectiveTs: row.deadline_ts == null ? null : Number(row.deadline_ts),
    fallbackSec: row.deadline_ts == null ? null : Number(row.deadline_ts),
  });
  if (!ts) return { label: null, isCst: false };
  const d = new Date(ts * 1000);
  const hasTime = d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;
  const wallTime =
    String(row.timezone_source ?? "").trim() === "assumed_utc" && !row.deadline_timezone;
  const text = wallTime ? formatNoticeUTCDate(ts, hasTime) : formatNoticeCstDate(ts, hasTime);
  return { label: text && text !== "未公布" ? text : null, isCst: !wallTime };
}

export async function loadNoticeShareCard(
  noticePk: number,
  locale: OgLocale,
): Promise<NoticeShareCard | null> {
  if (!Number.isFinite(noticePk) || noticePk <= 0) return null;
  const row = await getContext().notice.detailRepo.findShareCardFromPublic(noticePk);
  if (!row) return null;

  const titleRaw = String(row.title ?? "").trim();
  const titleCn = String(row.title_cn ?? "").trim();
  const title = (locale === "zh" ? titleCn || titleRaw : titleRaw) || `#${noticePk}`;

  const fallback = buildShareSummary({
    description: row.description == null ? null : String(row.description),
    descriptionCn: row.description_cn == null ? null : String(row.description_cn),
  });
  const stored = String((locale === "zh" ? row.share_summary : row.share_summary_en) ?? "").trim();
  const summary = stored || (locale === "zh" ? fallback.zh : fallback.en);

  const buyerName = String(row.buyer_name ?? "").trim();
  const buyerNameCn = String(row.buyer_name_cn ?? "").trim();
  const buyer = locale === "zh" ? buyerNameCn || buyerName : buyerName;

  const countryCode = row.country_code == null ? null : String(row.country_code);
  const country = countryCode ? countryName(countryCode, locale) || countryCode : "";

  const deadline = deadlineOf(row);
  return {
    id: Number(row.id ?? noticePk),
    title,
    summary,
    typeLabel: typeLabel(row.notice_type == null ? null : String(row.notice_type), locale),
    countryLabel: country,
    countryCode,
    buyerLabel: buyer,
    deadlineLabel: deadline.label,
    deadlineIsCst: deadline.isCst,
  };
}
