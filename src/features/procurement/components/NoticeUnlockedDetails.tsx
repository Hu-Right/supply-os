/**
 * 公告已解锁拓展详情
 * Notice unlocked extended details
 *
 * @module features/procurement/components/NoticeUnlockedDetails
 * @description 解锁后展示采购方/机构信息与联系人；投标材料（中文拆解报告、原始文件）
 *              不再在这里重复列附件——原始文件统一收敛到「原始文件」Tab，这里只给一条
 *              跳转链接；报告缺失时引导人工服务包（不再用旧档位"VIP"说法）。
 *
 *              2026-10-29 权益大一统：资格条件/原始文件已成为独立权益与独立 Tab，
 *              本区块只保留「概况」Tab 独有的采购方信息与联系人，避免同一批附件两处入口。
 */

import { Download, FileText, Mail, Phone, ShieldCheck, User } from "lucide-react";
import type { ReactNode } from "react";
import { useOptionalAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import type { NoticeAttachment, NoticeContact, NoticeItem } from "../types";
import { downloadNoticeReport } from "../api";
import { ReportUnavailableBanner } from "./ReportUnavailableBanner";
import { getCountryDisplayName } from "@/shared/data/countryNames";

type RawAttachment = NoticeAttachment | string;
type RawContact = NoticeContact | string;

function attachmentUrl(item: RawAttachment): string | undefined {
  if (typeof item === "string") return item;
  return item.url || item.link || undefined;
}

function attachmentName(item: RawAttachment): string {
  if (typeof item === "string") return item;
  return item.name || item.title || item.label || item.url || item.link || "-";
}

/**
 * 拆解文件清单：原版口径 documents + procurement_files 合并（服务端已归一为 documents
 * 单一事实源，procurement_files 仅兼容旧缓存 payload），按 url|name 去重。
 * 导出供详情页拆解文件指示器共用同一判断口径。
 */
export function collectBreakdownFiles(notice: NoticeItem): RawAttachment[] {
  const documents = (notice.attachments as RawAttachment[] | undefined) || [];

  const seenFiles = new Set<string>();
  return [...documents].filter((item) => {
    if (!attachmentUrl(item) && attachmentName(item) === "-") return false;
    const key = `${attachmentUrl(item) || ""}|${attachmentName(item)}`.toLowerCase();
    if (seenFiles.has(key)) return false;
    seenFiles.add(key);
    return true;
  });
}

/** 联系人字段归一：name 缺失时不再渲染 "-"，由邮箱/电话兜底为展示行 */
function contactFields(item: RawContact) {
  if (typeof item === "string") {
    return { name: "", role: "", email: "", phone: "", raw: item.trim() };
  }
  return {
    name: (item.name || item.organization || "").trim(),
    role: (item.role || item.title || "").trim(),
    email: (item.email || "").trim(),
    phone: (item.phone || "").trim(),
    raw: "",
  };
}

interface NoticeUnlockedDetailsProps {
  notice: NoticeItem;
  /** 跳到「原始文件」Tab（原始文件统一在该 Tab 提供，避免本区块重复列附件） */
  onViewFiles?: () => void;
}

export function NoticeUnlockedDetails({ notice, onViewFiles }: NoticeUnlockedDetailsProps) {
  const { t, locale } = useLocale();
  const authContext = useOptionalAuth();
  const authUser = authContext?.authUser ?? null;
  const isVip = authContext?.isVip ?? false;

  const rawContacts = (notice.contacts as RawContact[] | undefined) || [];
  const externalLinks = (notice.externalLinks as RawAttachment[] | undefined) || [];

  // 联系人去重（邮箱/电话/姓名任一相同即视为同一人），并剔除完全空的行
  const seenContacts = new Set<string>();
  const contacts = rawContacts
    .map(contactFields)
    .filter((c) => {
      const key = (c.email || c.phone || c.name || c.raw).toLowerCase();
      if (!key || seenContacts.has(key)) return false;
      seenContacts.add(key);
      return true;
    });

  // 原始文件数量：与「原始文件」Tab 同一口径（documents + externalLinks 去重）
  const originalFiles = [...collectBreakdownFiles(notice), ...externalLinks];
  const originalFileCount = new Set(
    originalFiles.map((item) => `${attachmentUrl(item) || ""}|${attachmentName(item)}`.toLowerCase()),
  ).size;

  // 中文版订单拆解报告下载：需后端 report_available + 登录态
  // （端点自身仍校验解锁记录，此处仅决定是否展示下载项）
  // B1 配套：下载改为带 JWT 的 Blob 拉取（原 <a> 链接无法携带 Authorization 头）
  const canDownloadReport = Boolean(notice.reportAvailable && notice.reportUrl && authUser);

  const handleDownloadReport = () => {
    if (!notice.reportUrl) return;
    void downloadNoticeReport(notice.reportUrl).catch((e) => {
      console.warn("[NoticeDetails] 报告下载失败:", e);
    });
  };

  // 采购方/机构信息：完整机构名优先，逐级回退
  const agencyInfo = notice.agencyI18n || notice.buyerName || "";

  const hasContent =
    contacts.length > 0 ||
    originalFileCount > 0 ||
    !!agencyInfo ||
    !!notice.publishedTs ||
    !!notice.sourceUrl;

  if (!hasContent) return null;

  // 机构信息卡四行（原版布局），缺失值以 "-" 兖底
  const agencyRows: Array<[string, ReactNode]> = [
    [t("procurement_agencyFullName"), agencyInfo || "-"],
    [t("procurement_country"), getCountryDisplayName(notice.countryCode || "", locale) || "-"],
    [t("procurement_publishedDate"), (notice.publishedTs ? new Date(Number(notice.publishedTs) * 1000).toISOString().slice(0, 10) : "-")],
    [
      t("procurement_originalLink"),
      notice.sourceUrl ? (
        <a
          href={notice.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="font-black text-blue-700 hover:text-blue-900 hover:underline"
        >
          {t("procurement_openNotice")}
        </a>
      ) : (
        "-"
      ),
    ],
  ];

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4 space-y-4">
      <h4 className="text-sm font-extrabold text-teal-800 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4" />
        {t("procurement_unlockedDetailsTitle")}
      </h4>

      <div className="rounded-lg border border-teal-100 bg-white p-3 text-xs">
        <p className="font-black text-slate-900 mb-2">{t("procurement_buyerInfo")}</p>
        <div className="space-y-1.5 text-slate-600 leading-5">
          {agencyRows.map(([label, value]) => (
            <p key={label} dir="auto" className="break-words">
              <span className="font-bold text-slate-500">{label}：</span>
              {value}
            </p>
          ))}
        </div>
      </div>

      {contacts.length > 0 && (
        <div>
          <p className="text-xs font-black text-slate-500 uppercase mb-2">{t("procurement_contacts")}</p>
          <ul className="space-y-2">
            {contacts.map((contact, index) => {
              // 姓名缺失时用邮箱/电话兜底为主行，绝不渲染 "👤 -"
              const displayName = contact.name || contact.email || contact.phone || contact.raw;
              return (
                <li
                  key={`${displayName}-${index}`}
                  className="bg-white border border-slate-100 rounded-lg p-3 text-xs text-slate-700 space-y-1"
                >
                  <p className="font-bold text-slate-900 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span dir="auto" className="break-words">{displayName}</span>
                    {contact.role && <span className="font-medium text-slate-500">· {contact.role}</span>}
                  </p>
                  {contact.email && contact.email !== displayName && (
                    <p className="flex items-center gap-1.5 break-all">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <a href={`mailto:${contact.email}`} dir="ltr" className="text-blue-700 hover:underline">
                        {contact.email}
                      </a>
                    </p>
                  )}
                  {contact.phone && contact.phone !== displayName && (
                    <p className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span dir="ltr">{contact.phone}</span>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-teal-100 bg-white p-3 text-xs space-y-2">
        <p className="font-black text-slate-900">{t("procurement_breakdownModuleTitle")}</p>
        {canDownloadReport ? (
          <Button
            type="button"
            variant="outline"
            onClick={handleDownloadReport}
            className="w-full justify-between gap-3 rounded-md border-teal-200 bg-teal-50 px-3 py-2 hover:border-teal-400 hover:bg-teal-50"
          >
            <span dir="auto" className="font-black text-teal-800 truncate">
              {t("procurement_reportFileLabel")}
            </span>
            <Download className="w-4 h-4 shrink-0 text-teal-700" />
          </Button>
        ) : !notice.reportAvailable && notice.noticePk != null ? (
          // 确认无报告：只展示一次「暂无报告 + 人工服务包」引导（不再重复"整理中"文案）
          <ReportUnavailableBanner
            noticeId={notice.noticePk}
            isVip={isVip}
            isLoggedIn={!!authUser}
          />
        ) : (
          <p className="text-slate-400">{t("procurement_reportPending")}</p>
        )}

        {/* 原始文件统一收敛到「原始文件」Tab（权益：original_file_access），这里只给一条跳转 */}
        {originalFileCount > 0 && (
          onViewFiles ? (
            <button
              type="button"
              onClick={onViewFiles}
              className="flex w-full items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-left hover:border-blue-200"
            >
              <span dir="auto" className="flex items-center gap-1.5 font-bold text-slate-700 truncate">
                <FileText className="w-4 h-4 shrink-0 text-blue-600" />
                {t("procurement_originalFilesLink", { count: originalFileCount })}
              </span>
              <Download className="w-4 h-4 shrink-0 text-blue-600" />
            </button>
          ) : (
            <span className="flex w-full items-center gap-1.5 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 font-bold text-slate-700">
              <FileText className="w-4 h-4 shrink-0 text-blue-600" />
              {t("procurement_originalFilesLink", { count: originalFileCount })}
            </span>
          )
        )}
      </div>
    </div>
  );
}

NoticeUnlockedDetails.displayName = "NoticeUnlockedDetails";
