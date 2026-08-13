/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import path from "path";
import { safeJson } from "./json";

export function normalizeContactRows(...sources: any[]) {
  const rows: Array<{ name: string; title: string; email: string; phone: string }> = [];
  const seen = new Set<string>();
  const add = (contact: any) => {
    if (!contact || typeof contact !== "object") return;
    const email = String(contact.email || contact.mail || "").trim();
    const phone = String(contact.phone || contact.tel || contact.telephone || "").trim();
    const name = String(contact.name || contact.person || contact.contact || [contact.firstName, contact.lastName].filter(Boolean).join(" ")).trim();
    const title = String(contact.title || contact.role || "").trim();
    const key = `${email.toLowerCase()}|${phone}|${name.toLowerCase()}`;
    if (key === "||" || seen.has(key)) return;
    seen.add(key);
    rows.push({ name, title, email, phone });
  };

  for (const source of sources) {
    const list = Array.isArray(source) ? source : safeJson(source);
    if (Array.isArray(list)) list.forEach(add);
  }
  return rows;
}

export function extractContactsFromText(text: string) {
  const emails = text.match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi) || [];
  const phones = text.match(/(?:\+?\d[\d\s().\-]{7,}\d)/g) || [];
  const count = Math.max(emails.length, phones.length);
  return Array.from({ length: count }).map((_, index) => ({
    name: "",
    title: "",
    email: emails[index] || "",
    phone: phones[index] || "",
  }));
}

export function normalizeDocumentRows(...sources: any[]) {
  const rows: any[] = [];
  const seen = new Set<string>();
  const add = (doc: any) => {
    if (!doc || typeof doc !== "object") return;
    const url = String(doc.url || doc.href || doc.link || doc.downloadUrl || "").trim();
    const name = String(doc.name || doc.title || doc.fileName || doc.filename || "").trim() || (url ? path.basename(url.split("?")[0]) : "");
    const key = `${url.toLowerCase()}|${name.toLowerCase()}`;
    if (key === "|" || seen.has(key)) return;
    seen.add(key);
    rows.push({ ...doc, url, name });
  };

  for (const source of sources) {
    const list = Array.isArray(source) ? source : safeJson(source);
    if (Array.isArray(list)) list.forEach(add);
  }
  return rows;
}

export function normalizeUserKey(raw: unknown): string | null {
  const key = String(raw || "").trim().toLowerCase().slice(0, 190);
  if (!key || key === "guest") return null;
  return key;
}

/**
 * 转义 SQL LIKE 通配符（% 和 _），防止用户输入中的通配符导致意外匹配
 * L-BIZ-1 修复：用于构建 LIKE 模式时先转义用户输入中的特殊字符
 * @example escapeLikeWildcard("100%") // → "100\\%"
 */
export function escapeLikeWildcard(value: string): string {
  return value.replace(/%/g, "\\%").replace(/_/g, "\\_");
}
