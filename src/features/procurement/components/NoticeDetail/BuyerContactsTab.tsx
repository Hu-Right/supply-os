/**
 * 采购方与联系人 Tab
 * Buyer & Contacts Tab
 *
 * @module features/procurement/components/NoticeDetail/BuyerContactsTab
 * @description 详情页第 3 个 Tab（2026-10-29 信息架构拆分）：只负责「谁在采购、怎么联系」——
 *              机构全称/国家/发布日期/原始链接 + 联系人列表。
 *              联系人姓名为空时用邮箱/电话兜底（不再出现「👤 -」），同邮箱去重。
 *              未解锁（免费/匿名）时展示会员专属引导。
 */
import { ExternalLink, Mail, Phone, ShieldCheck, User } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { getCountryDisplayName } from "@/shared/data/countryNames";
import type { NoticeContact, NoticeItem } from "../../types";

type RawContact = NoticeContact | string;

/** 联系人字段归一：name 缺失时用邮箱/电话兜底为展示行 */
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

export interface BuyerContactsTabProps {
  notice: NoticeItem;
  /** 核心信息是否已解锁（会员打开即自动解锁） */
  coreUnlocked: boolean;
}

export function BuyerContactsTab({ notice, coreUnlocked }: BuyerContactsTabProps) {
  const { t, locale } = useLocale();

  // ── 未解锁：会员专属引导（与其它 Tab 的锁定态同口径）──
  if (!coreUnlocked) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
        <h3 className="text-sm font-extrabold text-amber-800 flex items-center gap-2 mb-3">
          <User className="w-4 h-4 text-amber-600" />
          {t("detail_tabBuyer") || "采购方与联系人"} — {t("detail_memberExclusive") || "会员专享"}
        </h3>
        <p className="text-xs text-amber-700 mb-3">
          {t("detail_buyerLockedIntro") || "会员可查看采购方、联系方式与原始链接。"}
        </p>
        <ul className="space-y-1.5 text-xs text-amber-700">
          <li className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            {t("procurement_agencyFullName") || "机构全称"}
          </li>
          <li className="flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            {t("procurement_contacts") || "联系人"}
          </li>
          <li className="flex items-center gap-2">
            <ExternalLink className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            {t("procurement_originalLink") || "原始链接"}
          </li>
        </ul>
      </section>
    );
  }

  // ── 已解锁：机构信息 + 联系人 ──
  const agencyInfo = notice.agencyI18n || notice.buyerName || "";
  const publishedDate = notice.publishedTs
    ? new Date(Number(notice.publishedTs) * 1000).toISOString().slice(0, 10)
    : "-";
  const agencyRows: Array<[string, string]> = [
    [t("procurement_agencyFullName"), agencyInfo || "-"],
    [t("procurement_country"), getCountryDisplayName(notice.countryCode || "", locale) || "-"],
    [t("procurement_publishedDate"), publishedDate],
  ];

  const rawContacts = (notice.contacts as RawContact[] | undefined) || [];
  const seen = new Set<string>();
  const contacts = rawContacts
    .map(contactFields)
    .filter((c) => {
      const key = (c.email || c.phone || c.name || c.raw).toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return (
    <section className="space-y-4">
      <h3 className="text-base font-extrabold text-slate-900">{t("detail_tabBuyer") || "采购方与联系人"}</h3>

      <div className="rounded-2xl border border-teal-100 bg-white p-4 text-xs">
        <p className="font-black text-slate-900 mb-2">{t("procurement_buyerInfo") || "采购方/机构信息"}</p>
        <div className="space-y-1.5 text-slate-600 leading-5">
          {agencyRows.map(([label, value]) => (
            <p key={label} dir="auto" className="break-words">
              <span className="font-bold text-slate-500">{label}：</span>
              {value}
            </p>
          ))}
          <p className="break-words">
            <span className="font-bold text-slate-500">{t("procurement_originalLink")}：</span>
            {notice.sourceUrl ? (
              <a
                href={notice.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="font-black text-blue-700 hover:text-blue-900 hover:underline"
              >
                {t("procurement_openNotice") || "打开公告"}
              </a>
            ) : (
              "-"
            )}
          </p>
        </div>
      </div>

      {contacts.length > 0 ? (
        <div>
          <p className="text-xs font-black text-slate-500 uppercase mb-2">{t("procurement_contacts") || "联系人"}</p>
          <ul className="space-y-2">
            {contacts.map((contact, index) => {
              // 姓名缺失时用邮箱/电话兜底为主行，绝不渲染「👤 -」
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
      ) : (
        <p className="text-xs text-slate-400">{t("procurement_noContacts") || "该公告暂未提供联系人信息"}</p>
      )}
    </section>
  );
}
