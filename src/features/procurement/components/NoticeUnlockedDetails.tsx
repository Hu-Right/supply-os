/**
 * 公告已解锁拓展详情
 * Notice unlocked extended details
 *
 * @module features/procurement/components/NoticeUnlockedDetails
 * @description 解锁后展示采购方/机构信息卡（机构全称/国家地区/发布日期/原始链接）、
 *              联系人、采购文件/拆解材料模块（文件+外链合并清单，空态提示）与投标拆解建议。
 *              After unlock, shows the buyer/agency info card (full name, country,
 *              published date, original link), contacts, the procurement files /
 *              breakdown materials module (merged file+link list with empty state)
 *              and bid breakdown suggestions.
 */

import { ExternalLink, ListChecks, Mail, Phone, ShieldCheck, User } from "lucide-react";
import type { ReactNode } from "react";
import { useLocale } from "@/core/i18n";
import type { NoticeAttachment, NoticeContact, NoticeItem } from "../types";

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

function contactName(item: RawContact): string {
  if (typeof item === "string") return item;
  return item.name || item.organization || "-";
}

interface NoticeUnlockedDetailsProps {
  notice: NoticeItem;
}

export function NoticeUnlockedDetails({ notice }: NoticeUnlockedDetailsProps) {
  const { t } = useLocale();

  const contacts = (notice.contacts as RawContact[] | undefined) || [];
  // key_contacts 兼容字符串（整体文本）与对象数组两种形态
  const rawKeyContacts = notice.key_contacts;
  const keyContactsText = typeof rawKeyContacts === "string" ? rawKeyContacts : "";
  const keyContacts: RawContact[] =
    typeof rawKeyContacts === "string" ? [] : (rawKeyContacts as RawContact[] | undefined) || [];
  const documents = (notice.documents as RawAttachment[] | undefined) || [];
  const procurementFiles = (notice.procurement_files as RawAttachment[] | undefined) || [];
  const externalLinks = (notice.external_links as RawAttachment[] | undefined) || [];

  const allContacts = [...keyContacts, ...contacts];

  // 采购文件清单：原版口径 documents + procurement_files 合并（服务端已归一为 documents
  // 单一事实源，procurement_files 仅兼容旧缓存 payload），按 url|name 去重防重复渲染
  const seenFiles = new Set<string>();
  const files = [...documents, ...procurementFiles].filter((item) => {
    if (!attachmentUrl(item) && attachmentName(item) === "-") return false;
    const key = `${attachmentUrl(item) || ""}|${attachmentName(item)}`.toLowerCase();
    if (seenFiles.has(key)) return false;
    seenFiles.add(key);
    return true;
  });

  // 采购方/机构信息：完整机构名优先，逐级回退
  const agencyInfo = notice.agency_full || notice.agency || notice.organization || "";

  const hasContent =
    allContacts.length > 0 ||
    files.length > 0 ||
    externalLinks.length > 0 ||
    !!agencyInfo ||
    !!notice.published_date ||
    !!keyContactsText ||
    !!notice.url;

  if (!hasContent) return null;

  // 机构信息卡四行（原版布局），缺失值以 "-" 兜底
  const agencyRows: Array<[string, ReactNode]> = [
    [t("procurement_agencyFullName"), agencyInfo || "-"],
    [t("procurement_country"), notice.country || "-"],
    [t("procurement_publishedDate"), notice.published_date || "-"],
    [
      t("procurement_originalLink"),
      notice.url ? (
        <a
          href={notice.url}
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

  const bidDifficulty = notice.difficulty || t("procurement_bidPendingEval");
  const bidRegistration = notice.registration_level || t("procurement_bidPendingConfirm");
  const bidBudget = notice.estimated_value || t("procurement_bidUndisclosed");
  const bidDeadline = notice.deadline || t("procurement_noDeadline");
  const bidCodes =
    (notice.unspsc_codes || [])
      .map((code) => code.code)
      .filter(Boolean)
      .slice(0, 4)
      .join(", ") || t("procurement_bidPendingSupplement");

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

      {keyContactsText && (
        <div>
          <p className="text-xs font-black text-slate-500 uppercase mb-2">{t("procurement_keyContacts")}</p>
          <p className="bg-white border border-slate-100 rounded-lg p-3 text-xs text-slate-700 leading-6 whitespace-pre-line break-words">
            {keyContactsText}
          </p>
        </div>
      )}

      {allContacts.length > 0 && (
        <div>
          <p className="text-xs font-black text-slate-500 uppercase mb-2">{t("procurement_contacts")}</p>
          <ul className="space-y-2">
            {allContacts.map((contact, index) => {
              const email = typeof contact === "string" ? undefined : contact.email;
              const phone = typeof contact === "string" ? undefined : contact.phone;
              const role =
                typeof contact === "string" ? undefined : contact.role || contact.title;
              return (
                <li
                  key={`${contactName(contact)}-${index}`}
                  className="bg-white border border-slate-100 rounded-lg p-3 text-xs text-slate-700 space-y-1"
                >
                  <p className="font-bold text-slate-900 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    {contactName(contact)}
                    {role && <span className="font-medium text-slate-500">· {role}</span>}
                  </p>
                  {email && (
                    <p className="flex items-center gap-1.5 break-all">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <a href={`mailto:${email}`} dir="ltr" className="text-blue-700 hover:underline">
                        {email}
                      </a>
                    </p>
                  )}
                  {phone && (
                    <p className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span dir="ltr">{phone}</span>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-teal-100 bg-white p-3 text-xs">
        <p className="font-black text-slate-900 mb-2">{t("procurement_breakdownModuleTitle")}</p>
        <div className="space-y-2">
          {files.length === 0 && <p className="text-slate-400">{t("procurement_noFiles")}</p>}
          {[...files, ...externalLinks].map((item, index) => {
            const url = attachmentUrl(item);
            const name = attachmentName(item);
            const row = (
              <>
                <span dir="auto" className="font-bold text-slate-700 truncate">
                  {name}
                </span>
                <ExternalLink className="w-4 h-4 shrink-0 text-blue-600" />
              </>
            );
            return url ? (
              <a
                key={`${name}-${index}`}
                className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 hover:border-blue-200"
                href={url}
                target="_blank"
                rel="noreferrer"
              >
                {row}
              </a>
            ) : (
              <span
                key={`${name}-${index}`}
                className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
              >
                {row}
              </span>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-teal-100 bg-white p-3 text-xs">
        <p className="font-black text-slate-900 mb-2 flex items-center gap-1.5">
          <ListChecks className="w-3.5 h-3.5 text-teal-600" />
          {t("procurement_bidBreakdownTitle")}
        </p>
        <ul className="list-disc ps-4 space-y-1.5 leading-6 text-slate-600">
          <li>
            {t("procurement_bidUrgency")}：{bidDifficulty}；{t("procurement_bidRegBar")}：{bidRegistration}。
          </li>
          <li>
            {t("procurement_bidBudgetRef")}：{bidBudget}；{t("procurement_bidDeadline")}：{bidDeadline}。
          </li>
          <li>
            {t("procurement_bidCodes")}：<span dir="ltr">{bidCodes}</span>。
          </li>
          <li>{t("procurement_bidNextStep")}</li>
        </ul>
      </div>
    </div>
  );
}

NoticeUnlockedDetails.displayName = "NoticeUnlockedDetails";
