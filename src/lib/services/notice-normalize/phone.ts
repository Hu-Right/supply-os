/**
 * 联系方式归一化：从 contacts JSON / contact_phone / 正文里抽电话和邮箱。
 *
 * 电话用 libphonenumber-js 按国家转 E.164；无法确认的保留 raw 并标 valid=false。
 * 邮箱只做小写/去重/基本格式校验，不做猜测。
 */
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export interface NormalizedPhone {
  raw: string;
  e164: string | null;
  valid: boolean;
  country: string | null;
  source: "contacts" | "column" | "description";
}

export interface ContactEntry {
  name: string | null;
  email: string | null;
  phone: string | null;
  source: "contacts" | "column" | "description";
}

export interface NormalizedContacts {
  phones: NormalizedPhone[];
  emails: string[];
  entries: ContactEntry[];
}

const PHONE_LABEL = /(?:tel(?:efone|éfono)?|phone|fone|tél|m[óo]vil|whatsapp|contacto?|联系方式|电话)\s*[:：]?\s*/gi;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const INT_PHONE_RE = /\+\d{1,3}[\s().-]*\d[\d\s().-]{6,}\d/g;

export function normalizePhone(raw: unknown, countryCode?: string | null, source: NormalizedPhone["source"] = "contacts"): NormalizedPhone | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  let cleaned = text
    .replace(PHONE_LABEL, " ")
    .replace(/\b(?:ext|ext\.|extension|ramal|extensi[óo]n)\s*\d+\b/gi, " ")
    .replace(/[^\d+().\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  if (cleaned.startsWith("00")) cleaned = "+" + cleaned.slice(2);
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 18) {
    return { raw: text, e164: null, valid: false, country: null, source };
  }
  const candidates = [
    countryCode ? parsePhoneNumberFromString(cleaned, countryCode as CountryCode) : null,
    parsePhoneNumberFromString(cleaned),
    parsePhoneNumberFromString("+" + digits),
  ].filter(Boolean);
  for (const p of candidates) {
    if (p?.isValid()) {
      return { raw: text, e164: p.number, valid: true, country: p.country ?? countryCode ?? null, source };
    }
  }
  return { raw: text, e164: null, valid: false, country: null, source };
}

export function normalizeContacts(rawContacts: unknown, extra: { contactPhone?: unknown; contactEmail?: unknown; description?: unknown; countryCode?: string | null } = {}): NormalizedContacts {
  const phones: NormalizedPhone[] = [];
  const emails: string[] = [];
  const entries: ContactEntry[] = [];
  const seenPhone = new Set<string>();
  const seenEmail = new Set<string>();
  const seenEntry = new Set<string>();

  const cleanEmail = (e: unknown): string | null => {
    const s = String(e ?? "").trim().toLowerCase();
    return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(s) ? s : null;
  };
  const addPhone = (p: NormalizedPhone | null): NormalizedPhone | null => {
    if (!p) return null;
    const key = p.e164 ?? p.raw.toLowerCase().replace(/\s+/g, "");
    if (seenPhone.has(key)) return p;
    seenPhone.add(key);
    phones.push(p);
    return p;
  };
  const addEmail = (e: unknown): string | null => {
    const s = cleanEmail(e);
    if (!s) return null;
    if (!seenEmail.has(s)) {
      seenEmail.add(s);
      emails.push(s);
    }
    return s;
  };
  const addEntry = (e: ContactEntry) => {
    if (!e.email && !e.phone) return;
    const key = `${e.email ?? ""}|${e.phone ?? ""}|${e.name ?? ""}`.toLowerCase();
    if (seenEntry.has(key)) return;
    seenEntry.add(key);
    entries.push(e);
  };

  let arr: unknown[] = [];
  if (Array.isArray(rawContacts)) arr = rawContacts;
  else if (typeof rawContacts === "string") { try { const x = JSON.parse(rawContacts); if (Array.isArray(x)) arr = x; } catch { /* ignore */ } }
  for (const c of arr) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    const name = String(o.name ?? [o.firstName, o.lastName].filter(Boolean).join(" ") ?? "").trim() || null;
    const email = addEmail(o.email);
    const rawPhone = o.phone ?? o.telephone ?? o.tel ?? o.mobile ?? o.phone_number ?? o.phoneNumber;
    const phone = rawPhone ? addPhone(normalizePhone(rawPhone, extra.countryCode, "contacts")) : null;
    addEntry({ name, email, phone: phone?.e164 ?? (phone?.raw ?? null), source: "contacts" });
  }
  const columnPhone = addPhone(normalizePhone(extra.contactPhone, extra.countryCode, "column"));
  const columnEmail = addEmail(extra.contactEmail);
  addEntry({ name: null, email: columnEmail, phone: columnPhone?.e164 ?? (columnPhone?.raw ?? null), source: "column" });

  const desc = String(extra.description ?? "");
  for (const m of desc.matchAll(EMAIL_RE)) {
    const e = addEmail(m[0]);
    addEntry({ name: null, email: e, phone: null, source: "description" });
  }
  for (const m of desc.matchAll(INT_PHONE_RE)) {
    const p = addPhone(normalizePhone(m[0], extra.countryCode, "description"));
    addEntry({ name: null, email: null, phone: p?.e164 ?? (p?.raw ?? null), source: "description" });
  }
  return { phones, emails, entries };
}
