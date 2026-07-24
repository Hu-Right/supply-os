/**
 * 公告已解锁拓展详情
 * Notice unlocked extended details
 *
 * @module features/procurement/components/NoticeUnlockedDetails
 * @description 解锁后展示联系人、招标/采购文件、外部链接与补充元信息
 *              After unlock, shows contacts, tender/procurement files,
 *              external links and supplementary meta info.
 */

import { FileText, Link2, Mail, Phone, ShieldCheck, User } from "lucide-react";
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
  const keyContacts = (notice.key_contacts as RawContact[] | undefined) || [];
  const documents = (notice.documents as RawAttachment[] | undefined) || [];
  const procurementFiles = (notice.procurement_files as RawAttachment[] | undefined) || [];
  const externalLinks = (notice.external_links as RawAttachment[] | undefined) || [];

  const allContacts = [...keyContacts, ...contacts];

  const metaRows: Array<[string, string]> = [];
  if (notice.published_date) metaRows.push([t("procurement_publishedDate"), notice.published_date]);
  if (notice.difficulty) metaRows.push([t("procurement_difficulty"), notice.difficulty]);
  if (notice.registration_level)
    metaRows.push([t("procurement_registrationLevel"), notice.registration_level]);

  const hasContent =
    allContacts.length > 0 ||
    documents.length > 0 ||
    procurementFiles.length > 0 ||
    externalLinks.length > 0 ||
    metaRows.length > 0;

  if (!hasContent) return null;

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4 space-y-4">
      <h4 className="text-sm font-extrabold text-teal-800 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4" />
        {t("procurement_unlockedDetailsTitle")}
      </h4>

      {metaRows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {metaRows.map(([label, value]) => (
            <div key={label} className="bg-white border border-slate-100 rounded-lg p-3">
              <p className="font-black text-slate-400 uppercase">{label}</p>
              <p className="font-bold text-slate-800 mt-1 break-words">{value}</p>
            </div>
          ))}
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
                      <a href={`mailto:${email}`} className="text-blue-700 hover:underline">
                        {email}
                      </a>
                    </p>
                  )}
                  {phone && (
                    <p className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      {phone}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <AttachmentGroup
        title={t("procurement_documents")}
        items={documents}
        actionLabel={t("procurement_viewFile")}
      />
      <AttachmentGroup
        title={t("procurement_procurementFiles")}
        items={procurementFiles}
        actionLabel={t("procurement_viewFile")}
      />
      <AttachmentGroup
        title={t("procurement_externalLinks")}
        items={externalLinks}
        actionLabel={t("procurement_openLink")}
        icon="link"
      />
    </div>
  );
}

interface AttachmentGroupProps {
  title: string;
  items: RawAttachment[];
  actionLabel: string;
  icon?: "file" | "link";
}

function AttachmentGroup({ title, items, actionLabel, icon = "file" }: AttachmentGroupProps) {
  if (items.length === 0) return null;
  const Icon = icon === "link" ? Link2 : FileText;
  return (
    <div>
      <p className="text-xs font-black text-slate-500 uppercase mb-2">{title}</p>
      <ul className="space-y-1.5">
        {items.map((item, index) => {
          const url = attachmentUrl(item);
          const name = attachmentName(item);
          return (
            <li key={`${name}-${index}`} className="text-xs">
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 font-bold text-blue-700 hover:underline break-all"
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  {name}
                  <span className="text-slate-400 font-medium">({actionLabel})</span>
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-bold text-slate-600 break-all">
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  {name}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

NoticeUnlockedDetails.displayName = "NoticeUnlockedDetails";
