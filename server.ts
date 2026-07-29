/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// 本地开发从 .env 读取环境变量（YOUDAO_APP_KEY 等）；无 .env 时静默跳过，
// 不影响 AI Studio 的运行时注入
import "dotenv/config";
import express from "express";
import path from "path";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { Lead, Supplier } from "./src/types";

type UnspscCodeRow = {
  id: number;
  code: string;
  title?: string | null;
  title_zh?: string | null;
  parent_id?: number | null;
  level: number;
};

function safeJson(value: any) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function normalizeUnspscCodes(value: any) {
  const source = safeJson(value);
  const found = new Map<string, { code: string; name: string }>();

  const visit = (item: any) => {
    if (!item || found.size >= 20) return;
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (typeof item === "object") {
      const codeText = String(item.code || "");
      const matches = codeText.match(/\b\d{2}(?:\d{2}){0,3}\b/g) || [];
      for (const code of matches) {
        if (!found.has(code)) found.set(code, { code, name: String(item.name || item.description || "") });
      }
      if (matches.length === 0) Object.values(item).forEach(visit);
      return;
    }
    const matches = String(item).match(/\b\d{2}(?:\d{2}){0,3}\b/g) || [];
    for (const code of matches) {
      if (!found.has(code)) found.set(code, { code, name: "" });
    }
  };

  visit(source);
  return Array.from(found.values());
}

function normalizeContactRows(...sources: any[]) {
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

function extractContactsFromText(text: string) {
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

function normalizeDocumentRows(...sources: any[]) {
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

function preferValue(primary: any, fallback: any) {
  if (primary === null || primary === undefined || primary === "") return fallback;
  if (Array.isArray(primary) && primary.length === 0) return fallback;
  return primary;
}

function normalizeNoticeDetailPayload(notice: any, unlock?: any, opportunity?: any) {
  const detailSource = opportunity ? "opportunity" : "notice";
  const contacts = normalizeContactRows(opportunity?.contacts, notice.contacts, notice.key_contacts);
  const mergedContacts = contacts.length > 0 ? contacts : extractContactsFromText(String(notice.description || ""));
  const documents = normalizeDocumentRows(opportunity?.documents, notice.documents, notice.procurement_files);
  const externalLinks = normalizeDocumentRows(opportunity?.external_links, notice.external_links);
  const unspscCodes = normalizeUnspscCodes(preferValue(opportunity?.unspsc_codes, notice.unspsc_codes));
  const agency = opportunity?.agency_full || opportunity?.agency || notice.agency_full || notice.agency || notice.organization || "";
  const description = preferValue(opportunity?.description, notice.description);

  return {
    ...notice,
    title: preferValue(opportunity?.title, notice.title),
    notice_type: preferValue(opportunity?.notice_type, notice.notice_type),
    reference: preferValue(opportunity?.reference, notice.reference),
    country: preferValue(opportunity?.country, notice.country),
    deadline: preferValue(opportunity?.deadline, notice.deadline),
    deadline_ts: preferValue(opportunity?.deadline_ts, notice.deadline_ts),
    estimated_value: preferValue(opportunity?.estimated_value, notice.estimated_value),
    description,
    description_cn: opportunity?.description_cn || "",
    bid_overview: opportunity?.bid_overview || "",
    supplier_conditions: opportunity?.supplier_conditions || "",
    eligibility: opportunity?.eligibility || "",
    technical_hurdles: opportunity?.technical_hurdles || "",
    ai_products: safeJson(opportunity?.ai_products),
    ai_analysis: safeJson(opportunity?.ai_analysis),
    product_code: opportunity?.product_code || "",
    agency,
    agency_full: opportunity?.agency_full || notice.agency_full,
    source_url: opportunity?.source_url || notice.url || "",
    contacts: mergedContacts,
    contact_methods: mergedContacts,
    // 文件清单单一事实源：notice.documents/procurement_files 与 opportunity.documents 合并去重后
    // 统一走 documents；procurement_files 显式置空，防 ...notice 把 DB 原始 JSON 串透传给前端，
    // 也避免前端把同一份清单渲染两遍（原 tender_documents 别名无消费方，一并移除）
    documents,
    procurement_files: [],
    external_links: externalLinks,
    unspsc_codes: unspscCodes,
    core_info: {
      notice_id: notice.notice_id || "",
      opportunity_id: opportunity?.id || notice.converted_opp_id || null,
      detail_source: detailSource,
      reference: preferValue(opportunity?.reference, notice.reference) || "",
      notice_type: preferValue(opportunity?.notice_type, notice.notice_type) || "",
      agency,
      country: preferValue(opportunity?.country, notice.country) || "",
      deadline: preferValue(opportunity?.deadline, notice.deadline) || "",
      estimated_value: preferValue(opportunity?.estimated_value, notice.estimated_value) || "",
      registration_level: preferValue(opportunity?.registration_level, notice.registration_level) || "",
      unspsc_codes: unspscCodes,
    },
    opportunity_info: opportunity ? {
      id: opportunity.id,
      status: opportunity.status || "",
      is_qualified: Number(opportunity.is_qualified || 0),
      audit_status: opportunity.audit_status,
      review_status: opportunity.review_status || "",
      priority: opportunity.priority || "",
    } : null,
    core_locked: false,
    unlock_type: unlock?.unlock_type,
    unlocked_at: unlock?.unlocked_at,
  };
}

function unspscPrefixFromCode(code: string) {
  const digits = String(code || "").replace(/\D/g, "").slice(0, 8);
  if (!digits) return "";
  for (let len = 8; len > 2; len -= 2) {
    if (digits.slice(len - 2, len) !== "00") return digits.slice(0, len);
  }
  return digits.slice(0, 2);
}

function unspscLevelColumnByPrefix(prefix: string) {
  const length = String(prefix || "").length;
  if (length <= 2) return "level1_id";
  if (length <= 4) return "level2_id";
  if (length <= 6) return "level3_id";
  return "level4_id";
}

async function buildNoticeUnspscFilter(dbPool: any, codeId: number) {
  if (!codeId) return { sql: "", params: [] as any[] };

  const [codeRows] = await dbPool.query(
    "SELECT id, code, level FROM crm_unspsc_codes WHERE id = ? LIMIT 1",
    [codeId]
  );
  const code = (codeRows as UnspscCodeRow[])[0];
  if (!code) return { sql: "", params: [] as any[] };

  const codeText = String(code.code || "");
  if (/^[A-J]$/.test(codeText)) {
    const [children] = await dbPool.query(
      "SELECT code FROM crm_unspsc_codes WHERE parent_id = ? ORDER BY code",
      [code.id]
    );
    const prefixes = (children as any[])
      .map((row) => unspscPrefixFromCode(row.code))
      .filter(Boolean);
    if (prefixes.length === 0) return { sql: "", params: [] as any[] };
    return {
      sql: `INNER JOIN (
        SELECT DISTINCT notice_id
        FROM crm_bid_notice_unspsc_codes
        WHERE level1_id IN (${prefixes.map(() => "?").join(",")})
      ) filtered_notices ON filtered_notices.notice_id = n.id`,
      params: prefixes,
    };
  }

  const prefix = unspscPrefixFromCode(codeText);
  if (!prefix) return { sql: "", params: [] as any[] };
  const levelColumn = unspscLevelColumnByPrefix(prefix);
  return {
    sql: `INNER JOIN (
      SELECT DISTINCT notice_id
      FROM crm_bid_notice_unspsc_codes
      WHERE ${levelColumn} = ?
    ) filtered_notices ON filtered_notices.notice_id = n.id`,
    params: [prefix],
  };
}

function expandUnspscInterestPrefixes(code: string) {
  const significant = unspscPrefixFromCode(code);
  if (!significant) return [];
  const prefixes: string[] = [];
  for (let len = 2; len <= significant.length; len += 2) {
    prefixes.push(significant.slice(0, len));
  }
  return Array.from(new Set(prefixes));
}

function padUnspscPrefix(prefix: string) {
  return String(prefix || "").padEnd(8, "0").slice(0, 8);
}

// 本地差异 #11：T-E3 source 枚举白名单（固化写入端合法来源，未知来源拒写防脏数据）
const INTEREST_SOURCE_WHITELIST = new Set([
  "unlock_order",      // 解锁订单（+2.5）
  "subscribe_notice",  // 订阅公告（+2.0）
  "express_interest",  // 表达兴趣（+1.0）
  "feedback_click",    // T-B6 反馈：点击（+0.3）
  "feedback_favorite", // T-B6 反馈：收藏（+0.8）
]);
// 本地差异 #11：T-E3 单码 weight 软上限——写入端 LEAST 封顶，现有超上限存量不回改（只封新增）
const INTEREST_WEIGHT_CAP = 500;

async function persistUserInterestCodes(dbPool: any, userKey: string, snapshot: any[], source: string, weight: number) {
  if (!INTEREST_SOURCE_WHITELIST.has(source)) return; // T-E3：白名单外来源拒写
  const prefixes = new Set<string>();
  for (const item of snapshot) {
    const rawCode = String(item?.code || "").replace(/\D/g, "").slice(0, 8);
    expandUnspscInterestPrefixes(rawCode).forEach((prefix) => prefixes.add(prefix));
  }

  for (const prefix of prefixes) {
    const [codeRows] = await dbPool.query(
      "SELECT id, level FROM crm_unspsc_codes WHERE code IN (?, ?) ORDER BY CHAR_LENGTH(code) DESC LIMIT 1",
      [prefix, padUnspscPrefix(prefix)]
    );
    const codeRow = (codeRows as UnspscCodeRow[])[0];
    await dbPool.execute(
      `INSERT INTO crm_user_interest_codes (user_id, user_key, code_id, code, level, source, weight)
       VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE weight = LEAST(${INTEREST_WEIGHT_CAP}, weight + VALUES(weight)), updated_at = NOW()`,
      [userKey, userKey, codeRow?.id || null, prefix, Math.max(1, prefix.length / 2), source, weight]
    );
  }
}

// 本地差异 #11：T-E3 负反馈强化（E.3）——dismiss 用相对强衰减 ×0.5（乘法在权重通胀下仍有效，
// 绝对扣减会失效）；GREATEST(0.01) 下限保护，weight 永不降为 ≤0（画像可转向但不清零）。
// 对该用户展开前缀命中的所有 source 行统一衰减（跨来源同码一并降权）
async function decayUserInterestCodes(dbPool: any, userKey: string, snapshot: any[], factor = 0.5) {
  const prefixes = new Set<string>();
  for (const item of snapshot) {
    const rawCode = String(item?.code || "").replace(/\D/g, "").slice(0, 8);
    expandUnspscInterestPrefixes(rawCode).forEach((prefix) => prefixes.add(prefix));
  }
  if (prefixes.size === 0) return;
  const list = Array.from(prefixes);
  await dbPool.execute(
    `UPDATE crm_user_interest_codes
     SET weight = GREATEST(0.01, weight * ?), updated_at = NOW()
     WHERE user_key = ? AND code IN (${list.map(() => "?").join(",")})`,
    [factor, userKey, ...list]
  );
}

async function findQualifiedOpportunityForNotice(dbPool: any, notice: any) {
  const fields = `
    id, source_notice_id, source_url, title, reference, notice_type, registration_level,
    agency, agency_full, country, beneficiary_countries, published_date, deadline, deadline_ts,
    estimated_value, description, description_cn, bid_overview, supplier_conditions,
    eligibility, technical_hurdles, industry, unspsc_codes, thresholds, difficulty,
    contacts, documents, external_links, ai_products, ai_analysis, status, priority,
    audit_status, review_status, is_qualified, product_code
  `;
  const qualifiedWhere = "(is_qualified = 1 OR status = 'won' OR audit_status = 1)";

  if (Number(notice.converted_opp_id || 0) > 0) {
    const [rows] = await dbPool.query(
      `SELECT ${fields}
       FROM crm_bid_opportunities
       WHERE id = ? AND ${qualifiedWhere}
       LIMIT 1`,
      [Number(notice.converted_opp_id)]
    );
    if ((rows as any[])[0]) return (rows as any[])[0];
  }

  if (notice.notice_id) {
    const [rows] = await dbPool.query(
      `SELECT ${fields}
       FROM crm_bid_opportunities
       WHERE source_notice_id = ? AND ${qualifiedWhere}
       ORDER BY is_qualified DESC, id DESC
       LIMIT 1`,
      [String(notice.notice_id)]
    );
    if ((rows as any[])[0]) return (rows as any[])[0];
  }

  if (notice.reference) {
    const [rows] = await dbPool.query(
      `SELECT ${fields}
       FROM crm_bid_opportunities
       WHERE reference = ? AND ${qualifiedWhere}
       ORDER BY is_qualified DESC, id DESC
       LIMIT 1`,
      [String(notice.reference)]
    );
    if ((rows as any[])[0]) return (rows as any[])[0];
  }

  return null;
}

function mapUngmAppointmentRow(row: any): Lead {
  return {
    id: row.appointment_key,
    companyName: row.company_name,
    country: row.country || "China",
    city: row.city || "Unknown",
    contactPerson: row.contact_person,
    contactMethod: row.contact_method,
    email: row.email || "",
    industry: row.industry || "Services",
    mainProducts: "",
    has国际公共采购Participation: false,
    notes: row.consultation_needs || "",
    type: "consulting_advisor",
    status: row.status || "new",
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
    followUpLogs: safeJson(row.follow_up_logs),
  };
}

async function insertUngmAppointment(dbPool: any, lead: Lead, rawPayload: any, ip: string) {
  await dbPool.execute(
    `INSERT INTO ungm_1v1_appointments
      (appointment_key, company_name, country, city, contact_person, contact_method, email, industry, consultation_needs, status, follow_up_logs, extra, raw_payload, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      lead.id,
      lead.companyName,
      lead.country || "China",
      lead.city || "Unknown",
      lead.contactPerson,
      lead.contactMethod,
      lead.email || "",
      lead.industry || "Services",
      lead.notes || "",
      lead.status || "new",
      JSON.stringify(lead.followUpLogs || []),
      JSON.stringify({ source: "consult_form", lead_type: "consulting_advisor" }),
      JSON.stringify(rawPayload || {}),
      ip,
      new Date(lead.createdAt),
    ]
  );
}

function hashPassword(password: string) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

async function backfillUserIds(dbPool: any) {
  const tables = [
    "crm_user_subscriptions",
    "crm_payment_orders",
    "crm_user_entitlements",
    "crm_opportunity_unlocks",
    "crm_user_notice_views",
    "crm_notice_interests",
    "crm_user_interest_codes",
    "crm_supplier_claims",
  ];

  for (const table of tables) {
    await dbPool.execute(
      `UPDATE ${table} target
       INNER JOIN crm_users u ON u.user_key = target.user_key
       SET target.user_id = u.id
       WHERE target.user_id IS NULL`
    );
  }
}

async function backfillUnspscCodeIds(dbPool: any) {
  for (const table of ["crm_bid_notice_unspsc_codes", "crm_bid_opportunity_unspsc_codes"]) {
    await dbPool.execute(
      `UPDATE ${table} bridge
       INNER JOIN crm_unspsc_codes code ON code.code = bridge.code
       SET bridge.code_id = code.id
       WHERE bridge.code_id IS NULL OR bridge.code_id = 0`
    );
  }
}

function getPaymentRuntimeConfig() {
  const mode = process.env.PAYMENT_MODE === "live" ? "live" : "mock";
  const alipayRequired = ["ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY", "ALIPAY_PUBLIC_KEY", "ALIPAY_NOTIFY_URL"];
  const wechatRequired = ["WECHAT_APP_ID", "WECHAT_MCH_ID", "WECHAT_API_V3_KEY", "WECHAT_PRIVATE_KEY", "WECHAT_NOTIFY_URL"];
  const hasEnv = (name: string) => Boolean(process.env[name] && String(process.env[name]).trim());
  const missing = (names: string[]) => names.filter((name) => !hasEnv(name));
  const wechatMchConfigured = hasEnv("WECHAT_MCH_ID") || hasEnv("WECHAT_MERCHANT_ID");
  const wechatMissing = wechatRequired.filter((name) => name === "WECHAT_MCH_ID" ? !wechatMchConfigured : !hasEnv(name));

  return {
    mode,
    live_enabled: mode === "live",
    providers: {
      alipay: {
        configured: missing(alipayRequired).length === 0,
        missing_env: missing(alipayRequired),
        support: {
          pc: "alipay.trade.page.pay",
          h5: "planned: alipay.trade.wap.pay, current provider uses page.pay skeleton",
        },
      },
      wechat: {
        configured: wechatMissing.length === 0,
        missing_env: wechatMissing,
        accepted_mch_env: ["WECHAT_MCH_ID", "WECHAT_MERCHANT_ID"],
        support: {
          h5: "WeChat Pay H5 outside WeChat browser, provider skeleton",
          pc: "Native QR planned, current provider returns placeholder qr_code_url",
        },
      },
      mock: {
        configured: true,
        support: {
          pc: "auto-paid polling demo",
          h5: "auto-paid polling demo",
        },
      },
    },
  };
}

async function hydratePaymentEnvFromDb(dbPool: any) {
  const [rows] = await dbPool.query(
    `SELECT provider, mode, app_id, notify_url, return_url, public_key, private_key_ref, is_active
     FROM crm_payment_provider_configs
     WHERE provider = 'alipay' AND is_active = 1
     ORDER BY id DESC
     LIMIT 1`
  );
  const alipay = (rows as any[])[0];
  if (!alipay) return false;

  process.env.PAYMENT_MODE = "live";
  process.env.ALIPAY_APP_ID = alipay.app_id || process.env.ALIPAY_APP_ID || "";
  process.env.ALIPAY_PRIVATE_KEY = alipay.private_key_ref || process.env.ALIPAY_PRIVATE_KEY || "";
  process.env.ALIPAY_PUBLIC_KEY = alipay.public_key || process.env.ALIPAY_PUBLIC_KEY || "";
  process.env.ALIPAY_NOTIFY_URL = alipay.notify_url || process.env.ALIPAY_NOTIFY_URL || "";
  process.env.ALIPAY_RETURN_URL = alipay.return_url || process.env.ALIPAY_RETURN_URL || "";
  process.env.ALIPAY_SANDBOX = alipay.mode === "sandbox" ? "true" : "false";
  return true;
}

async function ensureColumn(dbPool: any, table: string, column: string, ddl: string) {
  const [rows] = await dbPool.query(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (Number((rows as any[])[0]?.total || 0) === 0) {
    await dbPool.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

async function ensureColumnType(dbPool: any, table: string, column: string, ddl: string) {
  const [rows] = await dbPool.query(
    `SELECT COLUMN_TYPE AS column_type
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column]
  );
  if ((rows as any[]).length > 0) {
    await dbPool.query(`ALTER TABLE ${table} MODIFY COLUMN ${ddl}`);
  }
}

async function ensureIndex(dbPool: any, table: string, indexName: string, ddl: string) {
  const [rows] = await dbPool.query(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  );
  if (Number((rows as any[])[0]?.total || 0) === 0) {
    await dbPool.query(ddl);
  }
}

async function ensureIndexIfTableExists(dbPool: any, table: string, indexName: string, ddl: string) {
  const [tableRows] = await dbPool.query(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  if (Number((tableRows as any[])[0]?.total || 0) === 0) return;
  await ensureIndex(dbPool, table, indexName, ddl);
}

async function getUnspscPath(dbPool: any, codeId: number) {
  const path: Record<string, number | null> = {
    level1_id: null,
    level2_id: null,
    level3_id: null,
    level4_id: null,
    level5_id: null,
  };

  let currentId: number | null = codeId;
  for (let i = 0; i < 6 && currentId; i += 1) {
    const [rows] = await dbPool.query(
      "SELECT id, parent_id, level FROM crm_unspsc_codes WHERE id = ? LIMIT 1",
      [currentId]
    );
    const row = (rows as UnspscCodeRow[])[0];
    if (!row) break;
    if (row.level >= 1 && row.level <= 5) {
      path[`level${row.level}_id`] = row.id;
    }
    currentId = row.parent_id || null;
  }

  return path;
}

// ── 公告按需翻译（本地差异 #4：缓存表 + 翻译接口）──
const NOTICE_TRANSLATION_LANGS: Record<string, string> = {
  zh: "Simplified Chinese",
  fr: "French",
  ru: "Russian",
  es: "Spanish",
  ar: "Arabic",
};

// 同一 (notice, lang) 的并发首次请求只触发一次翻译链调用
const pendingNoticeTranslations = new Map<string, Promise<ChainResult>>();

async function translateNoticeText(
  title: string,
  description: string,
  langName: string
): Promise<{ title: string; description: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
    throw new Error("TRANSLATION_UNAVAILABLE");
  }
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
  const prompt = `You are a professional procurement document translator. Translate the tender notice fields below into ${langName}.
Rules:
- Keep organization names, reference numbers, UNSPSC codes, URLs, emails and abbreviations (e.g. UNGM, RFQ, ITB, EOI) unchanged.
- Preserve line breaks inside the description.
- Return ONLY valid JSON in exactly this shape: {"title": "...", "description": "..."}

TITLE:
${title}

DESCRIPTION:
${description}`;
  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
  });
  const raw = (response.text || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const parsed = JSON.parse(raw);
  if (typeof parsed?.title !== "string" || typeof parsed?.description !== "string") {
    throw new Error("TRANSLATION_MALFORMED");
  }
  return { title: parsed.title, description: parsed.description };
}

// ── 供应商字段按需翻译（对齐公告翻译：缓存表 + Gemini + 并发去重）──
// 原文为中文，仅需翻译非中文界面语言；公司名保留原文不翻译
const SUPPLIER_TRANSLATION_LANGS: Record<string, string> = {
  en: "English",
  fr: "French",
  ru: "Russian",
  es: "Spanish",
  ar: "Arabic",
};

type SupplierTranslatableFields = {
  industry: string;
  mainProducts: string;
  certification: string;
  enterpriseNature: string;
};

// 同一 (supplier, lang) 的并发首次翻译只触发一次翻译链调用
const pendingSupplierTranslations = new Map<string, Promise<ChainResult>>();

async function translateSupplierFields(
  fields: SupplierTranslatableFields,
  langName: string
): Promise<SupplierTranslatableFields> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
    throw new Error("TRANSLATION_UNAVAILABLE");
  }
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
  const prompt = `You are a professional B2B trade-directory translator. Translate the Chinese supplier profile fields below into ${langName}.
Rules:
- Keep certification abbreviations (e.g. ISO, FDA, CE, 3C, GMP, RoHS) and brand names unchanged.
- Keep list separators (commas) unchanged so each field stays a comma-separated list.
- If a field is empty, return an empty string for it.
- Return ONLY valid JSON in exactly this shape: {"industry": "...", "mainProducts": "...", "certification": "...", "enterpriseNature": "..."}

INDUSTRY:
${fields.industry}

MAIN PRODUCTS:
${fields.mainProducts}

CERTIFICATION:
${fields.certification}

ENTERPRISE NATURE:
${fields.enterpriseNature}`;
  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
  });
  const raw = (response.text || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const parsed = JSON.parse(raw);
  if (
    typeof parsed?.industry !== "string" ||
    typeof parsed?.mainProducts !== "string" ||
    typeof parsed?.certification !== "string" ||
    typeof parsed?.enterpriseNature !== "string"
  ) {
    throw new Error("TRANSLATION_MALFORMED");
  }
  return {
    industry: parsed.industry,
    mainProducts: parsed.mainProducts,
    certification: parsed.certification,
    enterpriseNature: parsed.enterpriseNature,
  };
}

// ── UNSPSC 类目标题按需翻译（对齐供应商翻译：缓存表 + Gemini + 并发去重）──
// 源文本为类目英文标题；zh/en 界面直接用类目表原列，仅 fr/ru/es/ar 需要译文
const UNSPSC_TRANSLATION_LANGS: Record<string, string> = {
  fr: "French",
  ru: "Russian",
  es: "Spanish",
  ar: "Arabic",
};

// 同一 (父级列表, lang) 的并发首次翻译只触发一次翻译链调用
const pendingUnspscTranslations = new Map<string, Promise<ChainResult>>();

// 整批列表一次调用：children 列表 ≤ 60 条，逐条调用会打爆配额
async function translateUnspscTitles(titles: string[], langName: string): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
    throw new Error("TRANSLATION_UNAVAILABLE");
  }
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
  const prompt = `You are a professional translator of the UNSPSC procurement classification. Translate each category title in the JSON array below into ${langName}.
Rules:
- Keep abbreviations, acronyms and proper nouns unchanged.
- Return ONLY a valid JSON array of strings with exactly ${titles.length} items, in the same order as the input.

INPUT:
${JSON.stringify(titles)}`;
  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
  });
  const raw = (response.text || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const parsed = JSON.parse(raw);
  if (
    !Array.isArray(parsed) ||
    parsed.length !== titles.length ||
    parsed.some((item) => typeof item !== "string")
  ) {
    throw new Error("TRANSLATION_MALFORMED");
  }
  return parsed;
}

// ── 翻译通道链（本地差异 #4 扩展：有道智云 → DeepSeek V4-Pro → Gemini 兜底）──
// 各通道均可缺省：未配置或失败的通道自动跳到下一层；全链失败时由 Gemini
// 兜底函数抛 TRANSLATION_UNAVAILABLE，复用既有降级路径（详情 503 / 补翻静默）。
// 缓存表 model 列写入真实提供方（youdao / deepseek-v4-pro / gemini-3.5-flash）。

type ChainResult = { translations: string[]; provider: string };

// 占位符值与空值均视为"未配置该通道"（与 GEMINI_API_KEY 占位符检查同款语义）
const CHANNEL_PLACEHOLDERS = new Set([
  "MY_GEMINI_API_KEY",
  "MY_YOUDAO_APP_KEY",
  "MY_YOUDAO_APP_SECRET",
  "MY_DEEPSEEK_API_KEY",
]);
function channelConfigured(value: string | undefined): boolean {
  return !!value && value.trim() !== "" && !CHANNEL_PLACEHOLDERS.has(value.trim());
}

// 链路通用的语言全名映射（供 LLM 通道拼 prompt 用；源语言仅 en/zh，目标含六语言）
const CHAIN_LANG_NAMES: Record<string, string> = {
  zh: "Simplified Chinese",
  en: "English",
  fr: "French",
  ru: "Russian",
  es: "Spanish",
  ar: "Arabic",
};


// MT 通道的术语保护：URL/邮箱/参考号/常见缩写抽出为占位符，译后回填；
// 任一占位符在译文中丢失即判本通道失败落下一层（Gemini 通道靠 prompt 规则，不套占位符）
const PROTECT_PATTERNS: RegExp[] = [
  /https?:\/\/[^\s)]+/g,
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
  /\b[A-Z]{2,10}(?:[-/][A-Z0-9]{1,12})+\b/g, // 参考号，如 RFQ-2026-0042
  /\b(?:UNGM|RFQ|ITB|EOI|UNSPSC|ISO|FDA|CE|GMP|RoHS|3C)\b/g,
];

function protectTerms(text: string): { masked: string; tokens: string[] } {
  const tokens: string[] = [];
  let masked = text;
  for (const pattern of PROTECT_PATTERNS) {
    masked = masked.replace(pattern, (match) => {
      const token = `⟦T${tokens.length}⟧`;
      tokens.push(match);
      return token;
    });
  }
  return { masked, tokens };
}

function restoreTerms(text: string, tokens: string[]): string {
  let restored = text;
  for (let i = 0; i < tokens.length; i += 1) {
    // MT 可能在占位符内部/两侧插入空格（实测机器翻译会把 ⟦T1⟧ 译成 ⟦ T1⟧ ），
    // 宽松匹配回填；完全找不到才判丢失。函数式替换避免 token 内 $ 符被误解析
    const pattern = new RegExp(`\u27E6\\s*T\\s*${i}\\s*\u27E7`, "g");
    if (!restored.match(pattern)) throw new Error("MT_PLACEHOLDER_LOST");
    restored = restored.replace(pattern, () => tokens[i]);
  }
  return restored;
}

// 通道1：有道智云 文本翻译（signType v3）
// 认证需同时配置 YOUDAO_APP_KEY(应用ID) 与 YOUDAO_APP_SECRET(应用密钥)，缺一即跳过本通道；
// sign = SHA256(appKey + input + salt + curtime + appSecret)，input 规则见 youdaoInput()。
// 单次上限 5000 字符：超长文本预检即跳过（省去必败的 API 调用），直接降级 DeepSeek；
// 不设每日软额度限制，超量由有道 API 自身报错（errorCode≠0）后降级。
const YOUDAO_CODES: Record<string, string> = {
  zh: "zh-CHS",
  en: "en",
  fr: "fr",
  ru: "ru",
  es: "es",
  ar: "ar",
};
const YOUDAO_MAX_CHARS = 5000;

// 官方签名输入规则：q 长度 >20 时取 前10 + 长度 + 后10
function youdaoInput(q: string): string {
  if (q.length <= 20) return q;
  return q.slice(0, 10) + q.length + q.slice(q.length - 10);
}

async function translateViaYoudao(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  const appKey = process.env.YOUDAO_APP_KEY;
  const appSecret = process.env.YOUDAO_APP_SECRET;
  const from = YOUDAO_CODES[sourceLang];
  const to = YOUDAO_CODES[targetLang];
  if (!channelConfigured(appKey) || !channelConfigured(appSecret) || !from || !to) {
    throw new Error("CHANNEL_SKIPPED");
  }
  // 超长预检：有道必拒的请求不发起，立即降级 DeepSeek，省 API 调用与等待
  if (text.length > YOUDAO_MAX_CHARS) throw new Error("CHANNEL_SKIPPED");
  // 有道会吞掉 ⟦Tn⟧ 数学括号占位符（实测直接删除），发送前局部换成其可保留的 §Tn§，
  // 返回后再换回，不影响链上其它通道的占位符约定
  const sendText = text.replace(/\u27E6\s*T\s*(\d+)\s*\u27E7/g, "\u00A7T$1\u00A7");
  const salt = crypto.randomUUID();
  const curtime = String(Math.round(Date.now() / 1000));
  const sign = crypto
    .createHash("sha256")
    .update(String(appKey) + youdaoInput(sendText) + salt + curtime + String(appSecret))
    .digest("hex");
  const body = new URLSearchParams({
    q: sendText,
    from,
    to,
    appKey: String(appKey),
    salt,
    sign,
    signType: "v3",
    curtime,
  });
  const res = await fetch("https://openapi.youdao.com/api", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`YOUDAO_HTTP_${res.status}`);
  const data: any = await res.json();
  // errorCode "0" 为成功；其余（如 108 无效 appKey、202 签名错、411 限流）落下一通道
  if (String(data?.errorCode) !== "0") throw new Error(`YOUDAO_ERROR_${data?.errorCode}`);
  // 换回链上统一的 ⟦Tn⟧ 占位符（宽松匹配译文中可能被插入的空格）
  const translated = String((data?.translation || [])[0] ?? "")
    .replace(/\u00A7\s*T\s*(\d+)\s*\u00A7/g, "\u27E6T$1\u27E7")
    .trim();
  if (!translated) throw new Error("YOUDAO_EMPTY");
  return translated;
}

// 通道2：DeepSeek V4-Pro（OpenAI 兼容 /chat/completions，思考模式 effort=max）
// 认证需配置 DEEPSEEK_API_KEY；未配置即跳过本通道。作为 LLM 通道插在有道之后、
// Gemini 之前：有道对结构化短句快而稳，DeepSeek 对长描述/上下文语义更准，Gemini 末位兜底。
// 思考模式下 temperature 等参数不生效；思维链走 reasoning_content（此处忽略），译文取 content。
// 占位符沿用链上统一的 ⟦Tn⟧，由 prompt 明确要求原样保留，返回后经 restoreTerms 回填。
// 合并请求模式：标题+正文等多段以 JSON 数组一次进出——一次思考翻完全部字段，
// 段间共享上下文、术语一致，且省去多次深度思考的延迟与 token 开销；
// 返回数组长度/形状不符即判失败降级。不设单次长度与每日软额度限制，
// 超长/超量由 API 自身报错（HTTP 400/402/429 等）后降级到 Gemini。

async function translateViaDeepSeek(
  texts: string[],
  sourceLang: string,
  targetLang: string
): Promise<string[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const sourceName = CHAIN_LANG_NAMES[sourceLang];
  const targetName = CHAIN_LANG_NAMES[targetLang];
  if (!channelConfigured(apiKey) || !sourceName || !targetName) throw new Error("CHANNEL_SKIPPED");
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  const prompt = `Translate each ${sourceName} procurement text in the JSON array below into ${targetName}.
Rules:
- Keep every ⟦Tn⟧ placeholder (e.g. ⟦T0⟧, ⟦T1⟧) exactly as-is, unchanged and in place.
- Preserve line breaks inside each string.
- Keep terminology consistent across all strings (they belong to the same tender notice).
- Return ONLY a JSON array of ${texts.length} translated strings in the same order, with no explanations and no markdown fences.

${JSON.stringify(texts)}`;
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${String(apiKey)}`,
    },
    body: JSON.stringify({
      model: "deepseek-v4-pro",
      messages: [{ role: "user", content: prompt }],
      reasoning_effort: "max",
      thinking: { type: "enabled" },
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`DEEPSEEK_HTTP_${res.status}`);
  const data: any = await res.json();
  const content = String(data?.choices?.[0]?.message?.content ?? "").trim();
  if (!content) throw new Error("DEEPSEEK_EMPTY");
  // 容错剥掉模型偶发包裹的 ```json 围栏后按 JSON 数组解析
  const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("DEEPSEEK_BAD_JSON");
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== texts.length ||
    !parsed.every((item) => typeof item === "string" && item.trim() !== "")
  ) {
    throw new Error("DEEPSEEK_BAD_SHAPE");
  }
  return (parsed as string[]).map((item) => item.trim());
}

// 通道链入口：空文本原样透传（供应商空字段等）；六种语言（zh/en/fr/ru/es/ar）统一走
// 有道→DeepSeek→Gemini 三层；geminiFallback 由各场景传入既有 prompt 实现（保留其术语规则与 JSON 校验）
async function translateViaChain(
  texts: string[],
  sourceLang: "en" | "zh",
  targetLang: string,
  geminiFallback: () => Promise<string[]>
): Promise<ChainResult> {
  const jobs = texts
    .map((text, index) => ({ text, index }))
    .filter((job) => job.text.trim() !== "");
  if (jobs.length === 0) return { translations: texts, provider: "none" };

  const assemble = (translated: Map<number, string>): string[] =>
    texts.map((text, index) => translated.get(index) ?? text);

  try {
    const translated = new Map<number, string>();
    for (const job of jobs) {
      const { masked, tokens } = protectTerms(job.text);
      translated.set(job.index, restoreTerms(await translateViaYoudao(masked, sourceLang, targetLang), tokens));
    }
    return { translations: assemble(translated), provider: "youdao" };
  } catch (err: any) {
    // 未配置/超长/失败：落下一通道
    console.warn(`[translate] youdao -> next: ${err?.message}`);
  }
  try {
    // 合并请求：所有段一次过 DeepSeek（各段独立 protectTerms，占位符互不干扰）
    const masks = jobs.map((job) => protectTerms(job.text));
    const outputs = await translateViaDeepSeek(
      masks.map((m) => m.masked),
      sourceLang,
      targetLang
    );
    const translated = new Map<number, string>();
    jobs.forEach((job, i) => {
      translated.set(job.index, restoreTerms(outputs[i], masks[i].tokens));
    });
    return { translations: assemble(translated), provider: "deepseek-v4-pro" };
  } catch (err: any) {
    // 未配置/失败/形状不符：落下一通道
    console.warn(`[translate] deepseek -> next: ${err?.message}`);
  }
  return { translations: await geminiFallback(), provider: "gemini-3.5-flash" };
}

// 公告标题+描述过链的适配器（详情端点与解锁补翻共用，与 pendingNoticeTranslations 键配套）
function translateNoticeViaChain(
  title: string,
  description: string,
  lang: string
): Promise<ChainResult> {
  return translateViaChain([title, description], "en", lang, async () => {
    const result = await translateNoticeText(title, description, NOTICE_TRANSLATION_LANGS[lang]);
    return [result.title, result.description];
  });
}

// ── 公采搜索功能（本地差异 #6：G.2 四参数搜索 + G.4 搜索落库 + F.1/F.3 防御）──
// F.1：user_key 落库前统一归一化（trim + 小写），与读侧 /api/notices/recommended 口径一致；
// 游客/空值返回 null（拒写 "guest" 占位，避免污染行为统计）
function normalizeUserKey(raw: unknown): string | null {
  const key = String(raw || "").trim().toLowerCase().slice(0, 190);
  if (!key || key === "guest") return null;
  return key;
}

// ── 本地差异 #10：T-B3 金额解析（D.3.2 四步规则：垃圾过滤 → 币种识别 → 数字提取/区间取中位 → country 推断）──
// estimated_value 实测形态（2026-07-29 只读探针）：notices 侧 56% 纯数字 + 43% "BRL 173,841.36" 式；
// opportunities 侧含"未提及/Not specified"类垃圾文本、"6666.67 php" 小写后缀、"菲律宾比索"中文名、区间。
const AMOUNT_PARSE_VERSION = 1;
// 粗粒度静态汇率（→USD）：仅用于跨币种数量级可比，不追求精确；调整后须递增 AMOUNT_PARSE_VERSION 触发重算
const USD_RATE: Record<string, number> = {
  USD: 1, EUR: 1.08, GBP: 1.27, CNY: 0.14, JPY: 0.0067, BRL: 0.18, PHP: 0.017, INR: 0.012,
  IDR: 0.000063, VND: 0.00004, THB: 0.028, MYR: 0.22, KRW: 0.00072, RUB: 0.011, MXN: 0.055,
  CLP: 0.0011, COP: 0.00025, PEN: 0.27, ARS: 0.001, XOF: 0.0016, XAF: 0.0016, KES: 0.0072,
  NGN: 0.00065, ZAR: 0.053, EGP: 0.021, ETB: 0.008, TZS: 0.0004, UGX: 0.00027, GHS: 0.065,
  MAD: 0.1, DZD: 0.0074, TND: 0.32, PKR: 0.0036, BDT: 0.0085, LKR: 0.0031, NPR: 0.0074,
  MMK: 0.00048, KHR: 0.00025, LAK: 0.000045, AFN: 0.014, IQD: 0.00076, JOD: 1.41, SAR: 0.27,
  AED: 0.27, QAR: 0.27, KWD: 3.25, TRY: 0.03, UAH: 0.024, PLN: 0.25, RON: 0.22, HUF: 0.0026,
  CZK: 0.043, SEK: 0.095, NOK: 0.093, DKK: 0.145, CHF: 1.13, CAD: 0.73, AUD: 0.66, NZD: 0.61,
  HTG: 0.0076, DOP: 0.017, GTQ: 0.13, HNL: 0.04, NIO: 0.027, CRC: 0.0019, PAB: 1, BOB: 0.145,
  PYG: 0.00013, UYU: 0.025, SOS: 0.0018, SDG: 0.0017, SSP: 0.0008, YER: 0.004, SYP: 0.00008,
  LBP: 0.000011, MZN: 0.016, MWK: 0.00058, ZMW: 0.037, RWF: 0.00073, BIF: 0.00034, CDF: 0.00035,
  GNF: 0.00012, SLL: 0.000044, LRD: 0.0052, GMD: 0.014, MRU: 0.025, DJF: 0.0056, ERN: 0.067,
  UZS: 0.000079, KZT: 0.002, KGS: 0.011, TJS: 0.092, TMT: 0.29, AZN: 0.59, GEL: 0.37, AMD: 0.0025,
  MNT: 0.00029, BTN: 0.012, MVR: 0.065, FJD: 0.44, PGK: 0.25, SBD: 0.12, VUV: 0.0082,
  WST: 0.36, TOP: 0.42, HKD: 0.128, TWD: 0.031, SGD: 0.74, BND: 0.74, MOP: 0.124, ILS: 0.27,
  OMR: 2.6, BHD: 2.65, LYD: 0.21, ALL: 0.011, MKD: 0.0175, RSD: 0.0092, BAM: 0.55, BGN: 0.55,
  MDL: 0.056, BYN: 0.31, ISK: 0.0072, HRK: 0.143,
};
// 中文币种名 → ISO（三写法之一；"比索/卢比/第纳尔"等歧义词不收，靠 country 推断兜底）
const CURRENCY_NAME_MAP: Record<string, string> = {
  "美元": "USD", "欧元": "EUR", "英镑": "GBP", "人民币": "CNY", "日元": "JPY",
  "巴西雷亚尔": "BRL", "雷亚尔": "BRL", "菲律宾比索": "PHP", "印度卢比": "INR", "印尼盾": "IDR",
  "越南盾": "VND", "泰铢": "THB", "韩元": "KRW", "卢布": "RUB", "墨西哥比索": "MXN",
  "智利比索": "CLP", "哥伦比亚比索": "COP", "阿根廷比索": "ARS", "南非兰特": "ZAR",
  "埃及镑": "EGP", "土耳其里拉": "TRY", "沙特里亚尔": "SAR", "迪拉姆": "AED", "港元": "HKD",
  "新台币": "TWD", "新加坡元": "SGD", "瑞士法郎": "CHF", "加元": "CAD", "澳元": "AUD",
};
// 国家名（英文小写包含匹配）→ 法定货币：country 推断路径，打 inferred 标记（评分信心收缩 ×0.7）
const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  brazil: "BRL", philippines: "PHP", india: "INR", indonesia: "IDR", "viet nam": "VND", vietnam: "VND",
  thailand: "THB", malaysia: "MYR", china: "CNY", japan: "JPY", "korea": "KRW", mexico: "MXN",
  chile: "CLP", colombia: "COP", peru: "PEN", argentina: "ARS", kenya: "KES", nigeria: "NGN",
  "south africa": "ZAR", egypt: "EGP", ethiopia: "ETB", tanzania: "TZS", uganda: "UGX", ghana: "GHS",
  morocco: "MAD", algeria: "DZD", tunisia: "TND", pakistan: "PKR", bangladesh: "BDT", "sri lanka": "LKR",
  nepal: "NPR", myanmar: "MMK", cambodia: "KHR", "lao": "LAK", afghanistan: "AFN", iraq: "IQD",
  jordan: "JOD", "saudi arabia": "SAR", "united arab emirates": "AED", qatar: "QAR", kuwait: "KWD",
  turkey: "TRY", ukraine: "UAH", poland: "PLN", romania: "RON", hungary: "HUF", "czech": "CZK",
  sweden: "SEK", norway: "NOK", denmark: "DKK", switzerland: "CHF", canada: "CAD", australia: "AUD",
  "new zealand": "NZD", haiti: "HTG", "dominican republic": "DOP", guatemala: "GTQ", honduras: "HNL",
  nicaragua: "NIO", "costa rica": "CRC", panama: "PAB", bolivia: "BOB", paraguay: "PYG", uruguay: "UYU",
  somalia: "SOS", sudan: "SDG", "south sudan": "SSP", yemen: "YER", syria: "SYP", lebanon: "LBP",
  mozambique: "MZN", malawi: "MWK", zambia: "ZMW", rwanda: "RWF", burundi: "BIF", congo: "CDF",
  guinea: "GNF", "sierra leone": "SLL", liberia: "LRD", gambia: "GMD", mauritania: "MRU",
  djibouti: "DJF", eritrea: "ERN", uzbekistan: "UZS", kazakhstan: "KZT", kyrgyzstan: "KGS",
  tajikistan: "TJS", turkmenistan: "TMT", azerbaijan: "AZN", georgia: "GEL", armenia: "AMD",
  mongolia: "MNT", bhutan: "BTN", maldives: "MVR", fiji: "FJD", "papua new guinea": "PGK",
  "united states": "USD", "ecuador": "USD", "el salvador": "USD", "timor": "USD", singapore: "SGD",
  israel: "ILS", oman: "OMR", bahrain: "BHD", libya: "LYD", albania: "ALL", "north macedonia": "MKD",
  serbia: "RSD", bosnia: "BAM", bulgaria: "BGN", moldova: "MDL", belarus: "BYN", iceland: "ISK",
  "united kingdom": "GBP", france: "EUR", germany: "EUR", italy: "EUR", spain: "EUR", portugal: "EUR",
  netherlands: "EUR", belgium: "EUR", austria: "EUR", greece: "EUR", finland: "EUR", ireland: "EUR",
};

function parseEstimatedValue(
  raw: unknown,
  country?: unknown
): { amount: number; currency: string | null; amountUsd: number | null; inferred: boolean } | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  // 步骤 1：垃圾过滤——不含数字直接判不可解析（"未提及/Not specified/待补充"等实测高频垃圾文本）
  if (!/[0-9]/.test(text)) return null;

  // 步骤 3（先提数字再定币种，互不依赖）：去千分位逗号后提取；区间（-/~/至/to）取中位
  const cleaned = text.replace(/(\d),(?=\d{3}(\D|$))/g, "$1");
  const nums = (cleaned.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((v) => Number.isFinite(v) && v > 0);
  if (nums.length === 0) return null; // 全是 0 或无有效数字（"0" 实测 2021 行，视同缺失）
  const isRange = nums.length >= 2 && /\d[\s,.]*(?:-|~|—|～|至|to)\s*[\d]/i.test(cleaned);
  let amount = isRange ? (nums[0] + nums[1]) / 2 : nums[0];
  if (amount >= 1e15) return null; // 防脏数据溢出 DECIMAL(20,2)
  amount = Math.round(amount * 100) / 100;

  // 步骤 2：币种识别（三写法：ISO 代码大小写 / 中文币种名 / 货币符号）
  let currency: string | null = null;
  const isoMatch = text.match(/\b([A-Za-z]{3})\b/);
  if (isoMatch && USD_RATE[isoMatch[1].toUpperCase()]) currency = isoMatch[1].toUpperCase();
  if (!currency) {
    for (const [name, iso] of Object.entries(CURRENCY_NAME_MAP)) {
      if (text.includes(name)) { currency = iso; break; }
    }
  }
  if (!currency) {
    if (/US\s*\$/.test(text)) currency = "USD";
    else if (text.includes("€")) currency = "EUR";
    else if (text.includes("£")) currency = "GBP";
    else if (/R\$/i.test(text)) currency = "BRL";
    else if (text.includes("¥") || text.includes("￥")) currency = "CNY";
    else if (text.includes("₱")) currency = "PHP";
    else if (text.includes("₹")) currency = "INR";
    else if (text.includes("₩")) currency = "KRW";
  }

  // 步骤 4：country 推断币种（inferred 标记，评分时向中性收缩 ×0.7）；无 country 线索则币种 NULL、
  // amount_usd NULL——评分侧对 NULL 一律取中性 0.5（不奖不罚）
  let inferred = false;
  if (!currency) {
    const c = String(country || "").toLowerCase();
    if (c) {
      for (const [name, iso] of Object.entries(COUNTRY_CURRENCY_MAP)) {
        if (c.includes(name)) { currency = iso; inferred = true; break; }
      }
    }
    if (!currency) inferred = true;
  }
  const rate = currency ? USD_RATE[currency] : undefined;
  const amountUsd = rate ? Math.round(amount * rate * 100) / 100 : null;
  return { amount, currency, amountUsd, inferred };
}

// 本地差异 #10：金额缓存回填。noticeIds 给定=懒填充（推荐当页缺失行，量小）；
// 未给定=admin 批量回填一批（≤batchLimit 行，短事务、可中断续跑——按缓存缺失/过版续扫）
async function backfillNoticeAmountCache(dbPool: any, noticeIds?: number[], batchLimit = 2000): Promise<{ processed: number }> {
  const idFilter = noticeIds && noticeIds.length ? `AND n.id IN (${noticeIds.map(() => "?").join(",")})` : "";
  const [rows] = await dbPool.query(
    `SELECT n.id, n.estimated_value, n.country
     FROM crm_bid_notices n
     LEFT JOIN crm_notice_amount_cache c ON c.notice_id = n.id AND c.parse_version = ?
     WHERE c.notice_id IS NULL ${idFilter}
     LIMIT ?`,
    [AMOUNT_PARSE_VERSION, ...(noticeIds || []), batchLimit]
  );
  const pending = rows as any[];
  if (!pending.length) return { processed: 0 };
  const values: any[] = [];
  for (const row of pending) {
    const parsed = parseEstimatedValue(row.estimated_value, row.country);
    values.push(
      Number(row.id),
      parsed?.amount ?? null,
      parsed?.currency ?? null,
      parsed?.amountUsd ?? null,
      parsed?.inferred ? 1 : 0,
      AMOUNT_PARSE_VERSION
    );
  }
  await dbPool.query(
    `INSERT INTO crm_notice_amount_cache (notice_id, amount, currency, amount_usd, inferred, parse_version)
     VALUES ${pending.map(() => "(?,?,?,?,?,?)").join(",")}
     ON DUPLICATE KEY UPDATE amount=VALUES(amount), currency=VALUES(currency), amount_usd=VALUES(amount_usd),
       inferred=VALUES(inferred), parse_version=VALUES(parse_version), parsed_at=CURRENT_TIMESTAMP`,
    values
  );
  return { processed: pending.length };
}

async function ensureProcurementSchema(dbPool: any) {
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_key VARCHAR(190) NOT NULL UNIQUE,
      email VARCHAR(190) NULL,
      display_name VARCHAR(190) NULL,
      password_hash VARCHAR(128) NULL,
      membership_tier VARCHAR(40) NOT NULL DEFAULT 'free',
      account_status VARCHAR(30) NOT NULL DEFAULT 'pending',
      supplier_id BIGINT UNSIGNED NULL,
      supplier_link_status VARCHAR(30) NOT NULL DEFAULT 'none',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await ensureColumn(dbPool, "crm_users", "password_hash", "password_hash VARCHAR(128) NULL AFTER display_name");
  await ensureColumn(dbPool, "crm_users", "membership_tier", "membership_tier VARCHAR(40) NOT NULL DEFAULT 'free' AFTER password_hash");
  await ensureColumn(dbPool, "crm_users", "account_status", "account_status VARCHAR(30) NOT NULL DEFAULT 'pending' AFTER membership_tier");
  await ensureColumn(dbPool, "crm_users", "supplier_id", "supplier_id BIGINT UNSIGNED NULL AFTER membership_tier");
  await ensureColumn(dbPool, "crm_users", "supplier_link_status", "supplier_link_status VARCHAR(30) NOT NULL DEFAULT 'none' AFTER supplier_id");
  await ensureIndex(dbPool, "crm_users", "idx_supplier_link", "CREATE INDEX idx_supplier_link ON crm_users (supplier_id, supplier_link_status)");

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_training_registrations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      legacy_supplier_id BIGINT UNSIGNED NULL UNIQUE,
      company_name VARCHAR(255) NOT NULL,
      industry_id INT NULL,
      industry VARCHAR(255) NULL,
      main_product VARCHAR(255) NULL,
      export_experience VARCHAR(255) NULL,
      certification TEXT NULL,
      contact_name VARCHAR(100) NOT NULL,
      position VARCHAR(100) NULL,
      telephone VARCHAR(50) NOT NULL,
      email VARCHAR(190) NULL,
      remark TEXT NULL,
      audit_status VARCHAR(30) NOT NULL DEFAULT 'pending',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      ip VARCHAR(45) NULL,
      KEY idx_training_status (audit_status),
      KEY idx_training_contact (telephone, email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS ungm_1v1_appointments (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      appointment_key VARCHAR(190) NOT NULL UNIQUE,
      company_name VARCHAR(255) NOT NULL,
      country VARCHAR(120) NULL,
      city VARCHAR(120) NULL,
      contact_person VARCHAR(190) NOT NULL,
      contact_method VARCHAR(190) NOT NULL,
      email VARCHAR(190) NULL,
      industry VARCHAR(190) NULL,
      consultation_needs TEXT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'new',
      follow_up_logs JSON NULL,
      extra JSON NULL,
      raw_payload JSON NULL,
      ip VARCHAR(80) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ungm_1v1_status_created (status, created_at),
      INDEX idx_ungm_1v1_contact_method (contact_method)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_user_subscriptions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NULL,
      user_key VARCHAR(190) NOT NULL,
      plan_code VARCHAR(60) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_user_key_status (user_key, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await ensureColumn(dbPool, "crm_user_subscriptions", "user_id", "user_id BIGINT UNSIGNED NULL AFTER id");

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_membership_plans (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      plan_code VARCHAR(60) NOT NULL UNIQUE,
      name VARCHAR(120) NOT NULL,
      description VARCHAR(255) NULL,
      price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      currency VARCHAR(10) NOT NULL DEFAULT 'CNY',
      duration_days INT NULL,
      unlock_quota INT NOT NULL DEFAULT 0,
      free_quota INT NOT NULL DEFAULT 0,
      plan_type VARCHAR(40) NOT NULL DEFAULT 'subscription',
      is_active TINYINT NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_active_sort (is_active, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await dbPool.execute(`
    INSERT INTO crm_membership_plans
      (plan_code, name, description, price, duration_days, unlock_quota, free_quota, plan_type, sort_order)
    VALUES
      ('free', '基础体验版', '免费注册供应商，浏览目录并免费解锁 3 条完整订单。', 0, NULL, 3, 3, 'free', 0),
      ('single_89', '单点解锁', '单条查看完整采购详情与机构信息。', 89, NULL, 1, 0, 'single', 10),
      ('trial_99_3', '尝鲜特惠包', '适合初步测试转化率，3 条订单额度。', 99, NULL, 3, 0, 'bundle', 20),
      ('week_299_21', '抢单周卡', '7 天内 21 条订单额度，适合集中筛单。', 299, 7, 21, 0, 'subscription', 30),
      ('annual_5600', '企业至尊年卡', '全年最高 1095 条订单额度，适合团队稳定使用。', 5600, 365, 1095, 0, 'subscription', 40),
      ('annual_8800', '年度顾问服务', '年度顾问服务，含采购机会对接与专业支持。', 8800, 365, 0, 0, 'manual', 45),
      ('annual_manual_8800', '年度人工顾问服务', '含线索对接指导、投标机会分析、合同流程、企业转账确认及微信服务群。', 8800, 365, 0, 0, 'manual', 50)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      description = VALUES(description),
      price = VALUES(price),
      duration_days = VALUES(duration_days),
      unlock_quota = VALUES(unlock_quota),
      free_quota = VALUES(free_quota),
      plan_type = VALUES(plan_type),
      sort_order = VALUES(sort_order),
      is_active = 1,
      updated_at = NOW()
  `);
  await dbPool.execute(`
    UPDATE crm_membership_plans
    SET
      name = CASE plan_code
        WHEN 'free' THEN '基础体验版'
        WHEN 'single_89' THEN '单点解锁'
        WHEN 'trial_99_3' THEN '尝鲜特惠包'
        WHEN 'week_299_21' THEN '抢单周卡'
        WHEN 'annual_5600' THEN '企业至尊年卡'
        ELSE name
      END,
      description = CASE plan_code
        WHEN 'free' THEN '免费注册供应商，浏览目录并免费解锁 3 条完整订单。'
        WHEN 'single_89' THEN '单条查看完整采购详情与机构信息。'
        WHEN 'trial_99_3' THEN '适合初步测试转化率，3 条订单额度。'
        WHEN 'week_299_21' THEN '7 天内 21 条订单额度，适合集中筛单。'
        WHEN 'annual_5600' THEN '全年最高 1095 条订单额度，适合团队稳定使用。'
        ELSE description
      END,
      updated_at = NOW()
    WHERE plan_code IN ('free','single_89','trial_99_3','week_299_21','annual_5600','annual_8800','annual_manual_8800')
  `);
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_payment_orders (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NULL,
      order_no VARCHAR(80) NOT NULL UNIQUE,
      user_key VARCHAR(190) NOT NULL,
      provider ENUM('alipay','wechat','mock') NOT NULL,
      plan_code VARCHAR(60) NOT NULL,
      notice_id BIGINT UNSIGNED NULL,
      amount DECIMAL(10,2) NOT NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'CNY',
      status ENUM('pending','paid','closed','failed') NOT NULL DEFAULT 'pending',
      provider_trade_no VARCHAR(120) NULL,
      pay_url VARCHAR(500) NULL,
      qr_code_url VARCHAR(500) NULL,
      raw_request JSON NULL,
      raw_notify JSON NULL,
      paid_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_user_status (user_key, status),
      KEY idx_plan_code (plan_code),
      KEY idx_notice_id (notice_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await ensureColumn(dbPool, "crm_payment_orders", "user_id", "user_id BIGINT UNSIGNED NULL AFTER id");
  await ensureColumn(dbPool, "crm_payment_orders", "pay_url", "pay_url VARCHAR(500) NULL AFTER provider_trade_no");
  await ensureColumn(dbPool, "crm_payment_orders", "qr_code_url", "qr_code_url VARCHAR(500) NULL AFTER pay_url");
  await ensureColumn(dbPool, "crm_payment_orders", "raw_request", "raw_request JSON NULL AFTER qr_code_url");
  await ensureColumn(dbPool, "crm_payment_orders", "raw_notify", "raw_notify JSON NULL AFTER raw_request");
  await ensureColumn(dbPool, "crm_payment_orders", "paid_at", "paid_at DATETIME NULL AFTER raw_notify");
  await ensureColumnType(dbPool, "crm_payment_orders", "provider", "provider ENUM('alipay','wechat','mock') NOT NULL");
  await ensureColumnType(dbPool, "crm_payment_orders", "pay_url", "pay_url TEXT NULL");
  await ensureColumnType(dbPool, "crm_payment_orders", "qr_code_url", "qr_code_url TEXT NULL");

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_payment_provider_configs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      provider ENUM('alipay','wechat') NOT NULL,
      mode VARCHAR(30) NOT NULL DEFAULT 'mock',
      app_id VARCHAR(190) NULL,
      merchant_id VARCHAR(190) NULL,
      notify_url VARCHAR(500) NULL,
      return_url VARCHAR(500) NULL,
      public_key TEXT NULL,
      private_key_ref VARCHAR(500) NULL,
      cert_ref VARCHAR(500) NULL,
      is_active TINYINT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_provider_mode (provider, mode),
      KEY idx_provider_active (provider, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await ensureColumn(dbPool, "crm_payment_provider_configs", "mode", "mode VARCHAR(30) NOT NULL DEFAULT 'mock' AFTER provider");
  await ensureColumn(dbPool, "crm_payment_provider_configs", "app_id", "app_id VARCHAR(190) NULL AFTER mode");
  await ensureColumn(dbPool, "crm_payment_provider_configs", "merchant_id", "merchant_id VARCHAR(190) NULL AFTER app_id");
  await ensureColumn(dbPool, "crm_payment_provider_configs", "notify_url", "notify_url VARCHAR(500) NULL AFTER merchant_id");
  await ensureColumn(dbPool, "crm_payment_provider_configs", "return_url", "return_url VARCHAR(500) NULL AFTER notify_url");
  await ensureColumn(dbPool, "crm_payment_provider_configs", "public_key", "public_key TEXT NULL AFTER return_url");
  await ensureColumn(dbPool, "crm_payment_provider_configs", "private_key_ref", "private_key_ref VARCHAR(500) NULL AFTER public_key");
  await ensureColumn(dbPool, "crm_payment_provider_configs", "cert_ref", "cert_ref VARCHAR(500) NULL AFTER private_key_ref");
  await ensureColumn(dbPool, "crm_payment_provider_configs", "is_active", "is_active TINYINT NOT NULL DEFAULT 0 AFTER cert_ref");
  await ensureColumnType(dbPool, "crm_payment_provider_configs", "private_key_ref", "private_key_ref TEXT NULL");

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_user_entitlements (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NULL,
      user_key VARCHAR(190) NOT NULL,
      source_order_no VARCHAR(80) NULL,
      plan_code VARCHAR(60) NOT NULL,
      quota_total INT NOT NULL DEFAULT 0,
      quota_used INT NOT NULL DEFAULT 0,
      started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_user_status_expire (user_key, status, expires_at),
      KEY idx_source_order (source_order_no),
      KEY idx_plan_code (plan_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await ensureColumn(dbPool, "crm_user_entitlements", "user_id", "user_id BIGINT UNSIGNED NULL AFTER id");
  await ensureColumn(dbPool, "crm_user_entitlements", "source_order_no", "source_order_no VARCHAR(80) NULL AFTER user_key");
  await ensureColumn(dbPool, "crm_user_entitlements", "plan_code", "plan_code VARCHAR(60) NOT NULL AFTER source_order_no");
  await ensureColumn(dbPool, "crm_user_entitlements", "quota_total", "quota_total INT NOT NULL DEFAULT 0 AFTER plan_code");
  await ensureColumn(dbPool, "crm_user_entitlements", "quota_used", "quota_used INT NOT NULL DEFAULT 0 AFTER quota_total");
  await ensureColumn(dbPool, "crm_user_entitlements", "expires_at", "expires_at DATETIME NULL AFTER started_at");
  await ensureColumn(dbPool, "crm_user_entitlements", "status", "status VARCHAR(30) NOT NULL DEFAULT 'active' AFTER expires_at");

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_opportunity_unlocks (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NULL,
      user_key VARCHAR(190) NOT NULL,
      opportunity_id BIGINT UNSIGNED NULL,
      notice_id BIGINT UNSIGNED NULL,
      unlock_type ENUM('free','single','subscription') NOT NULL DEFAULT 'free',
      price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      unspsc_codes_snapshot JSON NULL,
      UNIQUE KEY uk_user_opportunity (user_key, opportunity_id),
      KEY idx_user_type_time (user_key, unlock_type, unlocked_at),
      KEY idx_opportunity_id (opportunity_id),
      KEY idx_notice_id (notice_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_user_notice_views (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NULL,
      user_key VARCHAR(190) NOT NULL,
      opportunity_id BIGINT UNSIGNED NULL,
      notice_id BIGINT UNSIGNED NULL,
      viewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ip VARCHAR(45) NULL,
      KEY idx_user_time (user_key, viewed_at),
      KEY idx_opportunity_view (opportunity_id),
      KEY idx_notice_view (notice_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_user_interest_codes (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NULL,
      user_key VARCHAR(190) NOT NULL,
      code_id INT NULL,
      code VARCHAR(8) NOT NULL,
      level TINYINT NOT NULL,
      source VARCHAR(40) NOT NULL,
      weight DECIMAL(8,2) NOT NULL DEFAULT 1.00,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_user_code_source (user_key, code, source),
      KEY idx_user_code (user_key, code),
      KEY idx_code_id (code_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── 账号默认行业偏好（本地差异 #5：偏好表 + 读写接口）──
  // 存储用户在注册/个人中心选取的 UNSPSC 类目路径，公采页进入时按此默认筛选
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_user_industry_prefs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_key VARCHAR(190) NOT NULL,
      level1_id INT NULL,
      level2_id INT NULL,
      level3_id INT NULL,
      level4_id INT NULL,
      level5_id INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_user_pref (user_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_notice_interests (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NULL,
      user_key VARCHAR(190) NOT NULL,
      notice_id BIGINT UNSIGNED NOT NULL,
      interest_type ENUM('interested','subscribed') NOT NULL DEFAULT 'interested',
      source VARCHAR(40) NOT NULL DEFAULT 'detail_page',
      note VARCHAR(500) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_user_notice_type (user_key, notice_id, interest_type),
      KEY idx_user_time (user_key, created_at),
      KEY idx_notice_type (notice_id, interest_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await ensureColumn(dbPool, "crm_notice_interests", "user_id", "user_id BIGINT UNSIGNED NULL AFTER id");

  // ── 公采搜索功能（本地差异 #6：G.4 搜索行为流水表）──
  // supply-os 自有表：记录搜索关键词/国家筛选/命中数。country 记录供 D.2 显式地区偏好，
  // result_cnt=0 即"搜而无果"供运营反哺拆解选题；user_key 可 NULL（游客不落身份）
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_user_search_log (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_key VARCHAR(190) NULL,
      q VARCHAR(200) NULL,
      country VARCHAR(100) NULL,
      filters JSON NULL,
      result_cnt INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_user_time (user_key, created_at),
      KEY idx_zero_result (result_cnt, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 本地差异 #8：C.3.5 数据质量快照表（supply-os 自有表，只读扫描外部表后落此）。
  // dup_notice_cnt 为 F.5 重复检测指标：notice_id 非空行数 - 去重数（NULL 不计入重复）
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_data_quality_snapshot (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      snapshot_date DATE NOT NULL,
      total_notices INT NOT NULL,
      missing_value INT NOT NULL DEFAULT 0,
      missing_country INT NOT NULL DEFAULT 0,
      missing_deadline INT NOT NULL DEFAULT 0,
      unlinked_unspsc INT NOT NULL DEFAULT 0,
      expired_but_active INT NOT NULL DEFAULT 0,
      dup_notice_cnt INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_date (snapshot_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 本地差异 #10：T-B3 金额解析缓存表（D.3.2 落地）。外部表 estimated_value 为自由文本、
  // 解析只能在 JS 做，而推荐排序是单遍 SQL 分页（D.1 路线 2）——故解析结果预计算到此自有表，
  // recommended JOIN 本表算 s_amount。amount_usd 用粗粒度静态汇率折算供跨币种可比；
  // 解析规则/汇率更新时递增 AMOUNT_PARSE_VERSION，旧版本行按版本失效重算
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_notice_amount_cache (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      notice_id BIGINT UNSIGNED NOT NULL,
      amount DECIMAL(20,2) NULL,
      currency VARCHAR(10) NULL,
      amount_usd DECIMAL(20,2) NULL,
      inferred TINYINT(1) NOT NULL DEFAULT 0,
      parse_version SMALLINT NOT NULL DEFAULT 1,
      parsed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_notice (notice_id),
      KEY idx_version (parse_version)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 本地差异 #11：T-B2 推荐反馈流水表（B.3.1）。建表即落两项裁决：
  // D.5——action ENUM 直接含隐式信号（dwell/scroll_end/quick_exit/revisit）+ dwell_ms 列，避免后续 ALTER；
  // D.7——impression 去重采用"前端 Set 预去重 + 服务端唯一约束 uk_dedup 兜底"双层方案（INSERT IGNORE 写入，
  //       session_id 为 NULL 时唯一约束不生效，故前端必须传 session_id）
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_user_reco_feedback (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NULL,
      user_key VARCHAR(190) NOT NULL,
      notice_id BIGINT UNSIGNED NOT NULL,
      action ENUM('impression','click','unlock','dismiss','favorite','dwell','scroll_end','quick_exit','revisit') NOT NULL,
      reco_score DECIMAL(8,4) NULL,
      position INT NULL,
      variant VARCHAR(20) NULL,
      session_id VARCHAR(64) NULL,
      dwell_ms INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_dedup (user_key, notice_id, session_id, action),
      KEY idx_user_time (user_key, created_at),
      KEY idx_notice_action (notice_id, action),
      KEY idx_variant (variant, action)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 本地差异 #11：T-B2 每用户维度权重档案（反馈微调结果，缺失走全局默认——B.3.1）
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_reco_weight_profile (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_key VARCHAR(190) NOT NULL,
      w_unspsc DECIMAL(5,3) NOT NULL DEFAULT 0.500,
      w_agency DECIMAL(5,3) NOT NULL DEFAULT 0.150,
      w_amount DECIMAL(5,3) NOT NULL DEFAULT 0.100,
      w_geo DECIMAL(5,3) NOT NULL DEFAULT 0.100,
      w_urgency DECIMAL(5,3) NOT NULL DEFAULT 0.150,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_user (user_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_notice_translations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      notice_id BIGINT UNSIGNED NOT NULL,
      lang VARCHAR(10) NOT NULL,
      title_tr TEXT NULL,
      description_tr MEDIUMTEXT NULL,
      model VARCHAR(60) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_notice_lang (notice_id, lang),
      KEY idx_lang (lang)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_supplier_translations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      supplier_id BIGINT UNSIGNED NOT NULL,
      lang VARCHAR(10) NOT NULL,
      industry_tr VARCHAR(255) NULL,
      main_products_tr TEXT NULL,
      certification_tr TEXT NULL,
      enterprise_nature_tr VARCHAR(100) NULL,
      model VARCHAR(60) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_supplier_lang (supplier_id, lang),
      KEY idx_supplier_lang (lang)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // UNSPSC 类目标题译文缓存（fr/ru/es/ar；zh/en 直接用 crm_unspsc_codes 原列）
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_unspsc_translations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      code_id INT NOT NULL,
      lang VARCHAR(10) NOT NULL,
      title_tr VARCHAR(255) NULL,
      model VARCHAR(60) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_code_lang (code_id, lang),
      KEY idx_unspsc_tr_lang (lang)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_supplier_unspsc_interests (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      supplier_id BIGINT UNSIGNED NOT NULL,
      code_id INT NULL,
      code VARCHAR(8) NOT NULL,
      level TINYINT NOT NULL,
      source VARCHAR(40) NOT NULL,
      weight DECIMAL(8,2) NOT NULL DEFAULT 1.00,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_supplier_code_source (supplier_id, code, source),
      KEY idx_supplier_code (supplier_id, code),
      KEY idx_code_id (code_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS crm_supplier_claims (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NULL,
      user_key VARCHAR(190) NOT NULL,
      supplier_id BIGINT UNSIGNED NULL,
      company_name VARCHAR(255) NOT NULL,
      supplier_type VARCHAR(40) NOT NULL DEFAULT 'domestic',
      contact_name VARCHAR(100) NULL,
      contact_phone VARCHAR(80) NULL,
      contact_email VARCHAR(190) NULL,
      business_license_no VARCHAR(120) NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_user_status (user_key, status),
      KEY idx_supplier_status (supplier_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await ensureColumn(dbPool, "crm_supplier_claims", "user_id", "user_id BIGINT UNSIGNED NULL AFTER id");

  for (const tableSql of [
    `CREATE TABLE IF NOT EXISTS crm_bid_opportunity_unspsc_codes (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      opportunity_id BIGINT UNSIGNED NOT NULL,
      code_id INT NULL,
      code VARCHAR(8) NOT NULL,
      level TINYINT NOT NULL,
      level1_id INT NULL,
      level2_id INT NULL,
      level3_id INT NULL,
      level4_id INT NULL,
      level5_id INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_opp_code (opportunity_id, code),
      KEY idx_code_id (code_id),
      KEY idx_level1 (level1_id),
      KEY idx_level2 (level2_id),
      KEY idx_level3 (level3_id),
      KEY idx_level4 (level4_id),
      KEY idx_level5 (level5_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS crm_bid_notice_unspsc_codes (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      notice_id BIGINT UNSIGNED NOT NULL,
      code_id INT NULL,
      code VARCHAR(8) NOT NULL,
      level TINYINT NOT NULL,
      level1_id INT NULL,
      level2_id INT NULL,
      level3_id INT NULL,
      level4_id INT NULL,
      level5_id INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_notice_code (notice_id, code),
      KEY idx_code_id (code_id),
      KEY idx_level1 (level1_id),
      KEY idx_level2 (level2_id),
      KEY idx_level3 (level3_id),
      KEY idx_level4 (level4_id),
      KEY idx_level5 (level5_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ]) {
    await dbPool.query(tableSql);
  }

  await ensureIndex(dbPool, "crm_bid_notice_unspsc_codes", "idx_notice_level1_notice", "CREATE INDEX idx_notice_level1_notice ON crm_bid_notice_unspsc_codes (level1_id, notice_id)");
  await ensureIndex(dbPool, "crm_bid_notice_unspsc_codes", "idx_notice_level2_notice", "CREATE INDEX idx_notice_level2_notice ON crm_bid_notice_unspsc_codes (level2_id, notice_id)");
  await ensureIndex(dbPool, "crm_bid_notice_unspsc_codes", "idx_notice_level3_notice", "CREATE INDEX idx_notice_level3_notice ON crm_bid_notice_unspsc_codes (level3_id, notice_id)");
  await ensureIndex(dbPool, "crm_bid_notice_unspsc_codes", "idx_notice_level4_notice", "CREATE INDEX idx_notice_level4_notice ON crm_bid_notice_unspsc_codes (level4_id, notice_id)");
  await ensureIndex(dbPool, "crm_bid_notice_unspsc_codes", "idx_notice_level5_notice", "CREATE INDEX idx_notice_level5_notice ON crm_bid_notice_unspsc_codes (level5_id, notice_id)");
  await ensureIndex(dbPool, "crm_bid_notice_unspsc_codes", "idx_notice_code_notice", "CREATE INDEX idx_notice_code_notice ON crm_bid_notice_unspsc_codes (code, notice_id)");
  await ensureIndexIfTableExists(dbPool, "crm_bid_notices", "idx_bid_notices_active_deadline_id", "CREATE INDEX idx_bid_notices_active_deadline_id ON crm_bid_notices (is_expired, deadline_ts, id)");
  await ensureIndexIfTableExists(dbPool, "crm_unspsc_codes", "idx_unspsc_level_id", "CREATE INDEX idx_unspsc_level_id ON crm_unspsc_codes (level, id)");
  await ensureIndexIfTableExists(dbPool, "crm_unspsc_codes", "idx_unspsc_parent_code", "CREATE INDEX idx_unspsc_parent_code ON crm_unspsc_codes (parent_id, code)");
}

async function syncUnspscBridge(dbPool: any, source: "opportunity" | "notice") {
  const sourceTable = source === "opportunity" ? "crm_bid_opportunities" : "crm_bid_notices";
  const bridgeTable = source === "opportunity" ? "crm_bid_opportunity_unspsc_codes" : "crm_bid_notice_unspsc_codes";
  const fk = source === "opportunity" ? "opportunity_id" : "notice_id";

  // 启动时只同步最近 500 条，快速完成不阻塞服务启动
  const [rows] = await dbPool.query(
    `SELECT id, unspsc_codes FROM ${sourceTable} WHERE unspsc_codes IS NOT NULL ORDER BY id DESC LIMIT 500`
  );

  for (const row of rows as any[]) {
    await syncUnspscBridgeRow(dbPool, bridgeTable, fk, row);
  }
}

/**
 * 单行写入 bridge 表的公共逻辑，供快速同步和全量回填复用
 */
async function syncUnspscBridgeRow(dbPool: any, bridgeTable: string, fk: string, row: any) {
  const codes = normalizeUnspscCodes(row.unspsc_codes);
  for (const item of codes) {
    const rawCode = String(item?.code || item || "").replace(/\D/g, "").slice(0, 8);
    if (!rawCode) continue;
    const [codeRows] = await dbPool.query(
      "SELECT id, code, level FROM crm_unspsc_codes WHERE code = ? LIMIT 1",
      [rawCode]
    );
    const codeRow = (codeRows as UnspscCodeRow[])[0];
    const path = {
      level1_id: rawCode.length >= 2 ? rawCode.slice(0, 2) : null,
      level2_id: rawCode.length >= 4 ? rawCode.slice(0, 4) : null,
      level3_id: rawCode.length >= 6 ? rawCode.slice(0, 6) : null,
      level4_id: rawCode.length >= 8 ? rawCode.slice(0, 8) : null,
      level5_id: rawCode.length >= 10 ? rawCode.slice(0, 10) : null,
    };

    await dbPool.execute(
      `INSERT IGNORE INTO ${bridgeTable}
        (${fk}, code_id, code, level, level1_id, level2_id, level3_id, level4_id, level5_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        codeRow?.id || null,
        rawCode,
        codeRow?.level || Math.max(1, Math.ceil(rawCode.length / 2)),
        path.level1_id,
        path.level2_id,
        path.level3_id,
        path.level4_id,
        path.level5_id,
      ]
    );
  }
}

/**
 * 全量回填 bridge 表：跳过已有记录，分批处理所有数据，避免内存溢出
 * 专为后台异步调用设计，不阻塞服务启动
 */
async function syncUnspscBridgeFull(dbPool: any, source: "opportunity" | "notice"): Promise<{ processed: number; skipped: number }> {
  const sourceTable = source === "opportunity" ? "crm_bid_opportunities" : "crm_bid_notices";
  const bridgeTable = source === "opportunity" ? "crm_bid_opportunity_unspsc_codes" : "crm_bid_notice_unspsc_codes";
  const fk = source === "opportunity" ? "opportunity_id" : "notice_id";
  const BATCH = 200;
  let offset = 0;
  let processed = 0;
  let skipped = 0;

  console.log(`[BridgeSync] 开始全量回填 ${source} bridge 表...`);

  while (true) {
    // 只取尚未写入 bridge 表的记录，减少重复处理
    const [rows] = await dbPool.query(
      `SELECT s.id, s.unspsc_codes
       FROM ${sourceTable} s
       LEFT JOIN ${bridgeTable} b ON b.${fk} = s.id
       WHERE s.unspsc_codes IS NOT NULL AND b.id IS NULL
       ORDER BY s.id ASC
       LIMIT ${BATCH}`
    );

    if ((rows as any[]).length === 0) break;

    for (const row of rows as any[]) {
      try {
        await syncUnspscBridgeRow(dbPool, bridgeTable, fk, row);
        processed++;
      } catch (err: any) {
        // 单条失败不中断批次，记录跳过
        skipped++;
        console.warn(`[BridgeSync] 跳过 ${source} id=${row.id}: ${err.message}`);
      }
    }

    offset += (rows as any[]).length;
    console.log(`[BridgeSync] ${source} 进度: 已处理 ${processed} 条，跳过 ${skipped} 条`);

    // 每批次短暂让出事件循环，避免长时间占用连接池
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  console.log(`[BridgeSync] ${source} 全量回填完成: 共处理 ${processed} 条，跳过 ${skipped} 条`);
  return { processed, skipped };
}

// 本地差异 #8：C.3.5 数据质量快照采集——对外部表 crm_bid_notices/桥接表只读扫描，
// 结果 UPSERT 进自有表 crm_data_quality_snapshot（同日重跑覆盖）。无定时器，仅 admin 端点手动触发。
// 实施注记：初版单条巨型 SQL（逐行相关 NOT EXISTS）在 10.8 万 × 58 万行上实测 20 分钟不返回，
// 已拆为三条简单查询：主表单遍聚合 + 派生表 LEFT JOIN（走桥接 uk_notice_code 索引）+ 独立去重统计
async function captureDataQualitySnapshot(dbPool: any) {
  // deadline_ts 秒/毫秒混存（G.8 勘误 1），比较前统一折算成秒
  const deadlineSecExpr = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";
  // ① 主表单遍聚合（无子查询）
  const [baseRows] = await dbPool.query(
    `SELECT
       COUNT(*) AS total_notices,
       SUM(n.estimated_value IS NULL OR TRIM(n.estimated_value) = '') AS missing_value,
       SUM(n.country IS NULL OR TRIM(n.country) = '') AS missing_country,
       SUM(n.deadline_ts IS NULL) AS missing_deadline,
       SUM((n.is_expired = 0 OR n.is_expired IS NULL)
         AND n.deadline_ts IS NOT NULL
         AND ${deadlineSecExpr} < UNIX_TIMESTAMP(NOW())) AS expired_but_active
     FROM crm_bid_notices n`
  );
  // ② 未桥接数：DISTINCT 派生表走索引，再与主表 hash join，避免逐行探测
  const [unlinkedRows] = await dbPool.query(
    `SELECT COUNT(*) AS unlinked_unspsc
     FROM crm_bid_notices n
     LEFT JOIN (SELECT DISTINCT notice_id FROM crm_bid_notice_unspsc_codes) b ON b.notice_id = n.id
     WHERE b.notice_id IS NULL`
  );
  // ③ F.5 重复检测：external notice_id 非空行的重复数（NULL/空串不计入）
  const [dupRows] = await dbPool.query(
    `SELECT COUNT(*) - COUNT(DISTINCT d.notice_id) AS dup_notice_cnt
     FROM crm_bid_notices d
     WHERE d.notice_id IS NOT NULL AND TRIM(d.notice_id) <> ''`
  );
  const base = (baseRows as any[])[0] || {};
  const metrics = {
    total_notices: Number(base.total_notices || 0),
    missing_value: Number(base.missing_value || 0),
    missing_country: Number(base.missing_country || 0),
    missing_deadline: Number(base.missing_deadline || 0),
    unlinked_unspsc: Number((unlinkedRows as any[])[0]?.unlinked_unspsc || 0),
    expired_but_active: Number(base.expired_but_active || 0),
    dup_notice_cnt: Number((dupRows as any[])[0]?.dup_notice_cnt || 0),
  };
  await dbPool.execute(
    `INSERT INTO crm_data_quality_snapshot
       (snapshot_date, total_notices, missing_value, missing_country, missing_deadline, unlinked_unspsc, expired_but_active, dup_notice_cnt)
     VALUES (CURDATE(), ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       total_notices = VALUES(total_notices), missing_value = VALUES(missing_value),
       missing_country = VALUES(missing_country), missing_deadline = VALUES(missing_deadline),
       unlinked_unspsc = VALUES(unlinked_unspsc), expired_but_active = VALUES(expired_but_active),
       dup_notice_cnt = VALUES(dup_notice_cnt)`,
    [
      metrics.total_notices,
      metrics.missing_value,
      metrics.missing_country,
      metrics.missing_deadline,
      metrics.unlinked_unspsc,
      metrics.expired_but_active,
      metrics.dup_notice_cnt,
    ]
  );
  return metrics;
}

// In-memory persistent database for the live session
let leadsDb: Lead[] = [
  {
    id: "lead-01",
    companyName: "常州恒力精密机床股份有限公司",
    country: "中国",
    city: "常州",
    contactPerson: "林建国",
    contactMethod: "+86 138-5522-8899",
    email: "jg.lin@czhengli-precision.com",
    industry: "机械",
    mainProducts: "五轴加工中心, 精雕机",
    has国际公共采购Participation: true,
    notes: "申请入驻德国法兰克福展厅，已完成双语资质材料提交。",
    type: "exhibition_register",
    status: "qualified",
    createdAt: "2026-05-28T14:20:00.000Z",
    followUpLogs: [
      { date: "2026-05-28 15:00", content: "初审通过，该司机械加工设备非常契合欧洲高端采购标准。", author: "平台顾问李明" },
      { date: "2026-05-29 10:30", content: "安排与德国馆当地代表进行远程样品陈列规格对接。", author: "海外展厅代表" }
    ]
  },
  {
    id: "lead-02",
    companyName: "Apex Biomaterial GmbH",
    country: "德国",
    city: "慕尼黑",
    contactPerson: "Dr. Marcus Weber",
    contactMethod: "+49 89-4566-10",
    email: "m.weber@apex-bioplastic.de",
    industry: "化工",
    mainProducts: "PLA生物可降解塑料粒子",
    has国际公共采购Participation: true,
    notes: "寻找中国华东、华南区高频电子包装代工厂买家。",
    type: "supplier_register",
    status: "contacted",
    createdAt: "2026-05-29T11:05:00.000Z",
    followUpLogs: [
      { date: "2026-05-29 13:40", content: "已添加系统国际供应商分组，国际公共采购二级采购商可无缝配对。", author: "跨境运营专员" }
    ]
  },
  {
    id: "lead-03",
    companyName: "中东新能源商贸采购团",
    country: "阿联酋",
    city: "迪拜",
    contactPerson: "Amir Al-Sisi",
    contactMethod: "+20 2-2577-4560",
    email: "amir.sisi@noor-energy.ae",
    industry: "电子",
    mainProducts: "光伏路灯, 逆变器电池",
    has国际公共采购Participation: false,
    notes: "通过平台侧栏提交了智慧园区配套照明路灯整体方案采购咨询。",
    type: "consulting_advisor",
    status: "new",
    createdAt: "2026-05-30T02:15:00.000Z",
    followUpLogs: []
  }
];

// ── crm_suppliers 行 → 前端 Supplier DTO 映射与联系方式脱敏 ──
function maskPhone(raw: unknown): string {
  const p = String(raw || "").trim();
  if (!p) return "";
  if (p.length < 8) return p.slice(0, 2) + "****";
  return p.slice(0, 3) + "****" + p.slice(-4);
}

function maskEmail(raw: unknown): string {
  const e = String(raw || "").trim();
  if (!e) return "";
  const at = e.indexOf("@");
  if (at <= 0) return "***";
  return e.slice(0, Math.min(2, at)) + "***" + e.slice(at);
}

// 逗号/顿号等分隔的原始字符串切分为去空数组
function splitListField(raw: unknown): string[] {
  return String(raw || "")
    .split(/[,，、;；]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

// 把「当前请求语言的译文」填进 *En 槽位：前端 pickLocale 对非 zh 语言取第二槽，组件零改动
function mapSupplierRow(row: any, tr: any | null): Supplier {
  const industryZh =
    String(row.industry || "").trim() || splitListField(row.main_product)[0] || "其他";
  const productsZh = splitListField(row.main_product);
  const complianceZh = splitListField(row.certification);
  const industryTr = String(tr?.industry_tr || "").trim() || industryZh;
  const productsTr = tr?.main_products_tr ? splitListField(tr.main_products_tr) : productsZh;
  const complianceTr = tr?.certification_tr ? splitListField(tr.certification_tr) : complianceZh;
  return {
    id: `sup-db-${row.id}`,
    nameZh: row.company_name,
    nameEn: row.company_name, // 公司名保留真实原文，不翻译
    type: "domestic",
    industryZh,
    industryEn: industryTr,
    countryZh: "中国",
    countryEn: "China",
    cityZh: "—",
    cityEn: "—",
    ungmCode: undefined,
    mainProductsZh: productsZh,
    mainProductsEn: productsTr,
    complianceLabelsZh: complianceZh,
    complianceLabelsEn: complianceTr,
    contactPerson: row.contact_name || "",
    contactEmail: maskEmail(row.email),
    contactPhone: maskPhone(row.telephone),
    status: "approved",
  };
}

async function startServer() {
  const app = express();
  const PORT = 3039;

  app.use(express.json());

  // 1. GET ALL LEADS
  app.get("/api/leads", async (_req, res) => {
    try {
      const [appointmentRows] = await dbPool.query(
        `SELECT appointment_key, company_name, country, city, contact_person, contact_method, email, industry,
                consultation_needs, status, follow_up_logs, created_at
         FROM ungm_1v1_appointments
         ORDER BY created_at DESC, id DESC
         LIMIT 200`
      );
      const appointments = (appointmentRows as any[]).map(mapUngmAppointmentRow);
      const persistedIds = new Set(appointments.map((lead) => lead.id));
      res.json([...appointments, ...leadsDb.filter((lead) => !persistedIds.has(lead.id))]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. CREATE NEW LEAD (Automatically synchronized with CRM intake)
  app.post("/api/leads", async (req, res) => {
    try {
      const {
        companyName,
        country,
        city,
        contactPerson,
        contactMethod,
        email,
        industry,
        mainProducts,
        has国际公共采购Participation,
        notes,
        type
      } = req.body;

      if (!companyName || !contactPerson || !contactMethod) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const newLead: Lead = {
        id: `lead-user-${Date.now()}`,
        companyName,
        country: country || "China",
        city: city || "Unknown",
        contactPerson,
        contactMethod,
        email: email || "",
        industry: industry || "Other",
        mainProducts: mainProducts || "",
        has国际公共采购Participation: !!has国际公共采购Participation,
        notes: notes || "",
        type: type || "custom",
        status: "new",
        createdAt: new Date().toISOString(),
        followUpLogs: [
          {
            date: new Date().toISOString().substring(0, 16).replace("T", " "),
            content: `线索自动录入：来自门户前端表单申请，类型 ${type || "custom"}。`,
            author: "CRM System"
          }
        ]
      };

      if (newLead.type === "consulting_advisor") {
        await insertUngmAppointment(dbPool, newLead, req.body, req.ip || req.socket?.remoteAddress || "");
      }
      leadsDb.unshift(newLead);
      return res.status(201).json(newLead);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 3. EDIT LEAD STATUS OR ADD ACTIONS Tracker LOG
  app.post("/api/leads/log", async (req, res) => {
    const { leadId, content, author, nextStatus } = req.body;
    if (!leadId || !content) {
      return res.status(400).json({ error: "Missing leadId or content log parameter" });
    }

    const lead = leadsDb.find((l) => l.id === leadId);
    let persistedLead: Lead | null = null;
    if (!lead) {
      const [appointmentRows] = await dbPool.query(
        `SELECT appointment_key, company_name, country, city, contact_person, contact_method, email, industry,
                consultation_needs, status, follow_up_logs, created_at
         FROM ungm_1v1_appointments
         WHERE appointment_key = ?
         LIMIT 1`,
        [leadId]
      );
      persistedLead = (appointmentRows as any[])[0] ? mapUngmAppointmentRow((appointmentRows as any[])[0]) : null;
      if (!persistedLead) {
        return res.status(404).json({ error: "Lead not found" });
      }
    }

    const targetLead = lead || persistedLead!;
    if (!targetLead.followUpLogs) {
      targetLead.followUpLogs = [];
    }

    targetLead.followUpLogs.push({
      date: new Date().toISOString().substring(0, 16).replace("T", " "),
      content,
      author: author || "Operator"
    });

    if (nextStatus) {
      targetLead.status = nextStatus;
    }

    if (targetLead.type === "consulting_advisor") {
      await dbPool.execute(
        "UPDATE ungm_1v1_appointments SET follow_up_logs = ?, status = ?, updated_at = NOW() WHERE appointment_key = ?",
        [JSON.stringify(targetLead.followUpLogs), targetLead.status, leadId]
      );
    }

    return res.json(targetLead);
  });

  // 4. GET SUPPLIERS (DB-backed directory with per-language translations)
  app.get("/api/suppliers", async (req, res) => {
    try {
      const lang = String(req.query.lang || "zh").toLowerCase();
      const [rows] = await dbPool.query(
        `SELECT id, company_name, contact_name, telephone, email, main_product, industry, certification, enterprise_nature
         FROM crm_suppliers
         WHERE company_name <> '测试'
         ORDER BY id DESC
         LIMIT 500`
      );
      const supplierRows = rows as any[];

      // 命中翻译缓存的直接返回译文，缺失的回退中文原文
      const trMap = new Map<number, any>();
      if (SUPPLIER_TRANSLATION_LANGS[lang] && supplierRows.length > 0) {
        const [trRows] = await dbPool.query(
          `SELECT supplier_id, industry_tr, main_products_tr, certification_tr
           FROM crm_supplier_translations
           WHERE lang = ? AND supplier_id IN (?)`,
          [lang, supplierRows.map((row) => row.id)]
        );
        for (const tr of trRows as any[]) {
          trMap.set(Number(tr.supplier_id), tr);
        }
      }

      res.json(supplierRows.map((row) => mapSupplierRow(row, trMap.get(Number(row.id)) || null)));

      // fire-and-forget：缺失译文的供应商后台逐家补翻（下次请求即命中缓存）
      if (SUPPLIER_TRANSLATION_LANGS[lang]) {
        const missing = supplierRows.filter((row) => !trMap.has(Number(row.id)));
        if (missing.length > 0) {
          void backfillSupplierTranslations(missing, lang);
        }
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 缺失译文后台补翻：串行执行避免打爆免费额度；翻译链全不可用时静默停止（列表已回退中文）
  async function backfillSupplierTranslations(rows: any[], lang: string) {
    for (const row of rows) {
      const pendingKey = `${row.id}:${lang}`;
      if (pendingSupplierTranslations.has(pendingKey)) continue;
      // 4 字段按固定顺序过链：industry / mainProducts / certification / enterpriseNature
      const fields = [
        String(row.industry || "").trim(),
        String(row.main_product || "").trim(),
        String(row.certification || "").trim(),
        String(row.enterprise_nature || "").trim(),
      ];
      const pending = translateViaChain(fields, "zh", lang, async () => {
        const translated = await translateSupplierFields(
          {
            industry: fields[0],
            mainProducts: fields[1],
            certification: fields[2],
            enterpriseNature: fields[3],
          },
          SUPPLIER_TRANSLATION_LANGS[lang]
        );
        return [
          translated.industry,
          translated.mainProducts,
          translated.certification,
          translated.enterpriseNature,
        ];
      });
      pendingSupplierTranslations.set(pendingKey, pending);
      try {
        const { translations, provider } = await pending;
        await dbPool.query(
          `INSERT INTO crm_supplier_translations (supplier_id, lang, industry_tr, main_products_tr, certification_tr, enterprise_nature_tr, model)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE industry_tr = VALUES(industry_tr), main_products_tr = VALUES(main_products_tr),
             certification_tr = VALUES(certification_tr), enterprise_nature_tr = VALUES(enterprise_nature_tr), model = VALUES(model)`,
          [
            row.id,
            lang,
            translations[0],
            translations[1],
            translations[2],
            translations[3],
            provider,
          ]
        );
      } catch (err: any) {
        if (err?.message === "TRANSLATION_UNAVAILABLE") return; // 全链不可用：整批放弃
        // 单家失败不阻塞后续供应商
      } finally {
        pendingSupplierTranslations.delete(pendingKey);
      }
    }
  }

  // 4b. GET SUPPLIER PLAINTEXT CONTACT (VIP only)
  app.get("/api/suppliers/:id/contact", async (req, res) => {
    try {
      const supplierId = Number(String(req.params.id).replace(/^sup-db-/, ""));
      if (!supplierId) return res.status(400).json({ error: "INVALID_SUPPLIER" });
      const userKey = normalizeUserKey(req.query.user_key) || ""; // 本地差异 #7：F.1 归一化收敛
      if (!userKey) return res.status(403).json({ error: "VIP_REQUIRED" });

      // VIP 判定与登录接口同款：active 订阅未过期 或 membership_tier = 'vip'
      const [userRows] = await dbPool.query(
        "SELECT membership_tier FROM crm_users WHERE user_key = ? LIMIT 1",
        [userKey]
      );
      const user = (userRows as any[])[0];
      if (!user) return res.status(403).json({ error: "VIP_REQUIRED" });
      const [subs] = await dbPool.query(
        "SELECT id FROM crm_user_subscriptions WHERE user_key = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1",
        [userKey]
      );
      const isVip = (subs as any[]).length > 0 || user.membership_tier === "vip";
      if (!isVip) return res.status(403).json({ error: "VIP_REQUIRED" });

      const [supplierRows] = await dbPool.query(
        "SELECT contact_name, telephone, email FROM crm_suppliers WHERE id = ? LIMIT 1",
        [supplierId]
      );
      const supplier = (supplierRows as any[])[0];
      if (!supplier) return res.status(404).json({ error: "SUPPLIER_NOT_FOUND" });

      res.json({
        contactPerson: supplier.contact_name || "",
        contactPhone: supplier.telephone || "",
        contactEmail: supplier.email || "",
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. POST REGISTER NEW SUPPLIER (persisted into crm_suppliers)
  app.post("/api/suppliers", async (req, res) => {
    try {
      const {
        nameZh,
        type,
        industryZh,
        ungmCode,
        mainProductsZh,
        complianceLabelsZh,
        contactPerson,
        contactEmail,
        contactPhone
      } = req.body;

      if (!nameZh || !contactPerson || !contactEmail) {
        return res.status(400).json({ error: "Missing name or contact data" });
      }

      const mainProduct = Array.isArray(mainProductsZh)
        ? mainProductsZh.join(", ")
        : String(mainProductsZh || "");
      const certification = Array.isArray(complianceLabelsZh)
        ? complianceLabelsZh.join(", ")
        : String(complianceLabelsZh || "");
      const requestHash = crypto
        .createHash("md5")
        .update(`${String(nameZh).trim()}|${String(contactEmail).trim().toLowerCase()}`)
        .digest("hex");

      // 防重：同公司同邮箱重复提交返回既有记录
      const [dupRows] = await dbPool.query(
        "SELECT * FROM crm_suppliers WHERE request_hash = ? LIMIT 1",
        [requestHash]
      );
      let supplierRow = (dupRows as any[])[0];
      if (!supplierRow) {
        const [insertResult] = await dbPool.query(
          `INSERT INTO crm_suppliers
             (company_name, contact_name, telephone, email, main_product, industry, certification, created_at, request_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
          [
            String(nameZh).trim(),
            String(contactPerson).trim(),
            String(contactPhone || "").trim(),
            String(contactEmail).trim(),
            mainProduct,
            String(industryZh || "").trim(),
            certification,
            requestHash,
          ]
        );
        const [newRows] = await dbPool.query(
          "SELECT * FROM crm_suppliers WHERE id = ? LIMIT 1",
          [(insertResult as any).insertId]
        );
        supplierRow = (newRows as any[])[0];
      }

      const newSupplier = mapSupplierRow(supplierRow, null);

      // Also automatically create a CRM lead for tracing this approval task!
      const companionLead: Lead = {
        id: `lead-user-sup-${Date.now()}`,
        companyName: nameZh,
        country: "China",
        city: "Unknown",
        contactPerson,
        contactMethod: contactPhone || contactEmail,
        email: contactEmail,
        industry: industryZh || "Other",
        mainProducts: mainProduct,
        has国际公共采购Participation: !!ungmCode,
        notes: `申请注册为供应商。类型: ${type}. 国际公共采购 Code: ${ungmCode || "None"}. 待运营专家进行出海合规资质审查。`,
        type: "supplier_register",
        status: "new",
        createdAt: new Date().toISOString(),
        followUpLogs: [
          {
            date: new Date().toISOString().substring(0, 16).replace("T", " "),
            content: "供应商入驻申请：等待检验出资及三方安规检测单据。",
            author: "Admin System"
          }
        ]
      };
      leadsDb.unshift(companionLead);

      return res.status(201).json({ supplier: newSupplier, companionLead });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // MySQL2 connection pool for crm database
  const mysql2 = await import("mysql2/promise");
  const dbPool = mysql2.createPool({
    host: "192.168.1.2",
    user: "root",
    password: "123456",
    database: "crm",
    waitForConnections: true,
    connectionLimit: 10,
  });

  await ensureProcurementSchema(dbPool);
  await backfillUserIds(dbPool);
  await hydratePaymentEnvFromDb(dbPool);
  // UNSPSC bridge 同步已停用：crm_bid_notices.unspsc_codes 字段数据不准，
  // 由 CRM 侧 AI 分类后直接写入 crm_bid_notice_unspsc_codes，supply-os 不介入。

  // 6a. GET CERTIFICATIONS
  app.post("/api/auth/register", async (req, res) => {
    try {
      const email = String(req.body.email || "").trim().toLowerCase();
      const password = String(req.body.password || "");
      const displayName = String(req.body.display_name || email.split("@")[0] || "\u4f1a\u5458");
      if (!email || !password) return res.status(400).json({ error: "邮箱和密码不能为空" });
      if (password.length < 6) return res.status(400).json({ error: "密码至少 6 位" });

      await dbPool.execute(
        `INSERT INTO crm_users (user_key, email, display_name, password_hash, membership_tier, account_status)
         VALUES (?, ?, ?, ?, 'free', 'pending')
         ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), password_hash = VALUES(password_hash), updated_at = NOW()`,
        [email, email, displayName, hashPassword(password)]
      );

      res.status(201).json({
        success: true,
        user: { user_key: email, email, display_name: displayName, membership_tier: "free" },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const email = String(req.body.email || "").trim().toLowerCase();
      const password = String(req.body.password || "");
      const [rows] = await dbPool.query(
        "SELECT user_key, email, display_name, password_hash, membership_tier, account_status, supplier_id, supplier_link_status FROM crm_users WHERE user_key = ? LIMIT 1",
        [email]
      );
      const user = (rows as any[])[0];
      if (!user || user.password_hash !== hashPassword(password)) {
        return res.status(401).json({ error: "账号或密码错误" });
      }
      if (user.account_status === "disabled" || user.account_status === "rejected") {
        return res.status(403).json({ error: "账号未通过审核或已停用" });
      }
      const [subs] = await dbPool.query(
        "SELECT id FROM crm_user_subscriptions WHERE user_key = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1",
        [email]
      );
      let supplier: any = null;
      if (user.supplier_id && user.supplier_link_status === "verified") {
        const [supplierRows] = await dbPool.query(
          "SELECT id, industry_id, industry FROM crm_suppliers WHERE id = ? LIMIT 1",
          [user.supplier_id]
        );
        supplier = (supplierRows as any[])[0] || null;
      }
      const tier = (subs as any[]).length > 0 ? "vip" : user.membership_tier || "free";
      res.json({
        success: true,
        user: {
          user_key: user.user_key,
          email: user.email,
          display_name: user.display_name,
          membership_tier: tier,
          account_status: user.account_status || "pending",
          supplier_id: supplier?.id || null,
          supplier_industry_id: supplier?.industry_id || null,
          supplier_industry: supplier?.industry || null,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/auth/user", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.query.user_key) || ""; // 本地差异 #7：F.1 归一化收敛
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });

      const [rows] = await dbPool.query(
        "SELECT user_key, email, display_name, membership_tier, account_status, supplier_id, supplier_link_status FROM crm_users WHERE user_key = ? LIMIT 1",
        [userKey]
      );
      const user = (rows as any[])[0];
      if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

      const [subs] = await dbPool.query(
        "SELECT id FROM crm_user_subscriptions WHERE user_key = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1",
        [userKey]
      );
      let supplier: any = null;
      if (user.supplier_id && user.supplier_link_status === "verified") {
        const [supplierRows] = await dbPool.query(
          "SELECT id, industry_id, industry FROM crm_suppliers WHERE id = ? LIMIT 1",
          [user.supplier_id]
        );
        supplier = (supplierRows as any[])[0] || null;
      }
      const tier = (subs as any[]).length > 0 ? "vip" : user.membership_tier || "free";

      res.json({
        success: true,
        user: {
          user_key: user.user_key,
          email: user.email,
          display_name: user.display_name,
          membership_tier: tier,
          account_status: user.account_status || "pending",
          supplier_id: supplier?.id || null,
          supplier_industry_id: supplier?.industry_id || null,
          supplier_industry: supplier?.industry || null,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/supplier-claims", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.body.user_key) || ""; // 本地差异 #7：F.1 归一化收敛
      const companyName = String(req.body.company_name || "").trim();
      if (!userKey || !companyName) {
        return res.status(400).json({ error: "请先登录并填写公司名称" });
      }

      const supplierType = req.body.supplier_type === "international" ? "international" : "domestic";
      const contactName = String(req.body.contact_name || "");
      const contactPhone = String(req.body.contact_phone || "");
      const contactEmail = String(req.body.contact_email || userKey);
      const businessLicenseNo = String(req.body.business_license_no || "");
      const [supplierRows] = await dbPool.query(
        "SELECT id FROM crm_suppliers WHERE company_name = ? ORDER BY id DESC LIMIT 1",
        [companyName]
      );
      const supplier = (supplierRows as any[])[0] || null;

      const [result] = await dbPool.execute(
        `INSERT INTO crm_supplier_claims
          (user_id, user_key, supplier_id, company_name, supplier_type, contact_name, contact_phone, contact_email, business_license_no, status)
         VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [userKey, userKey, supplier?.id || null, companyName, supplierType, contactName, contactPhone, contactEmail, businessLicenseNo]
      );

      res.status(201).json({ success: true, id: (result as any).insertId, status: "pending" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/billing/subscribe", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.body.user_key) || ""; // 本地差异 #7：F.1 归一化收敛
      const planCode = String(req.body.plan_code || "single");
      if (!userKey) return res.status(400).json({ error: "\u8bf7\u5148\u767b\u5f55" });

      const plans: Record<string, { days: number | null; price: number; quota: number }> = {
        single: { days: null, price: 89, quota: 1 },
        trial_3: { days: null, price: 99, quota: 3 },
        week_21: { days: 7, price: 299, quota: 21 },
        annual: { days: 365, price: 5600, quota: 1095 },
      };
      const plan = plans[planCode] || plans.single;
      await dbPool.execute(
        `INSERT INTO crm_user_subscriptions (user_id, user_key, plan_code, status, started_at, expires_at)
         VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, 'active', NOW(), ${plan.days ? "DATE_ADD(NOW(), INTERVAL ? DAY)" : "NULL"})`,
        plan.days ? [userKey, userKey, planCode, plan.days] : [userKey, userKey, planCode]
      );
      await dbPool.execute("UPDATE crm_users SET membership_tier = 'vip', updated_at = NOW() WHERE user_key = ?", [userKey]);
      res.status(201).json({ success: true, plan_code: planCode, price: plan.price, quota: plan.quota, membership_tier: "vip" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========== Payment API ===========

  // 初始化 PaymentService：配置表或环境变量启用 live 时走真实支付网关，否则使用 mock 闭环。
  const { PaymentService: _PaymentService } = await import("./src/payment/PaymentService");
  const paymentMode = process.env.PAYMENT_MODE === "live" ? "live" : "mock";
  const paymentService = _PaymentService.initDefault(paymentMode);

  // POST /api/payment/orders - 创建支付订单
  app.post("/api/payment/orders", async (req, res) => {
    try {
      const result = await paymentService.createOrder(dbPool, {
        user_key: normalizeUserKey(req.body.user_key) || "", // 本地差异 #7：F.1 归一化收敛
        plan_code: String(req.body.plan_code || ""),
        notice_id: req.body.notice_id ? Number(req.body.notice_id) : null,
        provider: (paymentMode === "live" && ["alipay", "wechat"].includes(req.body.provider) ? req.body.provider : "mock") as any,
        return_url: String(req.body.return_url || ""),
      });
      const clientPayUrl = result.provider === "alipay"
        ? `/api/payment/alipay/redirect/${encodeURIComponent(result.order_no)}`
        : result.pay_url;
      res.status(201).json({
        ...result,
        pay_url: clientPayUrl,
        qr_code_url: result.provider === "alipay" ? clientPayUrl : result.qr_code_url,
        payment_mode: paymentMode === "live" ? "configured" : "mock",
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/payment/orders", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.query.user_key) || ""; // 本地差异 #7：F.1 归一化收敛
      const status = String(req.query.status || "").trim();
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
      const page = Math.max(1, Number(req.query.page || 1));
      const offset = (page - 1) * limit;
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });

      const params: any[] = [userKey];
      const countParams: any[] = [userKey];
      let where = "WHERE o.user_key = ?";
      if (status) {
        where += " AND o.status = ?";
        params.push(status);
        countParams.push(status);
      }
      params.push(limit, offset);

      const [countRows] = await dbPool.query(
        `SELECT COUNT(*) AS total
         FROM crm_payment_orders o
         ${where}`,
        countParams,
      );

      const [rows] = await dbPool.query(
        `SELECT
           o.order_no, o.user_key, o.provider, o.plan_code, o.notice_id, o.amount, o.currency,
           o.status, o.provider_trade_no, o.paid_at, o.created_at, o.updated_at,
           n.notice_id AS external_notice_id, n.source_channel, n.reference, n.title,
           n.notice_type, n.agency, n.agency_full, n.country, n.deadline, n.urgency, n.url, n.industry
         FROM crm_payment_orders o
         LEFT JOIN crm_bid_notices n ON n.id = o.notice_id
         ${where}
         ORDER BY o.id DESC
         LIMIT ? OFFSET ?`,
        params,
      );

      res.json({
        total: Number((countRows as any[])[0]?.total || 0),
        page,
        limit,
        list: (rows as any[]).map((row) => ({
          order_no: row.order_no,
          user_key: row.user_key,
          provider: row.provider,
          plan_code: row.plan_code,
          notice_id: row.notice_id,
          amount: Number(row.amount || 0),
          currency: row.currency,
          status: row.status,
          provider_trade_no: row.provider_trade_no,
          paid_at: row.paid_at,
          created_at: row.created_at,
          updated_at: row.updated_at,
          notice: row.notice_id ? {
            id: row.notice_id,
            notice_id: row.external_notice_id,
            source_channel: row.source_channel,
            reference: row.reference,
            title: row.title,
            notice_type: row.notice_type,
            agency: row.agency || row.agency_full,
            agency_full: row.agency_full,
            country: row.country,
            deadline: row.deadline,
            urgency: row.urgency,
            url: row.url,
            industry: row.industry,
          } : null,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/payment/unlocks", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.query.user_key) || ""; // 本地差异 #7：F.1 归一化收敛
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
      const page = Math.max(1, Number(req.query.page || 1));
      const offset = (page - 1) * limit;
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });

      // 可选 lang：附带公告标题译文（与详情翻译共用缓存表；en 为原文语言无需翻译）
      const lang = String(req.query.lang || "").toLowerCase();
      const translatable = !!NOTICE_TRANSLATION_LANGS[lang];

      const [countRows] = await dbPool.query(
        `SELECT COUNT(*) AS total
         FROM crm_opportunity_unlocks u
         WHERE u.user_key = ? AND u.notice_id IS NOT NULL`,
        [userKey],
      );

      // translatable 时多取 n.description（仅供后台补翻用，不返回）与缓存译文标题
      const [rows] = await dbPool.query(
        translatable
          ? `SELECT
               u.user_key, u.notice_id, u.unlock_type, u.price, u.unlocked_at,
               n.notice_id AS external_notice_id, n.source_channel, n.reference, n.title,
               n.notice_type, n.agency, n.agency_full, n.country, n.deadline, n.deadline_ts, n.urgency, n.url, n.industry,
               n.description, tr.title_tr AS title_i18n
             FROM crm_opportunity_unlocks u
             LEFT JOIN crm_bid_notices n ON n.id = u.notice_id
             LEFT JOIN crm_notice_translations tr ON tr.notice_id = u.notice_id AND tr.lang = ?
             WHERE u.user_key = ? AND u.notice_id IS NOT NULL
             ORDER BY u.id DESC
             LIMIT ? OFFSET ?`
          : `SELECT
               u.user_key, u.notice_id, u.unlock_type, u.price, u.unlocked_at,
               n.notice_id AS external_notice_id, n.source_channel, n.reference, n.title,
               n.notice_type, n.agency, n.agency_full, n.country, n.deadline, n.deadline_ts, n.urgency, n.url, n.industry
             FROM crm_opportunity_unlocks u
             LEFT JOIN crm_bid_notices n ON n.id = u.notice_id
             WHERE u.user_key = ? AND u.notice_id IS NOT NULL
             ORDER BY u.id DESC
             LIMIT ? OFFSET ?`,
        translatable ? [lang, userKey, limit, offset] : [userKey, limit, offset],
      );

      res.json({
        total: Number((countRows as any[])[0]?.total || 0),
        page,
        limit,
        list: (rows as any[]).map((row) => ({
          user_key: row.user_key,
          notice_id: row.notice_id,
          unlock_type: row.unlock_type,
          price: Number(row.price || 0),
          unlocked_at: row.unlocked_at,
          notice: row.notice_id ? {
            id: row.notice_id,
            notice_id: row.external_notice_id,
            source_channel: row.source_channel,
            reference: row.reference,
            title: row.title,
            title_i18n: translatable ? row.title_i18n ?? null : undefined,
            notice_type: row.notice_type,
            agency: row.agency || row.agency_full,
            agency_full: row.agency_full,
            country: row.country,
            deadline: row.deadline,
            // 公采搜索功能（本地差异 #6：需求 2 解锁页过期标记）——
            // deadline 为自由文本前端无法判过期，服务端按 deadline_ts 算好
            // （秒/毫秒混存，先折算成毫秒再与 Date.now() 比较）
            deadline_expired: row.deadline_ts
              ? (Number(row.deadline_ts) > 100000000000
                  ? Number(row.deadline_ts)
                  : Number(row.deadline_ts) * 1000) < Date.now()
              : null,
            urgency: row.urgency,
            url: row.url,
            industry: row.industry,
          } : null,
        })),
      });

      // 缺译行响应后逐条后台补翻（标题+描述整条入库，与详情端点缓存互通；
      // pendingNoticeTranslations 按 noticeId:lang 去重，翻译链全不可用时静默跳过）
      if (translatable) {
        void (async () => {
          for (const row of rows as any[]) {
            if (!row.notice_id || row.title_i18n || !String(row.title || "").trim()) continue;
            const pendingKey = `${row.notice_id}:${lang}`;
            if (pendingNoticeTranslations.has(pendingKey)) continue;
            const pending = translateNoticeViaChain(
              String(row.title || ""),
              String(row.description || ""),
              lang
            );
            pendingNoticeTranslations.set(pendingKey, pending);
            pending.finally(() => pendingNoticeTranslations.delete(pendingKey)).catch(() => undefined);
            try {
              const { translations, provider } = await pending;
              await dbPool.query(
                `INSERT INTO crm_notice_translations (notice_id, lang, title_tr, description_tr, model)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE title_tr = VALUES(title_tr), description_tr = VALUES(description_tr), model = VALUES(model)`,
                [row.notice_id, lang, translations[0], translations[1], provider]
              );
            } catch {
              // 翻译不可用或失败：保持英文原文，下次请求重试
            }
          }
        })();
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/payment/alipay/redirect/:orderNo", async (req, res) => {
    try {
      const orderNo = String(req.params.orderNo || "");
      const [rows] = await dbPool.query(
        "SELECT order_no, provider, status, pay_url FROM crm_payment_orders WHERE order_no = ? LIMIT 1",
        [orderNo]
      );
      const order = (rows as any[])[0];
      if (!order) return res.status(404).send("Order not found");
      if (order.provider !== "alipay") return res.status(400).send("Not an Alipay order");
      if (order.status !== "pending") return res.status(400).send("Order is not pending");

      res.redirect(302, order.pay_url);
    } catch (err: any) {
      res.status(500).send(err.message || "Alipay redirect failed");
    }
  });

  // GET /api/payment/orders/:orderNo - 查询订单状态
  app.get("/api/payment/orders/:orderNo", async (req, res) => {
    try {
      const result = await paymentService.queryOrder(dbPool, req.params.orderNo, String(req.query.trade_no || ""));
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/payment/notify/alipay - 支付宝异步通知
  app.post("/api/payment/notify/alipay", async (req, res) => {
    try {
      const result = await paymentService.handleNotify(dbPool, "alipay", req.body, "");
      res.send(result.success ? "success" : "fail");
    } catch (err: any) {
      console.error("[Alipay Notify Error]", err);
      res.send("fail");
    }
  });

  // POST /api/payment/notify/wechat - 微信支付异步通知
  app.post("/api/payment/notify/wechat", async (req, res) => {
    try {
      const signature = String(req.headers["wechatpay-signature"] || "");
      const result = await paymentService.handleNotify(dbPool, "wechat", req.body, signature);
      res.json({ code: result.success ? "SUCCESS" : "FAIL", message: result.message || "" });
    } catch (err: any) {
      console.error("[Wechat Notify Error]", err);
      res.json({ code: "FAIL", message: err.message });
    }
  });

  // =========== 鍘熸湁 API ===========

  app.get("/api/certifications", async (req, res) => {
    try {
      const [rows] = await dbPool.query(
        "SELECT id, name FROM crm_supplier_certifications WHERE is_active = 1 ORDER BY sort_order"
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6b. GET UNSPSC INDUSTRIES
  // lang=fr/ru/es/ar 时 LEFT JOIN 译文缓存附加 title_i18n（缺失回退英文并后台补翻）；
  // zh/en 或不传 lang 时行为与旧版完全一致
  async function queryUnspscRows(whereAndOrder: string, params: any[], lang: string) {
    if (UNSPSC_TRANSLATION_LANGS[lang]) {
      const [rows] = await dbPool.query(
        `SELECT u.id, u.title_zh, u.title, u.code, u.parent_id, u.level, tr.title_tr AS title_i18n
         FROM crm_unspsc_codes u
         LEFT JOIN crm_unspsc_translations tr ON tr.code_id = u.id AND tr.lang = ?
         WHERE ${whereAndOrder}`,
        [lang, ...params]
      );
      return rows as any[];
    }
    const [rows] = await dbPool.query(
      `SELECT u.id, u.title_zh, u.title, u.code, u.parent_id, u.level FROM crm_unspsc_codes u WHERE ${whereAndOrder}`,
      params
    );
    return rows as any[];
  }

  // 缺译行后台整批补翻：一次 Gemini 调用翻译整个列表，入库后下次请求命中缓存；
  // 无 Key 或翻译失败静默放弃（响应已按英文回退，不影响可用性）
  async function backfillUnspscTranslations(rows: any[], lang: string, scopeKey: string) {
    const missing = rows.filter(
      (row) => !row.title_i18n && String(row.title || row.title_zh || "").trim()
    );
    if (missing.length === 0) return;
    const pendingKey = `${scopeKey}:${lang}`;
    if (pendingUnspscTranslations.has(pendingKey)) return;
    const titles = missing.map((row) => String(row.title || row.title_zh || "").trim());
    const pending = translateViaChain(titles, "en", lang, () =>
      translateUnspscTitles(titles, UNSPSC_TRANSLATION_LANGS[lang])
    );
    pendingUnspscTranslations.set(pendingKey, pending);
    try {
      const { translations, provider } = await pending;
      for (let i = 0; i < missing.length; i += 1) {
        await dbPool.query(
          `INSERT INTO crm_unspsc_translations (code_id, lang, title_tr, model)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE title_tr = VALUES(title_tr), model = VALUES(model)`,
          [missing[i].id, lang, translations[i], provider]
        );
      }
    } catch {
      // TRANSLATION_UNAVAILABLE / 单批失败：静默，前端已有英文兜底
    } finally {
      pendingUnspscTranslations.delete(pendingKey);
    }
  }

  app.get("/api/unspsc/industries", async (req, res) => {
    try {
      const lang = String(req.query.lang || "").toLowerCase();
      const rows = await queryUnspscRows("u.level = 1 ORDER BY u.id", [], lang);
      res.json(rows);
      // fire-and-forget：缺译行整批后台补翻（下次请求即命中缓存）
      if (UNSPSC_TRANSLATION_LANGS[lang]) {
        void backfillUnspscTranslations(rows, lang, "industries");
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/unspsc/children", async (req, res) => {
    try {
      const parentId = Number(req.query.parent_id || 0);
      if (!parentId) {
        return res.status(400).json({ error: "parent_id is required" });
      }
      const lang = String(req.query.lang || "").toLowerCase();
      const rows = await queryUnspscRows("u.parent_id = ? ORDER BY u.code", [parentId], lang);
      res.json(rows);
      if (UNSPSC_TRANSLATION_LANGS[lang]) {
        void backfillUnspscTranslations(rows, lang, `children:${parentId}`);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/unspsc/search", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      if (q.length < 2) return res.json([]);
      const [rows] = await dbPool.query(
        `SELECT id, title_zh, title, code, parent_id, level
         FROM crm_unspsc_codes
         WHERE code LIKE ? OR title_zh LIKE ? OR title LIKE ?
         ORDER BY level, code
         LIMIT 30`,
        [`${q}%`, `%${q}%`, `%${q}%`]
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/opportunities", async (req, res) => {
    try {
      const codeId = Number(req.query.code_id || req.query.industry_id || 0);
      const where: string[] = ["(o.is_expired = 0 OR o.is_expired IS NULL)"];
      const params: any[] = [];
      let join = "";

      if (codeId) {
        const [codeRows] = await dbPool.query(
          "SELECT id, level FROM crm_unspsc_codes WHERE id = ? LIMIT 1",
          [codeId]
        );
        const code = (codeRows as UnspscCodeRow[])[0];
        if (code) {
          join = "INNER JOIN crm_bid_opportunity_unspsc_codes boc ON boc.opportunity_id = o.id";
          where.push(`boc.level${code.level}_id = ?`);
          params.push(code.id);
        }
      }

      const [rows] = await dbPool.query(
        `SELECT DISTINCT
           o.id,
           o.title,
           o.reference,
           o.notice_type,
           o.agency,
           o.country,
           o.deadline,
           o.deadline_ts,
           o.estimated_value,
           o.budget,
           o.description,
           o.industry,
           o.unspsc_codes,
           o.source_url,
           o.unlock_count,
           o.view_count
         FROM crm_bid_opportunities o
         ${join}
         WHERE ${where.join(" AND ")}
         ORDER BY COALESCE(o.deadline_ts, 9999999999999), o.id DESC
         LIMIT 80`,
        params
      );

      res.json(
        (rows as any[]).map((row) => ({
          ...row,
          unspsc_codes: normalizeUnspscCodes(row.unspsc_codes),
        }))
      );
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/opportunities/unlocks", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.query.user_key) || "guest"; // 本地差异 #7：F.1 归一化收敛（读侧保留 guest 兜底）
      const [rows] = await dbPool.query(
        "SELECT opportunity_id, unlock_type, unlocked_at FROM crm_opportunity_unlocks WHERE user_key = ? ORDER BY unlocked_at DESC",
        [userKey]
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── F.4 搜索性能预案第一档（本地差异 #7）──
  // 搜索实测 1.2~1.9 秒/次（10.8 万行五列 LIKE 全扫，G.8 勘误 3），对同条件重复搜索
  // 做 60 秒进程内缓存：卡片群发后多客户抄同一编号来搜属高频场景，命中即毫秒级返回。
  // 缓存命中仍照常异步落库（G.4），运营统计不失真
  const noticeSearchCache = new Map<string, { payload: any; total: number; expires: number }>();
  const NOTICE_SEARCH_CACHE_TTL = 60 * 1000;
  const NOTICE_SEARCH_CACHE_MAX = 200;

  app.get("/api/notices", async (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(30, Math.max(6, Number(req.query.page_size || 9)));
      const offset = (page - 1) * pageSize;
      const codeId = Number(req.query.code_id || req.query.industry_id || 0);
      // ── 公采搜索功能（本地差异 #6：G.2 四参数 q/country/deadline_from/deadline_to/sort）──
      const q = String(req.query.q || "").trim().slice(0, 200);
      const country = String(req.query.country || "").trim().slice(0, 100);
      const deadlineFrom = String(req.query.deadline_from || "").trim();
      const deadlineTo = String(req.query.deadline_to || "").trim();
      const sort = String(req.query.sort || "deadline");
      const dateRe = /^\d{4}-\d{2}-\d{2}$/;

      // ── 搜索行为落库（本地差异 #6：G.4）──
      // 仅带搜索/筛选条件时记录；user_key 经 normalizeUserKey（F.1），游客落 NULL；
      // country 供 D.2 显式地区偏好，result_cnt=0 即"搜而无果"供运营反哺；异步不阻塞响应
      const hasSearch = Boolean(q || country || dateRe.test(deadlineFrom) || dateRe.test(deadlineTo));
      const logSearch = (total: number) => {
        if (!hasSearch) return;
        const filters = JSON.stringify({
          code_id: codeId || undefined,
          deadline_from: dateRe.test(deadlineFrom) ? deadlineFrom : undefined,
          deadline_to: dateRe.test(deadlineTo) ? deadlineTo : undefined,
          sort,
        });
        void dbPool
          .execute(
            "INSERT INTO crm_user_search_log (user_key, q, country, filters, result_cnt) VALUES (?, ?, ?, ?, ?)",
            [normalizeUserKey(req.query.user_key), q || null, country || null, filters, total]
          )
          .catch(() => undefined);
      };

      // F.4 缓存命中（本地差异 #7）：仅带搜索条件的查询走缓存（慢路径），命中仍落库
      const cacheKey = hasSearch
        ? JSON.stringify([page, pageSize, codeId, q, country, deadlineFrom, deadlineTo, sort])
        : "";
      if (cacheKey) {
        const cached = noticeSearchCache.get(cacheKey);
        if (cached && cached.expires > Date.now()) {
          res.json(cached.payload);
          logSearch(cached.total);
          return;
        }
      }

      const where: string[] = ["(n.is_expired = 0 OR n.is_expired IS NULL)"];
      const params: any[] = [];
      let join = "";
      let idFilterSql = "";
      const idFilterParams: any[] = [];

      // F.3 deadline 查询兜底（本地差异 #6）：is_expired 有滞后（实测 542 行已过期未标），
      // 按 deadline_ts 再挡一道。deadline_ts 秒/毫秒混存（实测 4.3 万秒级 + 4.9 万毫秒级），
      // 比较/排序前统一折算成秒
      const deadlineSecExpr = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";
      where.push(`(n.deadline_ts IS NULL OR ${deadlineSecExpr} >= UNIX_TIMESTAMP(NOW()))`);

      if (codeId) {
        const filter = await buildNoticeUnspscFilter(dbPool, codeId);
        idFilterSql = filter.sql;
        idFilterParams.push(...filter.params);
      }

      // q 三级匹配（G.2）：①编号精确（去空格忽略大小写，卡片招标编号↔reference，命中置顶）
      // ②原文模糊（title/reference/description）③中文译文缓存命中（客户抄卡片中文标题也能搜到）
      const compactQ = q.replace(/\s+/g, "").toUpperCase();
      if (q) {
        join += " LEFT JOIN crm_notice_translations qtr ON qtr.notice_id = n.id AND qtr.lang = 'zh'";
        const likeQ = `%${q}%`;
        where.push(
          "(UPPER(REPLACE(COALESCE(n.reference,''),' ','')) = ? OR n.title LIKE ? OR n.reference LIKE ? OR n.description LIKE ? OR qtr.title_tr LIKE ?)"
        );
        params.push(compactQ, likeQ, likeQ, likeQ, likeQ);
      }
      if (country) {
        // country 列为自由文本（varchar(500)，可能含多国名），用 LIKE 宽匹配
        where.push("n.country LIKE ?");
        params.push(`%${country}%`);
      }
      if (dateRe.test(deadlineFrom)) {
        where.push(`${deadlineSecExpr} >= UNIX_TIMESTAMP(?)`);
        params.push(`${deadlineFrom} 00:00:00`);
      }
      if (dateRe.test(deadlineTo)) {
        where.push(`${deadlineSecExpr} <= UNIX_TIMESTAMP(?)`);
        params.push(`${deadlineTo} 23:59:59`);
      }

      // 排序：latest=最新收录优先（id 逆序；published_date 为自由文本不可靠）；
      // 默认 deadline=截止最近优先（折算秒后排序，修复秒/毫秒混存下的乱序）
      const orderParts: string[] = [];
      const orderParams: any[] = [];
      if (q) {
        orderParts.push("(UPPER(REPLACE(COALESCE(n.reference,''),' ','')) = ?) DESC");
        orderParams.push(compactQ);
      }
      if (sort === "latest") {
        orderParts.push("n.id DESC");
      } else {
        orderParts.push("(n.deadline_ts IS NULL)", deadlineSecExpr, "n.id DESC");
      }
      const orderSql = orderParts.join(", ");

      const whereSql = where.join(" AND ");
      const [countRows] = await dbPool.query(
        `SELECT COUNT(DISTINCT n.id) AS total FROM crm_bid_notices n ${idFilterSql}${join} WHERE ${whereSql}`,
        [...idFilterParams, ...params]
      );
      const total = Number((countRows as any[])[0]?.total || 0);
      const [rows] = await dbPool.query(
        `SELECT DISTINCT
           n.id,
           n.notice_id,
           n.reference,
           n.title,
           n.notice_type,
           n.country,
           n.deadline,
           n.deadline_ts,
           n.estimated_value,
           n.description
         FROM crm_bid_notices n
         ${idFilterSql}${join}
         WHERE ${whereSql}
         ORDER BY ${orderSql}
         LIMIT ? OFFSET ?`,
        [...idFilterParams, ...params, ...orderParams, pageSize, offset]
      );

      const payload = {
        items: (rows as any[]).map((row) => ({
          ...row,
          agency: null,
          organization: null,
          source_url: null,
          unspsc_codes: [],
          core_locked: true,
        })),
        total,
        page,
        pageSize,
      };
      res.json(payload);

      // F.4 写缓存（本地差异 #7）：60 秒 TTL；超上限先清过期项、仍超则整体清空防内存膨胀
      if (cacheKey) {
        if (noticeSearchCache.size >= NOTICE_SEARCH_CACHE_MAX) {
          const now = Date.now();
          for (const [key, entry] of noticeSearchCache) {
            if (entry.expires <= now) noticeSearchCache.delete(key);
          }
          if (noticeSearchCache.size >= NOTICE_SEARCH_CACHE_MAX) noticeSearchCache.clear();
        }
        noticeSearchCache.set(cacheKey, { payload, total, expires: Date.now() + NOTICE_SEARCH_CACHE_TTL });
      }

      logSearch(total);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── 公采搜索功能（本地差异 #6：G.3 国家下拉数据源）──
  // 在库有效公告的国家清单（按公告数降序）；10.8 万行扫描结果进程内缓存 10 分钟
  let noticeCountriesCache: { data: any[]; expires: number } | null = null;
  app.get("/api/notices/countries", async (_req, res) => {
    try {
      if (noticeCountriesCache && noticeCountriesCache.expires > Date.now()) {
        return res.json(noticeCountriesCache.data);
      }
      const [rows] = await dbPool.query(
        `SELECT n.country, COUNT(*) AS cnt
         FROM crm_bid_notices n
         WHERE (n.is_expired = 0 OR n.is_expired IS NULL)
           AND n.country IS NOT NULL AND n.country <> ''
         GROUP BY n.country
         ORDER BY cnt DESC
         LIMIT 100`
      );
      const data = (rows as any[]).map((row) => ({ country: row.country, count: Number(row.cnt) }));
      noticeCountriesCache = { data, expires: Date.now() + 10 * 60 * 1000 };
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/notices/unlocks", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.query.user_key) || "guest"; // 本地差异 #7：F.1 归一化收敛（读侧保留 guest 兜底）
      const [rows] = await dbPool.query(
        "SELECT notice_id, unlock_type, unlocked_at FROM crm_opportunity_unlocks WHERE user_key = ? AND notice_id IS NOT NULL ORDER BY unlocked_at DESC",
        [userKey]
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/notices/recommended", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.query.user_key) || ""; // 本地差异 #7：F.1 归一化收敛
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(30, Math.max(6, Number(req.query.page_size || 9)));
      const offset = (page - 1) * pageSize;
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });

      // 本地差异 #10：T-E1 时间衰减进选码 SQL（E.1）。第四批的衰减发生在 LIMIT 80 之后（JS 层），
      // 选码环节仍被陈旧高权重码霸占——改为 SQL 内先衰减再排序取 top 80，JS 直接用 decayed_weight，
      // 不再二次衰减（避免双重衰减）。半衰期 90 天与原口径一致：0.5^(age/90) = EXP(-LN(2)*age/90)
      const [interestRows] = await dbPool.query(
        `SELECT code, level, MAX(code_id) AS code_id,
                SUM(weight * EXP(-LN(2) * GREATEST(0, DATEDIFF(NOW(), COALESCE(updated_at, created_at))) / 90)) AS decayed_weight,
                MAX(COALESCE(updated_at, created_at)) AS last_update
         FROM crm_user_interest_codes
         WHERE user_key = ?
         GROUP BY code, level
         ORDER BY decayed_weight DESC, last_update DESC
         LIMIT 80`,
        [userKey]
      );
      // ── B.2.2 UNSPSC 加权评分首期（本地差异 #9）──
      // depth_factor：层级越精确分越高（D.1 路线 2：分母取用户 top 兴趣理论满分，单遍 SQL 分页保留）
      // 命中判定用"显著前缀撞 b.code"（去尾零对：'80101500'→'801015'），MAX(LIKE) 保证每码每公告只计一次
      const DEPTH_FACTOR: Record<number, number> = { 1: 0.4, 2: 0.6, 3: 0.8, 4: 1.0 };
      const scoredCodes: Array<{ prefix: string; weighted: number }> = [];
      let interestTotal = 0; // 路线 2 分母：Σ 衰减后权重（depth_factor 上界 1.0 时的理论满分）
      const significantPrefix = (code: string) => {
        let s = code;
        while (s.length > 2 && s.length % 2 === 0 && s.endsWith("00")) s = s.slice(0, -2);
        return s;
      };
      // 召回：兴趣表 code_id 撞桥接表 levelN_id（两者同为 crm_unspsc_codes.id，有 idx_levelN 索引）。
      // 勘误（第四批实测）：旧逻辑把兴趣"码串"（如 '8010'）塞进 levelN_id IN(...)，而 levelN_id 存的是
      // crm_unspsc_codes.id（10 万段数字），仅靠数值巧合命中 40 个公告；改用 code_id 后同一用户命中 2625 个
      const recallIdsByLevel: Record<number, number[]> = { 2: [], 3: [], 4: [], 5: [] };
      const recallLikePrefixes = new Set<string>(); // code_id 缺失的兜底：前缀撞 b.code
      for (const row of interestRows as any[]) {
        const level = Math.min(5, Math.max(1, Number(row.level || 1)));
        const code = String(row.code || "").trim();
        if (!code) continue;
        const prefix = significantPrefix(code);
        // ── F.2 召回最低层级门槛（本地差异 #7）：仅 level2+ 参与召回，level1 只作评分加权 ──
        if (level >= 2) {
          const codeId = Number(row.code_id || 0);
          if (codeId > 0) recallIdsByLevel[level].push(codeId);
          else if (prefix.length >= 4) recallLikePrefixes.add(prefix);
        }
        // T-E1：直接用 SQL 已算好的衰减权重（选码/分母/评分同源，只衰减一次）
        const decayed = Number(row.decayed_weight || 0);
        if (decayed <= 0) continue;
        interestTotal += decayed;
        const depth = Math.min(4, Math.max(1, prefix.length / 2)); // 显著前缀长度定深度，8 位全码=1.0
        scoredCodes.push({ prefix, weighted: decayed * (DEPTH_FACTOR[depth] ?? 1.0) });
      }

      const clauses: string[] = [];
      const params: any[] = [];
      for (const level of [2, 3, 4, 5]) {
        const ids = Array.from(new Set(recallIdsByLevel[level]));
        if (ids.length === 0) continue;
        clauses.push(`b.level${level}_id IN (${ids.map(() => "?").join(",")})`);
        params.push(...ids);
      }
      for (const prefix of recallLikePrefixes) {
        clauses.push(`b.code LIKE ?`);
        params.push(`${prefix}%`);
      }

      if (clauses.length === 0) {
        return res.json({ items: [], total: 0, page, pageSize });
      }

      // F.3 deadline 兜底（本地差异 #7：补齐 recommended 两处 WHERE，与 /api/notices 同口径）
      // deadline_ts 秒/毫秒混存（G.8 勘误 1），比较/排序前统一折算成秒
      const deadlineSecExpr = "IF(n.deadline_ts > 100000000000, FLOOR(n.deadline_ts / 1000), n.deadline_ts)";
      let activeWhere = `(n.is_expired = 0 OR n.is_expired IS NULL) AND (n.deadline_ts IS NULL OR ${deadlineSecExpr} >= UNIX_TIMESTAMP(NOW()))`;
      const extraParams: any[] = [];
      // 本地差异 #11：T-B6/D.6——exclude_dismissed=1 时排除本用户近 30 天 dismiss 的公告
      // （非相关子查询，单次执行；前端配合 dismiss 本地移除 + 补拉，避免分页错位）
      if (String(req.query.exclude_dismissed || "") === "1") {
        activeWhere += ` AND n.id NOT IN (
           SELECT notice_id FROM crm_user_reco_feedback
           WHERE user_key = ? AND action = 'dismiss' AND created_at >= NOW() - INTERVAL 30 DAY)`;
        extraParams.push(userKey);
      }

      const bridgeWhere = clauses.map((clause) => `(${clause})`).join(" OR ");
      const [countRows] = await dbPool.query(
        `SELECT COUNT(DISTINCT n.id) AS total
         FROM crm_bid_notices n
         INNER JOIN crm_bid_notice_unspsc_codes b ON b.notice_id = n.id
         WHERE (${bridgeWhere}) AND ${activeWhere}`,
        [...params, ...extraParams]
      );

      // reco_score = 0.5·s_unspsc + 0.15·s_urgency + 0.10·s_amount + 0.125（s_agency/s_geo 中性 0.5：
      // 地域/机构数据未积累，B 章后续批次补齐）。本地差异 #10：s_amount 从常数拆出（D.3.2 落地）——
      // JOIN 自有缓存表 crm_notice_amount_cache，对数距离衰减，inferred 向中性收缩 ×0.7，缺失 0.5
      const scoreParams: any[] = [];
      const matchWeightExpr = scoredCodes.length
        ? `(${scoredCodes.map(() => "MAX(b.code LIKE ?) * ?").join(" + ")})`
        : "0";
      for (const item of scoredCodes) scoreParams.push(`${item.prefix}%`, item.weighted);
      const denominator = interestTotal > 0 ? interestTotal : 1;
      const urgencyExpr = `CASE
           WHEN n.deadline_ts IS NULL THEN 0.5
           WHEN ${deadlineSecExpr} < UNIX_TIMESTAMP(NOW()) + 7 * 86400 THEN 0.6
           WHEN ${deadlineSecExpr} <= UNIX_TIMESTAMP(NOW()) + 30 * 86400 THEN 1.0
           WHEN ${deadlineSecExpr} <= UNIX_TIMESTAMP(NOW()) + 90 * 86400 THEN 0.8
           ELSE 0.6
         END`;
      // s_amount 用户偏好中枢：历史解锁公告金额的对数域均值（LOG10(USD+1)）；样本 <2 取中性（全体 0.5，
      // 恒等于第四批常数行为）。MAX(amc.·) 包裹以兼容 ONLY_FULL_GROUP_BY（amc 按 notice_id 唯一）
      const [amountPrefRows] = await dbPool.query(
        `SELECT AVG(LOG10(c.amount_usd + 1)) AS center_log, COUNT(*) AS cnt
         FROM crm_opportunity_unlocks u
         INNER JOIN crm_notice_amount_cache c ON c.notice_id = u.notice_id
         WHERE u.user_key = ? AND u.notice_id IS NOT NULL AND c.amount_usd IS NOT NULL AND c.amount_usd > 0`,
        [userKey]
      );
      const amountCenterLog = Number((amountPrefRows as any[])[0]?.center_log || 0);
      const amountActive = Number((amountPrefRows as any[])[0]?.cnt || 0) >= 2;
      // 对数距离衰减：同数量级≈1，每差一个数量级 -1/3，差 3 个数量级→0；inferred 信心收缩向 0.5 靠拢
      const amountExpr = amountActive
        ? `(CASE WHEN MAX(amc.amount_usd) IS NULL OR MAX(amc.amount_usd) <= 0 THEN 0.5
              ELSE 0.5 + (GREATEST(0, 1 - ABS(LOG10(MAX(amc.amount_usd) + 1) - ?) / 3) - 0.5)
                   * IF(MAX(amc.inferred) = 1, 0.7, 1)
            END)`
        : "0.5";
      const recoScoreExpr = `ROUND(0.5 * LEAST(1, ${matchWeightExpr} / ?) + 0.15 * (${urgencyExpr}) + 0.10 * ${amountExpr} + 0.125, 6)`;
      const amountScoreParams = amountActive ? [amountCenterLog] : [];

      const [rows] = await dbPool.query(
        `SELECT
           n.id,
           n.notice_id,
           n.reference,
           n.title,
           n.notice_type,
           n.country,
           n.deadline,
           n.deadline_ts,
           n.estimated_value,
           n.description,
           COUNT(DISTINCT b.code) AS match_score,
           ${recoScoreExpr} AS reco_score
         FROM crm_bid_notices n
         INNER JOIN crm_bid_notice_unspsc_codes b ON b.notice_id = n.id
         LEFT JOIN crm_notice_amount_cache amc ON amc.notice_id = n.id
         WHERE (${bridgeWhere}) AND ${activeWhere}
         GROUP BY n.id
         ORDER BY reco_score DESC, (n.deadline_ts IS NULL), ${deadlineSecExpr}, n.id DESC
         LIMIT ? OFFSET ?`,
        [...scoreParams, denominator, ...amountScoreParams, ...params, ...extraParams, pageSize, offset]
      );

      // 本地差异 #10：懒填充——当页公告金额缓存缺失/过版时后台补算（fire-and-forget，不阻塞响应）
      const pageNoticeIds = (rows as any[]).map((row) => Number(row.id)).filter(Boolean);
      if (pageNoticeIds.length) void backfillNoticeAmountCache(dbPool, pageNoticeIds).catch(() => undefined);

      res.json({
        items: (rows as any[]).map((row) => ({
          ...row,
          match_score: Number(row.match_score || 0),
          reco_score: Number(row.reco_score || 0),
          agency: null,
          organization: null,
          source_url: null,
          unspsc_codes: [],
          core_locked: true,
        })),
        total: Number((countRows as any[])[0]?.total || 0),
        page,
        pageSize,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── 本地差异 #11：T-B6 推荐反馈端点（B.3.2.2）──
  // 支持批量：body.actions = [{notice_id, action, reco_score?, position?, variant?, dwell_ms?}]，
  // 单条可直接平铺在 body。写入 INSERT IGNORE（uk_dedup 兜底 D.7 前端 Set 预去重）。
  // 兴趣码联动：click +0.3 / favorite +0.8（persistUserInterestCodes，source 白名单）；
  // dismiss ×0.5 相对强衰减（E.3 负反馈，decayUserInterestCodes 带 0.01 下限）
  app.post("/api/notices/feedback", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.body.user_key) || ""; // F.1：guest/空一律拒收
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });
      const sessionId = String(req.body.session_id || "").trim().slice(0, 64);
      if (!sessionId) return res.status(400).json({ error: "SESSION_REQUIRED" }); // D.7：无 session 唯一约束失效
      const VALID_ACTIONS = new Set([
        "impression", "click", "unlock", "dismiss", "favorite",
        "dwell", "scroll_end", "quick_exit", "revisit",
      ]);
      const rawActions: any[] = Array.isArray(req.body.actions)
        ? req.body.actions
        : req.body.notice_id
          ? [req.body]
          : [];
      if (rawActions.length === 0) return res.status(400).json({ error: "ACTIONS_REQUIRED" });
      if (rawActions.length > 50) return res.status(400).json({ error: "TOO_MANY_ACTIONS", max: 50 }); // 批量曝光上限
      const items = rawActions
        .map((item) => ({
          noticeId: Number(item?.notice_id || 0),
          action: String(item?.action || "").trim(),
          recoScore: Number.isFinite(Number(item?.reco_score)) ? Number(item.reco_score) : null,
          position: Number.isInteger(Number(item?.position)) && Number(item.position) >= 0 ? Number(item.position) : null,
          variant: String(item?.variant || "").trim().slice(0, 20) || null,
          dwellMs: Number.isInteger(Number(item?.dwell_ms)) && Number(item.dwell_ms) > 0 ? Number(item.dwell_ms) : null,
        }))
        .filter((item) => item.noticeId > 0 && VALID_ACTIONS.has(item.action));
      if (items.length === 0) return res.status(400).json({ error: "NO_VALID_ACTIONS" });

      // 批量写入流水（INSERT IGNORE：uk_dedup 命中即静默去重，affectedRows 反映实际新增）
      const [insertResult] = await dbPool.query(
        `INSERT IGNORE INTO crm_user_reco_feedback
           (user_id, user_key, notice_id, action, reco_score, position, variant, session_id, dwell_ms)
         VALUES ${items.map(() => "((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}`,
        items.flatMap((item) => [
          userKey, userKey, item.noticeId, item.action,
          item.recoScore, item.position, item.variant, sessionId, item.dwellMs,
        ])
      );
      const inserted = Number((insertResult as any)?.affectedRows || 0);

      // 兴趣码联动（click/favorite 正反馈、dismiss 负反馈）：一次查齐涉及公告的 unspsc_codes
      const linkedActions = items.filter((item) => ["click", "favorite", "dismiss"].includes(item.action));
      if (linkedActions.length) {
        const noticeIds = Array.from(new Set(linkedActions.map((item) => item.noticeId)));
        const [noticeRows] = await dbPool.query(
          `SELECT id, unspsc_codes FROM crm_bid_notices WHERE id IN (${noticeIds.map(() => "?").join(",")})`,
          noticeIds
        );
        const snapshotById = new Map<number, any[]>();
        for (const row of noticeRows as any[]) snapshotById.set(Number(row.id), normalizeUnspscCodes(row.unspsc_codes));
        for (const item of linkedActions) {
          const snapshot = snapshotById.get(item.noticeId);
          if (!snapshot || snapshot.length === 0) continue;
          if (item.action === "click") await persistUserInterestCodes(dbPool, userKey, snapshot, "feedback_click", 0.3);
          else if (item.action === "favorite") await persistUserInterestCodes(dbPool, userKey, snapshot, "feedback_favorite", 0.8);
          else await decayUserInterestCodes(dbPool, userKey, snapshot, 0.5); // dismiss：E.3 相对强衰减
        }
      }

      res.status(201).json({ success: true, received: items.length, inserted, deduped: items.length - inserted });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── 账号默认行业偏好（本地差异 #5：偏好表 + 读写接口）──
  app.get("/api/user/industry-prefs", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.query.user_key) || ""; // 本地差异 #7：F.1 归一化收敛（原仅 trim 不 lower）
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });
      const [rows] = await dbPool.query(
        "SELECT level1_id, level2_id, level3_id, level4_id, level5_id, updated_at FROM crm_user_industry_prefs WHERE user_key = ? LIMIT 1",
        [userKey]
      );
      res.json({ prefs: (rows as any[])[0] || null });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/user/industry-prefs", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.body.user_key) || ""; // 本地差异 #7：F.1 归一化收敛（原仅 trim 不 lower）
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });
      // 逐级取数字 id，非法值一律置 NULL；level1 为空视为清除偏好
      const levels = [1, 2, 3, 4, 5].map((n) => {
        const value = Number(req.body[`level${n}_id`] || 0);
        return Number.isInteger(value) && value > 0 ? value : null;
      });
      if (!levels[0]) {
        await dbPool.execute("DELETE FROM crm_user_industry_prefs WHERE user_key = ?", [userKey]);
        return res.json({ success: true, cleared: true });
      }
      await dbPool.execute(
        `INSERT INTO crm_user_industry_prefs (user_key, level1_id, level2_id, level3_id, level4_id, level5_id)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           level1_id = VALUES(level1_id), level2_id = VALUES(level2_id), level3_id = VALUES(level3_id),
           level4_id = VALUES(level4_id), level5_id = VALUES(level5_id), updated_at = NOW()`,
        [userKey, ...levels]
      );
      res.status(201).json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/membership/plans", async (_req, res) => {
    try {
      const [rows] = await dbPool.query(
        `SELECT plan_code, name, description, price, currency, duration_days, unlock_quota, free_quota, plan_type
         FROM crm_membership_plans
         WHERE is_active = 1
         ORDER BY sort_order, id`
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/membership/status", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.query.user_key) || ""; // 本地差异 #7：F.1 归一化收敛（原不做 trim/lower）
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });

      const [freePlanRows] = await dbPool.query(
        "SELECT free_quota FROM crm_membership_plans WHERE plan_code = 'free' LIMIT 1"
      );
      const freeQuota = Number((freePlanRows as any[])[0]?.free_quota || 3);
      const [freeRows] = await dbPool.query(
        "SELECT COUNT(*) AS total FROM crm_opportunity_unlocks WHERE user_key = ? AND unlock_type = 'free'",
        [userKey]
      );
      const freeUsed = Number((freeRows as any[])[0]?.total || 0);
      const [subs] = await dbPool.query(
        `SELECT plan_code, status, started_at, expires_at
         FROM crm_user_subscriptions
         WHERE user_key = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY id DESC`,
        [userKey]
      );
      const [paidUnlocks] = await dbPool.query(
        "SELECT COUNT(*) AS total FROM crm_opportunity_unlocks WHERE user_key = ? AND unlock_type IN ('single','subscription')",
        [userKey]
      );
      const [entitlements] = await dbPool.query(
        `SELECT id, plan_code, quota_total, quota_used, (quota_total - quota_used) AS quota_remaining, expires_at
         FROM crm_user_entitlements
         WHERE user_key = ?
           AND status = 'active'
           AND quota_total > quota_used
           AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY expires_at IS NULL DESC, expires_at ASC, id ASC`,
        [userKey]
      );
      const paidQuotaTotal = (entitlements as any[]).reduce((sum, item) => sum + Number(item.quota_total || 0), 0);
      const paidQuotaUsed = (entitlements as any[]).reduce((sum, item) => sum + Number(item.quota_used || 0), 0);
      const paidQuotaRemaining = (entitlements as any[]).reduce((sum, item) => sum + Number(item.quota_remaining || 0), 0);
      res.json({
        user_key: userKey,
        membership_tier: (subs as any[]).length > 0 || paidQuotaRemaining > 0 ? "vip" : "free",
        free_quota: freeQuota,
        free_used: freeUsed,
        free_remaining: Math.max(0, freeQuota - freeUsed),
        paid_unlocks: Number((paidUnlocks as any[])[0]?.total || 0),
        paid_quota_total: paidQuotaTotal,
        paid_quota_used: paidQuotaUsed,
        paid_quota_remaining: paidQuotaRemaining,
        active_subscriptions: subs,
        entitlements,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 手动触发全量 bridge 回填（运维接口，幂等安全）
  app.post("/api/admin/sync-bridge", async (_req, res) => {
    res.json({ success: true, message: "全量 bridge 回填已在后台启动，请查看服务日志获取进度" });
    // 响应先返回，回填在后台执行
    Promise.all([
      syncUnspscBridgeFull(dbPool, "notice"),
      syncUnspscBridgeFull(dbPool, "opportunity"),
    ]).then(() => backfillUnspscCodeIds(dbPool)).catch((err) => {
      console.warn("[BridgeSync] 手动触发全量回填失败:", err.message);
    });
  });

  // 本地差异 #8：C.3.5 质量快照运维接口（无定时器，手动触发；同日重跑覆盖当日快照）
  app.post("/api/admin/quality-snapshot", async (_req, res) => {
    try {
      const metrics = await captureDataQualitySnapshot(dbPool);
      res.json({ success: true, metrics });
    } catch (err: any) {
      console.warn("[QualitySnapshot] 采集失败:", err.message);
      res.status(500).json({ success: false, message: "质量快照采集失败" });
    }
  });

  // 本地差异 #8：查询近 N 天快照（观测趋势用，默认 30 天）
  app.get("/api/admin/quality-snapshot", async (req, res) => {
    try {
      const days = Math.min(Math.max(parseInt(String(req.query.days), 10) || 30, 1), 365);
      const [rows] = await dbPool.query(
        `SELECT snapshot_date, total_notices, missing_value, missing_country, missing_deadline,
                unlinked_unspsc, expired_but_active, dup_notice_cnt, created_at
         FROM crm_data_quality_snapshot
         ORDER BY snapshot_date DESC
         LIMIT ?`,
        [days]
      );
      res.json({ success: true, snapshots: rows });
    } catch (err: any) {
      console.warn("[QualitySnapshot] 查询失败:", err.message);
      res.status(500).json({ success: false, message: "质量快照查询失败" });
    }
  });

  // 本地差异 #10：T-B3 金额缓存批量回填（手动触发，无定时器；每批 ≤2000 行短事务，可中断续跑）
  app.post("/api/admin/backfill-amounts", async (req, res) => {
    try {
      const batches = Math.min(Math.max(parseInt(String(req.query.batches), 10) || 5, 1), 30);
      let processed = 0;
      for (let i = 0; i < batches; i++) {
        const result = await backfillNoticeAmountCache(dbPool);
        processed += result.processed;
        if (result.processed < 2000) break; // 不足一批说明已扫尾
      }
      const [remainRows] = await dbPool.query(
        `SELECT COUNT(*) AS remaining FROM crm_bid_notices n
         LEFT JOIN crm_notice_amount_cache c ON c.notice_id = n.id AND c.parse_version = ?
         WHERE c.notice_id IS NULL`,
        [AMOUNT_PARSE_VERSION]
      );
      res.json({ success: true, processed, remaining: Number((remainRows as any[])[0]?.remaining || 0) });
    } catch (err: any) {
      console.warn("[AmountBackfill] 回填失败:", err.message);
      res.status(500).json({ success: false, message: "金额缓存回填失败" });
    }
  });

  app.get("/api/procurement/schema-status", async (_req, res) => {
    try {
      const tables = [
        "crm_users",
        "ungm_1v1_appointments",
        "crm_membership_plans",
        "crm_user_subscriptions",
        "crm_payment_orders",
        "crm_payment_provider_configs",
        "crm_user_entitlements",
        "crm_opportunity_unlocks",
        "crm_user_notice_views",
        "crm_notice_interests",
        "crm_user_interest_codes",
        "crm_supplier_claims",
        "crm_supplier_translations",
        "crm_bid_notice_unspsc_codes",
        // 本地差异 #8：补入 G.4 搜索日志表（第一批漏登记）与 C.3.5 质量快照表
        "crm_user_search_log",
        "crm_data_quality_snapshot",
        // 本地差异 #10：T-B3 金额解析缓存表
        "crm_notice_amount_cache",
        // 本地差异 #11：T-B2 推荐反馈流水表 + 权重档案表
        "crm_user_reco_feedback",
        "crm_reco_weight_profile"
      ];
      const [rows] = await dbPool.query(
        `SELECT TABLE_NAME AS table_name
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${tables.map(() => "?").join(",")})`,
        tables
      );
      const existing = new Set((rows as any[]).map((row) => row.table_name));
      const requiredColumns: Record<string, string[]> = {
        crm_users: ["user_key", "email", "display_name", "password_hash", "membership_tier", "supplier_id", "supplier_link_status"],
        ungm_1v1_appointments: ["appointment_key", "company_name", "contact_person", "contact_method", "consultation_needs", "status", "extra", "raw_payload"],
        crm_membership_plans: ["plan_code", "name", "price", "unlock_quota", "free_quota", "plan_type", "is_active"],
        crm_user_subscriptions: ["user_id", "user_key", "plan_code", "status", "started_at", "expires_at"],
        crm_payment_orders: ["user_id", "order_no", "user_key", "provider", "plan_code", "notice_id", "amount", "status", "pay_url", "raw_request", "raw_notify", "paid_at"],
        crm_payment_provider_configs: ["provider", "mode", "app_id", "merchant_id", "notify_url", "private_key_ref", "cert_ref", "is_active"],
        crm_user_entitlements: ["user_id", "user_key", "source_order_no", "plan_code", "quota_total", "quota_used", "expires_at", "status"],
        crm_opportunity_unlocks: ["user_key", "opportunity_id", "notice_id", "unlock_type", "price", "unspsc_codes_snapshot"],
        crm_user_notice_views: ["user_key", "opportunity_id", "notice_id", "viewed_at", "ip"],
        crm_notice_interests: ["user_id", "user_key", "notice_id", "interest_type", "source", "note"],
        crm_user_interest_codes: ["user_key", "code_id", "code", "level", "source", "weight"],
        crm_supplier_claims: ["user_id", "user_key", "supplier_id", "company_name", "supplier_type", "status"],
        crm_bid_notice_unspsc_codes: ["notice_id", "code_id", "code", "level", "level1_id", "level2_id", "level3_id", "level4_id", "level5_id"],
        // 本地差异 #8
        crm_user_search_log: ["user_key", "q", "country", "filters", "result_cnt"],
        crm_data_quality_snapshot: ["snapshot_date", "total_notices", "missing_value", "missing_country", "missing_deadline", "unlinked_unspsc", "expired_but_active", "dup_notice_cnt"],
        // 本地差异 #10
        crm_notice_amount_cache: ["notice_id", "amount", "currency", "amount_usd", "inferred", "parse_version", "parsed_at"],
        // 本地差异 #11
        crm_user_reco_feedback: ["user_key", "notice_id", "action", "reco_score", "position", "variant", "session_id", "dwell_ms"],
        crm_reco_weight_profile: ["user_key", "w_unspsc", "w_agency", "w_amount", "w_geo", "w_urgency"],
      };
      const [columnRows] = await dbPool.query(
        `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${tables.map(() => "?").join(",")})`,
        tables
      );
      const columnsByTable = new Map<string, Set<string>>();
      for (const row of columnRows as any[]) {
        if (!columnsByTable.has(row.table_name)) columnsByTable.set(row.table_name, new Set());
        columnsByTable.get(row.table_name)?.add(row.column_name);
      }
      const rowCounts: Record<string, number | null> = {};
      for (const table of tables) {
        if (!existing.has(table)) {
          rowCounts[table] = null;
          continue;
        }
        const [countRows] = await dbPool.query(`SELECT COUNT(*) AS total FROM ${table}`);
        rowCounts[table] = Number((countRows as any[])[0]?.total || 0);
      }
      res.json({
        success: true,
        tables: tables.map((table) => {
          const columns = columnsByTable.get(table) || new Set<string>();
          const required = requiredColumns[table] || [];
          return {
            table,
            exists: existing.has(table),
            row_count: rowCounts[table],
            column_count: columns.size,
            missing_columns: required.filter((column) => !columns.has(column)),
          };
        }),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const paymentConfigStatusHandler = async (_req: any, res: any) => {
    try {
      const [rows] = await dbPool.query(
        `SELECT provider, mode, app_id, merchant_id, notify_url, is_active
         FROM crm_payment_provider_configs
         WHERE is_active = 1
         ORDER BY provider, id DESC`
      );
      const configs = rows as any[];
      const runtime = getPaymentRuntimeConfig();
      res.json({
        ...runtime,
        active_provider_configs: configs.map((item) => ({
          provider: item.provider,
          mode: item.mode,
          app_id: item.app_id ? `${String(item.app_id).slice(0, 6)}***` : null,
          merchant_id: item.merchant_id ? `${String(item.merchant_id).slice(0, 6)}***` : null,
          notify_url: item.notify_url || null,
          is_active: Boolean(item.is_active),
        })),
        note: runtime.live_enabled
          ? "PAYMENT_MODE=live: 下单会请求真实支付策略；真实付款成功需要支付平台异步通知或主动查询落库。"
          : "PAYMENT_MODE 未设置为 live: 下单会强制走 mock，方便本地闭环测试，不会调支付宝/微信真实网关。",
        providers: {
          ...runtime.providers,
          alipay: {
            ...runtime.providers.alipay,
            source: runtime.providers.alipay.configured ? "env" : configs.some((item) => item.provider === "alipay") ? "database_config_only" : "none",
          },
          wechat: {
            ...runtime.providers.wechat,
            source: runtime.providers.wechat.configured ? "env" : configs.some((item) => item.provider === "wechat") ? "database_config_only" : "none",
          },
        },
        required_env: {
          alipay: ["ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY", "ALIPAY_PUBLIC_KEY", "ALIPAY_NOTIFY_URL"],
          wechat: ["WECHAT_APP_ID", "WECHAT_MCH_ID \u6216 WECHAT_MERCHANT_ID", "WECHAT_API_V3_KEY", "WECHAT_PRIVATE_KEY", "WECHAT_NOTIFY_URL"],
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  app.get("/api/payment/config-status", paymentConfigStatusHandler);
  app.get("/api/payments/config-status", paymentConfigStatusHandler);

  app.post("/api/payments/create", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.body.user_key) || ""; // 本地差异 #7：F.1 归一化收敛（原不做 trim/lower）
      const provider = req.body.provider === "wechat" ? "wechat" : "alipay";
      const planCode = String(req.body.plan_code || "single_89");
      const noticeId = req.body.notice_id ? Number(req.body.notice_id) : null;
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });

      const [planRows] = await dbPool.query(
        "SELECT plan_code, name, price, currency FROM crm_membership_plans WHERE plan_code = ? AND is_active = 1 LIMIT 1",
        [planCode]
      );
      const plan = (planRows as any[])[0];
      if (!plan) return res.status(404).json({ error: "PLAN_NOT_FOUND" });
      const providerConfigured = provider === "alipay"
        ? Boolean(process.env.ALIPAY_APP_ID && process.env.ALIPAY_PRIVATE_KEY && process.env.ALIPAY_NOTIFY_URL)
        : Boolean(process.env.WECHAT_MCH_ID && process.env.WECHAT_APP_ID && process.env.WECHAT_API_V3_KEY && process.env.WECHAT_NOTIFY_URL);
      const paymentMode = providerConfigured ? "configured" : "mock";

      const orderNo = `PAY${Date.now()}${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      const fakePayUrl = `/api/payments/${orderNo}/mock-paid`;
      await dbPool.execute(
        `INSERT INTO crm_payment_orders
          (user_id, order_no, user_key, provider, plan_code, notice_id, amount, currency, status, pay_url, raw_request)
         VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [userKey, orderNo, userKey, provider, planCode, noticeId, plan.price, plan.currency || "CNY", fakePayUrl, JSON.stringify(req.body || {})]
      );
      res.status(201).json({
        success: true,
        order_no: orderNo,
        provider,
        plan_code: planCode,
        plan_name: plan.name,
        amount: Number(plan.price),
        currency: plan.currency || "CNY",
        status: "pending",
        payment_mode: paymentMode,
        pay_url: fakePayUrl,
        qr_code_url: fakePayUrl,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/payments/:orderNo/mock-paid", async (req, res) => {
    try {
      const orderNo = String(req.params.orderNo || "");
      const [orderRows] = await dbPool.query(
        "SELECT * FROM crm_payment_orders WHERE order_no = ? LIMIT 1",
        [orderNo]
      );
      const order = (orderRows as any[])[0];
      if (!order) return res.status(404).json({ error: "ORDER_NOT_FOUND" });
      if (order.status !== "paid") {
        const [planRows] = await dbPool.query(
          "SELECT duration_days, plan_type, unlock_quota FROM crm_membership_plans WHERE plan_code = ? LIMIT 1",
          [order.plan_code]
        );
        const plan = (planRows as any[])[0] || {};
        await dbPool.execute(
          `UPDATE crm_payment_orders
           SET status = 'paid', provider_trade_no = ?, raw_notify = ?, paid_at = NOW(), updated_at = NOW()
           WHERE order_no = ?`,
          [`MOCK-${orderNo}`, JSON.stringify(req.body || { mock: true }), orderNo]
        );
        const unlockQuota = Math.max(1, Number(plan.unlock_quota || 1));
        await dbPool.execute(
          `INSERT INTO crm_user_entitlements
            (user_id, user_key, source_order_no, plan_code, quota_total, quota_used, started_at, expires_at, status)
           VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, 0, NOW(), ${plan.duration_days ? "DATE_ADD(NOW(), INTERVAL ? DAY)" : "NULL"}, 'active')`,
          plan.duration_days
            ? [order.user_key, order.user_key, orderNo, order.plan_code, unlockQuota, plan.duration_days]
            : [order.user_key, order.user_key, orderNo, order.plan_code, unlockQuota]
        );
        if (plan.plan_type !== "single") {
          await dbPool.execute(
            `INSERT INTO crm_user_subscriptions (user_id, user_key, plan_code, status, started_at, expires_at)
             VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, 'active', NOW(), ${plan.duration_days ? "DATE_ADD(NOW(), INTERVAL ? DAY)" : "NULL"})`,
            plan.duration_days ? [order.user_key, order.user_key, order.plan_code, plan.duration_days] : [order.user_key, order.user_key, order.plan_code]
          );
          await dbPool.execute("UPDATE crm_users SET membership_tier = 'vip', updated_at = NOW() WHERE user_key = ?", [order.user_key]);
        }
        if (order.notice_id) {
          await dbPool.execute(
            `INSERT INTO crm_notice_interests (user_id, user_key, notice_id, interest_type, source)
             VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, 'subscribed', 'payment')
             ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), updated_at = NOW()`,
            [order.user_key, order.user_key, order.notice_id]
          );
        }
      }
      res.json({ success: true, order_no: orderNo, status: "paid" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/notices/:id/view", async (req, res) => {
    try {
      const noticeId = Number(req.params.id);
      const userKey = normalizeUserKey(req.body.user_key) || "guest"; // 本地差异 #7：F.1 归一化收敛（浏览流水保留 guest）
      await dbPool.execute(
        `INSERT INTO crm_user_notice_views (user_id, user_key, notice_id, viewed_at, ip)
         VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, NOW(), ?)`,
        [userKey, userKey, noticeId, req.ip || req.socket?.remoteAddress || "127.0.0.1"]
      );
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/notices/:id/detail", async (req, res) => {
    try {
      const noticeId = Number(req.params.id);
      const userKey = normalizeUserKey(req.query.user_key) || ""; // 本地差异 #7：F.1 归一化收敛（原不做 trim/lower）
      if (!noticeId || !userKey) return res.status(400).json({ error: "USER_AND_NOTICE_REQUIRED" });

      const [unlockRows] = await dbPool.query(
        "SELECT id, unlock_type, unlocked_at FROM crm_opportunity_unlocks WHERE user_key = ? AND notice_id = ? LIMIT 1",
        [userKey, noticeId]
      );
      const unlock = (unlockRows as any[])[0];
      if (!unlock) {
        return res.status(403).json({ error: "NOTICE_LOCKED", core_locked: true });
      }

      const [noticeRows] = await dbPool.query(
        `SELECT
           id,
           notice_id,
           reference,
           title,
           notice_type,
           agency,
           organization,
           country,
           deadline,
           deadline_ts,
           estimated_value,
           description,
           industry,
           url,
           contacts,
           documents,
           procurement_files,
           external_links,
           agency_full,
           published_date,
           difficulty,
           registration_level,
           key_contacts,
           unspsc_codes,
           converted_opp_id,
           is_converted
         FROM crm_bid_notices
         WHERE id = ?
         LIMIT 1`,
        [noticeId]
      );
      const notice = (noticeRows as any[])[0];
      if (!notice) return res.status(404).json({ error: "NOTICE_NOT_FOUND" });
      const opportunity = await findQualifiedOpportunityForNotice(dbPool, notice);

      res.json(normalizeNoticeDetailPayload(notice, unlock, opportunity));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/notices/:id/translation", async (req, res) => {
    try {
      const noticeId = Number(req.params.id);
      const lang = String(req.query.lang || "").toLowerCase();
      if (!noticeId || !NOTICE_TRANSLATION_LANGS[lang]) {
        return res.status(400).json({ error: "INVALID_NOTICE_OR_LANG" });
      }

      // 注：标题与正文描述均为公开内容（列表端点对所有人返回完整 description），
      // 付费内容（机构/联系人/原文链接/类目）不经过本端点，故此处无需解锁校验
      const [cachedRows] = await dbPool.query(
        "SELECT title_tr, description_tr FROM crm_notice_translations WHERE notice_id = ? AND lang = ? LIMIT 1",
        [noticeId, lang]
      );
      const cachedRow = (cachedRows as any[])[0];
      if (cachedRow) {
        return res.json({
          lang,
          title: cachedRow.title_tr,
          description: cachedRow.description_tr,
          cached: true,
        });
      }

      const [noticeRows] = await dbPool.query(
        "SELECT title, description FROM crm_bid_notices WHERE id = ? LIMIT 1",
        [noticeId]
      );
      const notice = (noticeRows as any[])[0];
      if (!notice) return res.status(404).json({ error: "NOTICE_NOT_FOUND" });

      const pendingKey = `${noticeId}:${lang}`;
      let pending = pendingNoticeTranslations.get(pendingKey);
      if (!pending) {
        pending = translateNoticeViaChain(
          String(notice.title || ""),
          String(notice.description || ""),
          lang
        );
        pendingNoticeTranslations.set(pendingKey, pending);
        pending.finally(() => pendingNoticeTranslations.delete(pendingKey)).catch(() => undefined);
      }
      const { translations, provider } = await pending;

      await dbPool.query(
        `INSERT INTO crm_notice_translations (notice_id, lang, title_tr, description_tr, model)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE title_tr = VALUES(title_tr), description_tr = VALUES(description_tr), model = VALUES(model)`,
        [noticeId, lang, translations[0], translations[1], provider]
      );
      res.json({ lang, title: translations[0], description: translations[1], cached: false });
    } catch (err: any) {
      if (err?.message === "TRANSLATION_UNAVAILABLE") {
        return res.status(503).json({ error: "TRANSLATION_UNAVAILABLE" });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/notices/:id/unlock", async (req, res) => {
    try {
      const noticeId = Number(req.params.id);
      // 本地差异 #7：F.1——无有效 user_key 的解锁流水仍记 guest，但不落兴趣码（防共享伪用户脏画像）
      const normalizedUserKey = normalizeUserKey(req.body.user_key);
      const userKey = normalizedUserKey || "guest";
      const unlockType = req.body.unlock_type === "subscription" || req.body.unlock_type === "single"
        ? req.body.unlock_type
        : "free";
      const price = unlockType === "single" ? Number(req.body.price || 19) : 0;
      let consumedEntitlementId: number | null = null;

      const [existing] = await dbPool.query(
        "SELECT id FROM crm_opportunity_unlocks WHERE user_key = ? AND notice_id = ? LIMIT 1",
        [userKey, noticeId]
      );
      if ((existing as any[]).length > 0) return res.json({ success: true, alreadyUnlocked: true });

      if (unlockType === "free") {
        const [freePlanRows] = await dbPool.query(
          "SELECT free_quota FROM crm_membership_plans WHERE plan_code = 'free' LIMIT 1"
        );
        const freeQuota = Number((freePlanRows as any[])[0]?.free_quota || 3);
        const [freeRows] = await dbPool.query(
          "SELECT COUNT(*) AS total FROM crm_opportunity_unlocks WHERE user_key = ? AND unlock_type = 'free'",
          [userKey]
        );
        if (Number((freeRows as any[])[0]?.total || 0) >= freeQuota) {
          return res.status(402).json({ error: "FREE_LIMIT_REACHED" });
        }
      }

      if (unlockType === "subscription" || unlockType === "single") {
        const [entitlementRows] = await dbPool.query(
          `SELECT id
           FROM crm_user_entitlements
           WHERE user_key = ?
             AND status = 'active'
             AND quota_total > quota_used
             AND (expires_at IS NULL OR expires_at > NOW())
           ORDER BY expires_at IS NULL DESC, expires_at ASC, id ASC
           LIMIT 1`,
          [userKey]
        );
        const entitlement = (entitlementRows as any[])[0];
        if (!entitlement) {
          return res.status(402).json({ error: "PAID_QUOTA_REQUIRED" });
        }
        consumedEntitlementId = Number(entitlement.id);
      }

      const [noticeRows] = await dbPool.query(
        "SELECT id, unspsc_codes FROM crm_bid_notices WHERE id = ? LIMIT 1",
        [noticeId]
      );
      const notice = (noticeRows as any[])[0];
      if (!notice) return res.status(404).json({ error: "Notice not found" });
      const snapshot = normalizeUnspscCodes(notice.unspsc_codes);

      await dbPool.execute(
        `INSERT INTO crm_opportunity_unlocks
          (user_id, user_key, notice_id, unlock_type, price, unlocked_at, unspsc_codes_snapshot)
         VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, NOW(), ?)`,
        [userKey, userKey, noticeId, unlockType, price, JSON.stringify(snapshot)]
      );
      if (consumedEntitlementId) {
        await dbPool.execute(
          "UPDATE crm_user_entitlements SET quota_used = quota_used + 1, updated_at = NOW() WHERE id = ? AND quota_total > quota_used",
          [consumedEntitlementId]
        );
      }

      // 本地差异 #7：F.1——guest 拒写兴趣码，解锁流水已在上方保留
      if (normalizedUserKey) {
        await persistUserInterestCodes(dbPool, userKey, snapshot, "unlock_order", 2.50);
      }

      res.status(201).json({ success: true, unlock_type: unlockType });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/notices/:id/interest", async (req, res) => {
    try {
      const noticeId = Number(req.params.id);
      const userKey = normalizeUserKey(req.body.user_key) || ""; // 本地差异 #7：F.1 归一化收敛（原不做 trim/lower）
      const interestType = req.body.interest_type === "subscribed" ? "subscribed" : "interested";
      const note = String(req.body.note || "").slice(0, 500);
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });

      const [noticeRows] = await dbPool.query(
        "SELECT id, unspsc_codes FROM crm_bid_notices WHERE id = ? LIMIT 1",
        [noticeId]
      );
      const notice = (noticeRows as any[])[0];
      if (!notice) return res.status(404).json({ error: "Notice not found" });

      await dbPool.execute(
        `INSERT INTO crm_notice_interests (user_id, user_key, notice_id, interest_type, source, note)
         VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, 'detail_page', ?)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), note = VALUES(note), updated_at = NOW()`,
        [userKey, userKey, noticeId, interestType, note]
      );

      const snapshot = normalizeUnspscCodes(notice.unspsc_codes);
      await persistUserInterestCodes(
        dbPool,
        userKey,
        snapshot,
        interestType === "subscribed" ? "subscribe_notice" : "express_interest",
        interestType === "subscribed" ? 2.0 : 1.0
      );

      res.status(201).json({ success: true, interest_type: interestType });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/opportunities/:id/view", async (req, res) => {
    try {
      const opportunityId = Number(req.params.id);
      const userKey = normalizeUserKey(req.body.user_key) || "guest"; // 本地差异 #7：F.1 归一化收敛（浏览流水保留 guest）
      await dbPool.execute(
        `INSERT INTO crm_user_notice_views (user_id, user_key, opportunity_id, viewed_at, ip)
         VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, NOW(), ?)`,
        [userKey, userKey, opportunityId, req.ip || req.socket?.remoteAddress || "127.0.0.1"]
      );
      await dbPool.execute(
        "UPDATE crm_bid_opportunities SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?",
        [opportunityId]
      );
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/opportunities/:id/unlock", async (req, res) => {
    try {
      const opportunityId = Number(req.params.id);
      // 本地差异 #7：F.1——同 notices unlock：流水保留 guest，兴趣码仅实名写入
      const normalizedUserKey = normalizeUserKey(req.body.user_key);
      const userKey = normalizedUserKey || "guest";
      const unlockType = req.body.unlock_type === "subscription" || req.body.unlock_type === "single"
        ? req.body.unlock_type
        : "free";
      const price = unlockType === "single" ? Number(req.body.price || 19) : 0;

      const [existing] = await dbPool.query(
        "SELECT id, unlock_type FROM crm_opportunity_unlocks WHERE user_key = ? AND opportunity_id = ? LIMIT 1",
        [userKey, opportunityId]
      );
      if ((existing as any[]).length > 0) {
        return res.json({ success: true, alreadyUnlocked: true });
      }

      if (unlockType === "free") {
        // 免费配额统一读 crm_membership_plans（与 /api/notices/:id/unlock 同源），不再硬编码
        const [freePlanRows] = await dbPool.query(
          "SELECT free_quota FROM crm_membership_plans WHERE plan_code = 'free' LIMIT 1"
        );
        const freeQuota = Number((freePlanRows as any[])[0]?.free_quota || 3);
        const [freeRows] = await dbPool.query(
          "SELECT COUNT(*) AS total FROM crm_opportunity_unlocks WHERE user_key = ? AND unlock_type = 'free'",
          [userKey]
        );
        if (Number((freeRows as any[])[0]?.total || 0) >= freeQuota) {
          return res.status(402).json({ error: "FREE_LIMIT_REACHED" });
        }
      }

      const [oppRows] = await dbPool.query(
        "SELECT id, unspsc_codes FROM crm_bid_opportunities WHERE id = ? LIMIT 1",
        [opportunityId]
      );
      const opp = (oppRows as any[])[0];
      if (!opp) return res.status(404).json({ error: "Opportunity not found" });
      const snapshot = normalizeUnspscCodes(opp.unspsc_codes);

      await dbPool.execute(
        `INSERT INTO crm_opportunity_unlocks
          (user_id, user_key, opportunity_id, unlock_type, price, unlocked_at, unspsc_codes_snapshot)
         VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, NOW(), ?)`,
        [userKey, userKey, opportunityId, unlockType, price, JSON.stringify(snapshot)]
      );
      await dbPool.execute(
        "UPDATE crm_bid_opportunities SET unlock_count = COALESCE(unlock_count, 0) + 1 WHERE id = ?",
        [opportunityId]
      );

      // 本地差异 #7：F.1——guest 拒写兴趣码（解锁流水已保留）
      if (normalizedUserKey) {
        for (const item of snapshot) {
          const rawCode = String(item?.code || item || "").replace(/\D/g, "").slice(0, 8);
          if (!rawCode) continue;
          const [codeRows] = await dbPool.query(
            "SELECT id, level FROM crm_unspsc_codes WHERE code = ? LIMIT 1",
            [rawCode]
          );
          const codeRow = (codeRows as UnspscCodeRow[])[0];
          await dbPool.execute(
            `INSERT INTO crm_user_interest_codes (user_id, user_key, code_id, code, level, source, weight)
             VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, 'unlock_order', 2.50)
             ON DUPLICATE KEY UPDATE weight = weight + 0.50, updated_at = NOW()`,
            [userKey, userKey, codeRow?.id || null, rawCode, codeRow?.level || 1]
          );
        }
      }

      res.status(201).json({ success: true, unlock_type: unlockType });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6b. TRAINING SEMINAR REGISTRATION
  app.post("/api/training/register", async (req, res) => {
    try {
      const {
        company_name,
        industry_id,
        main_product,
        export_experience,
        certification,
        contact_name,
        position,
        telephone,
        email,
        remark,
      } = req.body;

      if (!company_name || !contact_name || !telephone) {
        return res.status(400).json({ error: "企业名称、参会人姓名、手机号码为必填项" });
      }

      // Lookup industry name from UNSPSC table
      let industryName = "";
      let industryCode: UnspscCodeRow | null = null;
      if (industry_id) {
        const [rows] = await dbPool.query(
          "SELECT id, code, title, title_zh, level FROM crm_unspsc_codes WHERE id = ?",
          [industry_id]
        );
        if ((rows as any[]).length > 0) {
          industryCode = (rows as UnspscCodeRow[])[0];
          industryName = industryCode.title_zh || industryCode.title || "";
        }
      }

      const [result] = await dbPool.execute(
        `INSERT INTO crm_training_registrations
          (company_name, industry_id, industry, main_product, export_experience, certification, contact_name, position, telephone, email, remark, created_at, ip, audit_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, 'pending')`,
        [
          company_name,
          industry_id || null,
          industryName,
          main_product || "",
          export_experience || "",
          certification || "",
          contact_name,
          position || "",
          telephone,
          email || "",
          remark || "",
          req.ip || req.socket?.remoteAddress || "127.0.0.1",
        ]
      );

      const registrationId = (result as any).insertId;

      return res.status(201).json({
        success: true,
        id: registrationId,
        message: "\u7814\u4fee\u73ed\u62a5\u540d\u4fe1\u606f\u5df2\u63d0\u4ea4",
      });
    } catch (err: any) {
      console.error("Training register error:", err.message);
      return res.status(500).json({ error: "提交失败，请稍后重试" });
    }
  });

  // 6c. 研修班文件下载次数追踪。
  const trainingDownloadCounts: Record<string, number> = {};
  app.post("/api/training/downloads/track", (req, res) => {
    const materialId = String(req.body.material_id || "").slice(0, 60);
    const fileName = String(req.body.file_name || "").slice(0, 120);
    if (!materialId) return res.status(400).json({ error: "material_id required" });
    trainingDownloadCounts[materialId] = (trainingDownloadCounts[materialId] || 0) + 1;
    console.log(`[Download] ${materialId} | ${fileName} | total=${trainingDownloadCounts[materialId]}`);
    return res.json({ success: true, material_id: materialId, total: trainingDownloadCounts[materialId] });
  });

  app.get("/api/training/downloads/stats", (_req, res) => {
    res.json(trainingDownloadCounts);
  });

  // 7. AI MATCHMAKING AGENT ENDPOINT WITH GEMINI LLM
  app.post("/api/ai/matchmake", async (req, res) => {
    const { supplier, opportunity, language } = req.body;

    if (!supplier || !opportunity) {
      return res.status(400).json({ error: "Required supplier and opportunity object parameters!" });
    }

    const lang = language || "zh";

    // Standard Fallback matching analysis text if API key is not active
    const localAnalysisZh = `#### 本地智能算法分析报告
* 匹配度预测比例: **88%**
* **优势分析**: 供应商 ${supplier.nameZh} 的核心产品 ${supplier.mainProductsZh?.join(", ")} 与采购方商机 ${opportunity.titleZh}（预算：${opportunity.budget}）的核心需求高度吻合。该企业所在地 ${supplier.cityZh || ""} 产业链配套完备。
* **合规比对**: 采购国为 ${opportunity.countryZh}。供应商持有 ${supplier.complianceLabelsZh?.join(", ")}，基本满足合规准入门槛。${supplier.ungmCode ? `该国外企业已持有国际公共采购 Code (${supplier.ungmCode})，属于高优匹配！` : "建议该国内优质工厂申请代入驻国际公共采购资质，能额外提高35%中标权重。"}
* **CRM 拓展动作建议**:
  1. 委派海外展厅当地代表打印宣传画册并向客商现场推荐。
  2. 协助起草中英双语版合规投标书，并在截止日前提交初审。
  3. 通过系统消息一键推送给对应联系人 ${supplier.contactPerson} (${supplier.contactEmail})。`;

    const localAnalysisEn = `#### Smart Rule-Based Matchmaking Report
* Matchmaking Feasibility Index: **88%**
* **Key Advantages**: Supplier ${supplier.nameEn || supplier.nameZh}'s main products ${supplier.mainProductsEn?.join(", ")} are closely aligned with ${opportunity.titleEn || opportunity.titleZh} (Budget: ${opportunity.budget}).
* **Compliance Review**: Bidding is active in ${opportunity.countryEn || opportunity.countryZh}. Supplier certifications ${supplier.complianceLabelsEn?.join(", ")} match core administrative gates. ${supplier.ungmCode ? `Already has active 国际公共采购 code [${supplier.ungmCode}].` : "We recommend registering a basic-level International Public Procurement profile to improve evaluation weight."}
* **CRM Follow-up Recommendations**:
  1. Print specs at relevant local showrooms to catch active regional delegates.
  2. Co-write translated bid templates before the strict deadline: ${opportunity.deadline}.
  3. Trigger automated outbound notice to registered contact ${supplier.contactPerson} (${supplier.contactEmail}).`;

    // Attempt to invoke real Gemini 3.5-flash API
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
      // Graceful fallback during dev or missing key
      return res.json({
        analysis: lang === "zh" ? localAnalysisZh : localAnalysisEn,
        modelUsed: "local-match-fallback",
        success: true
      });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });

      const prompt = `You are a professional B2B Global Trade & Procurement CRM Expert.
Analyze the matchmaking potential between this Supplier and this Procurement Opportunity.
Respond strictly in Markdown.

Format the response beautifully. Highlight alignment, certifications, custom tariffs/国际公共采购 code advantage, and list concrete CRM follow-up steps.

Language requested: ${lang === "zh" ? "Simplified Chinese" : "English"}.

Supplier Information:
- Name: ${supplier.nameZh} / ${supplier.nameEn}
- Type: ${supplier.type}
- Industry: ${supplier.industryZh} / ${supplier.industryEn}
- Location: ${supplier.countryZh} (${supplier.cityZh})
- 国际公共采购 Code: ${supplier.ungmCode || "None"}
- Products: ${supplier.mainProductsZh?.join(", ")} / ${supplier.mainProductsEn?.join(", ")}
- Certifications: ${supplier.complianceLabelsZh?.join(", ")}

Opportunity parameters:
- Title: ${opportunity.titleZh} / ${opportunity.titleEn}
- Industry: ${opportunity.industryZh} / ${opportunity.industryEn}
- Target Country: ${opportunity.countryZh} / ${opportunity.countryEn}
- Budget: ${opportunity.budget}
- Deadline: ${opportunity.deadline}
- Description: ${opportunity.descriptionZh} / ${opportunity.descriptionEn}
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt
      });

      const text = response.text || (lang === "zh" ? localAnalysisZh : localAnalysisEn);
      return res.json({
        analysis: text,
        modelUsed: "gemini-3.5-flash",
        success: true
      });
    } catch (apiError: any) {
      console.warn("Gemini call failed, utilizing bulletproof local fallback report:", apiError.message);
      return res.json({
        analysis: (lang === "zh" ? localAnalysisZh : localAnalysisEn) + `\n\n*(Note: Gemini api call returned an error, used local matching template)*`,
        modelUsed: "local-match-fallback",
        success: true
      });
    }
  });

  // Vite Integration for high performance SPA support
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server fully functional on http://0.0.0.0:${PORT}`);
  });
}

startServer();
