/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import crypto from "crypto";
import { Router } from "express";
import type { AppContext } from "../context";
import { Lead } from "../../src/types";
import { normalizeUserKey } from "../utils/normalize";
import { translateViaChain, type ChainResult } from "../services/translation/chain";
import { mapSupplierRow } from "../services/suppliers";

// ── 供应商字段按需翻译（对齐公告翻译：缓存表 + 有道→DeepSeek 链 + 并发去重）──
// 原文为中文，仅需翻译非中文界面语言；公司名保留原文不翻译
const SUPPLIER_TRANSLATION_LANGS: Record<string, string> = {
  en: "English",
  fr: "French",
  ru: "Russian",
  es: "Spanish",
  ar: "Arabic",
};

// 同一 (supplier, lang) 的并发首次翻译只触发一次翻译链调用
const pendingSupplierTranslations = new Map<string, Promise<ChainResult>>();

export function createSuppliersRouter(ctx: AppContext): Router {
  const router = Router();
  const { dbPool, leadsDb } = ctx;

  // 4. GET SUPPLIERS (DB-backed directory with per-language translations)
  router.get("/api/suppliers", async (req, res) => {
    try {
      const lang = String(req.query.lang || "zh").toLowerCase();
      const [rows] = await dbPool.query(
        `SELECT id, company, country, country_code, province, city, contact, phone, email, products, industry, type
         FROM supplier
         WHERE company <> '测试'
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
      // supplier 表只有行业/主营产品两个可译字段，认证/企业性质槽位置空
      const fields = [
        String(row.industry || "").trim(),
        String(row.products || "").trim(),
      ];
      const pending = translateViaChain(fields, "zh", lang);
      pendingSupplierTranslations.set(pendingKey, pending);
      try {
        const { translations, provider } = await pending;
        await dbPool.query(
          `INSERT INTO crm_supplier_translations (supplier_id, lang, industry_tr, main_products_tr, model)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE industry_tr = VALUES(industry_tr), main_products_tr = VALUES(main_products_tr),
             model = VALUES(model)`,
          [row.id, lang, translations[0], translations[1], provider]
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
  router.get("/api/suppliers/:id/contact", async (req, res) => {
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
        "SELECT contact, phone, email FROM supplier WHERE id = ? LIMIT 1",
        [supplierId]
      );
      const supplier = (supplierRows as any[])[0];
      if (!supplier) return res.status(404).json({ error: "SUPPLIER_NOT_FOUND" });

      res.json({
        contactPerson: supplier.contact || "",
        contactPhone: supplier.phone || "",
        contactEmail: supplier.email || "",
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. POST REGISTER NEW SUPPLIER (persisted into crm_suppliers)
  router.post("/api/suppliers", async (req, res) => {
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

  router.post("/api/supplier-claims", async (req, res) => {
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

  return router;
}
