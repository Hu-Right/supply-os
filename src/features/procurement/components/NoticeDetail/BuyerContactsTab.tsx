/**
 * 联系人 Tab
 * Contacts Tab
 *
 * @module features/procurement/components/NoticeDetail/BuyerContactsTab
 * @description 详情页「联系人」Tab（2026-10-29 信息架构拆分）：
 *              只负责展示联系人（姓名/角色/邮箱/电话），属会员权益（notice_view）；
 *              采购方机构信息已在头部信息表与公开详情页展示，不在本 Tab 重复。
 *              联系人姓名为空时用邮箱/电话兜底（不再出现「👤 -」），同邮箱去重。
 */
import { Mail, Phone, User } from "lucide-react";
import { useLocale } from "@/core/i18n";
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
  /** 联系人信息是否已解锁（会员打开即自动解锁） */
  coreUnlocked: boolean;
}

export function BuyerContactsTab({ notice, coreUnlocked }: BuyerContactsTabProps) {
  const { t } = useLocale();

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

  // ── 未解锁：联系人属会员权益，展示升级引导 ──
  if (!coreUnlocked) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
        <h3 className="text-sm font-extrabold text-amber-800 flex items-center gap-2 mb-3">
          <User className="w-4 h-4 text-amber-600" />
          {t("detail_tabBuyer") || "联系人"} — {t("detail_memberExclusive") || "会员专享"}
        </h3>
        <p className="text-xs text-amber-700">
          {t("detail_buyerLockedIntro") || "联系人信息为会员权益，升级会员后可查看。"}
        </p>
      </section>
    );
  }

  // ── 已解锁：联系人列表（姓名缺失 → 邮箱/电话兜底）──
  return (
    <section className="space-y-4">
      <h3 className="text-base font-extrabold text-slate-900">{t("detail_tabBuyer") || "联系人"}</h3>

      {contacts.length > 0 ? (
        <ul className="space-y-2">
          {contacts.map((contact, index) => {
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
      ) : (
        <p className="text-xs text-slate-400">{t("procurement_noContacts") || "该公告暂未提供联系人信息"}</p>
      )}
    </section>
  );
}
