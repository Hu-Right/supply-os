/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import path from "path";
import { safeJson } from "./json";

export function normalizeContactRows(...sources: unknown[]) {
  const rows: Array<{ name: string; title: string; email: string; phone: string }> = [];
  const seen = new Set<string>();
  const add = (contact: unknown) => {
    if (!contact || typeof contact !== "object") return;
    const c = contact as Record<string, unknown>;
    const email = String(c.email || c.mail || "").trim();
    const phone = String(c.phone || c.tel || c.telephone || "").trim();
    const name = String(c.name || c.person || c.contact || [c.firstName, c.lastName].filter(Boolean).join(" ")).trim();
    const title = String(c.title || c.role || "").trim();
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

export function normalizeDocumentRows(...sources: unknown[]): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  const add = (doc: unknown) => {
    if (!doc || typeof doc !== "object") return;
    const d = doc as Record<string, unknown>;
    const url = String(d.url || d.href || d.link || d.downloadUrl || "").trim();
    const name = String(d.name || d.title || d.fileName || d.filename || "").trim() || (url ? path.basename(url.split("?")[0]) : "");
    const key = `${url.toLowerCase()}|${name.toLowerCase()}`;
    if (key === "|" || seen.has(key)) return;
    seen.add(key);
    rows.push({ ...d, url, name });
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
 * 转义 SQL LIKE 通配符（\、% 和 _），防止用户输入中的通配符导致意外匹配
 * L-BIZ-1 修复：用于构建 LIKE 模式时先转义用户输入中的特殊字符
 * F55 修复：必须先转义转义符 \，否则输入 "\_" 会展开成 "\\_"，MySQL 把
 * "\\" 解析为字面反斜杠后，后面的 "_" 仍是未转义的单字符通配符
 * @example escapeLikeWildcard("100%") // → "100\\%"
 */
export function escapeLikeWildcard(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
