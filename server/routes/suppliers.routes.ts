/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import crypto from "crypto";
import { Router } from "express";
import type { AppContext } from "../context";
import { Lead } from "../../src/types";
import { normalizeUserKey } from "../utils/normalize";
import { asyncHandler } from "../middleware/errorHandler";
import { translateViaChain, type ChainResult } from "../services/translation/chain";
import { mapSupplierRow } from "../services/suppliers";
import { SuppliersRepo } from "../repos/suppliers.repo";
import { UsersRepo } from "../repos/users.repo";
import { MembershipRepo } from "../repos/membership.repo";

// ── 供应商字段按需翻译（对齐公告翻译：缓存表 + DeepSeek→Gemini 链 + 并发去重）──
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
  const { leadsDb } = ctx;
  const suppliersRepo = ctx.suppliersRepo ?? new SuppliersRepo(ctx.dbPool);
  const usersRepo = ctx.usersRepo ?? new UsersRepo(ctx.dbPool);
  const membershipRepo = ctx.membershipRepo ?? new MembershipRepo(ctx.dbPool);

  // ── P1 性能优化：供应商列表服务端 TTL 缓存 ──
  // 供应商数据极少变化（仅新注册时变化），缓存 5 分钟避免每次全量查询+映射+序列化
  const supplierResponseCache = new Map<string, { data: any; expires: number }>();
  const SUPPLIER_CACHE_TTL = 5 * 60 * 1000; // 5 分钟

  function invalidateSupplierCache() {
    supplierResponseCache.clear();
  }

  // 4. GET SUPPLIERS (DB-backed directory with per-language translations)
  // 支持两种模式：
  //   - 无 page 参数 → 返回全量数组（向后兼容）
  //   - 有 page/pageSize 参数 → 返回 { items, total, page, pageSize } 分页结构
  router.get("/api/suppliers", asyncHandler(async (req, res) => {
    const lang = String(req.query.lang || "zh").toLowerCase();
    const pageParam = req.query.page ? Number(req.query.page) : undefined;
    const pageSizeParam = req.query.pageSize ? Number(req.query.pageSize) : undefined;

    // ── 分页模式 ──
    if (pageParam && pageParam >= 1) {
      const pageSize = Math.min(Math.max(pageSizeParam || 9, 1), 50);
      const page = pageParam;
      const search = req.query.q ? String(req.query.q).trim() : undefined;
      const type = req.query.type ? String(req.query.type) : undefined;
      const industry = req.query.industry ? String(req.query.industry) : undefined;

      // 分页缓存 key 包含筛选参数
      const cacheKey = `p:${lang}:${page}:${pageSize}:${search || ""}:${type || ""}:${industry || ""}`;
      const cached = supplierResponseCache.get(cacheKey);
      if (cached && cached.expires > Date.now()) {
        res.json(cached.data);
        return;
      }

      const { items: supplierRows, total } = await suppliersRepo.listDirectoryPaginated({
        limit: pageSize,
        offset: (page - 1) * pageSize,
        lang,
        search,
        type,
        industry,
      });

      // 译文映射
      const trMap = new Map<number, any>();
      if (SUPPLIER_TRANSLATION_LANGS[lang] && supplierRows.length > 0) {
        const trRows = await suppliersRepo.listTranslations(lang, supplierRows.map((row) => row.id));
        for (const tr of trRows) {
          trMap.set(Number(tr.supplier_id), tr);
        }
      }

      const items = supplierRows.map((row) => mapSupplierRow(row, trMap.get(Number(row.id)) || null));
      const result = { items, total, page, pageSize };

      // 缓存分页响应（TTL 较短，2 分钟）
      supplierResponseCache.set(cacheKey, { data: result, expires: Date.now() + 2 * 60 * 1000 });
      res.json(result);

      // fire-and-forget 补翻
      if (SUPPLIER_TRANSLATION_LANGS[lang]) {
        const missing = supplierRows.filter((row) => !trMap.has(Number(row.id)));
        if (missing.length > 0) {
          void backfillSupplierTranslations(missing, lang);
        }
      }
      return;
    }

    // ── 全量模式（向后兼容） ──
    const cacheKey = lang;
    const cached = supplierResponseCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      res.json(cached.data);
      return;
    }

    const supplierRows = await suppliersRepo.listDirectory();

    // 命中翻译缓存的直接返回译文，缺失的回退中文原文
    const trMap = new Map<number, any>();
    if (SUPPLIER_TRANSLATION_LANGS[lang] && supplierRows.length > 0) {
      const trRows = await suppliersRepo.listTranslations(lang, supplierRows.map((row) => row.id));
      for (const tr of trRows) {
        trMap.set(Number(tr.supplier_id), tr);
      }
    }

    const result = supplierRows.map((row) => mapSupplierRow(row, trMap.get(Number(row.id)) || null));
    // 缓存完整响应（含翻译映射结果）
    supplierResponseCache.set(cacheKey, { data: result, expires: Date.now() + SUPPLIER_CACHE_TTL });
    res.json(result);

    // fire-and-forget：缺失译文的供应商后台逐家补翻（下次请求即命中缓存）
    if (SUPPLIER_TRANSLATION_LANGS[lang]) {
      const missing = supplierRows.filter((row) => !trMap.has(Number(row.id)));
      if (missing.length > 0) {
        void backfillSupplierTranslations(missing, lang);
      }
    }
  }));

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
        await suppliersRepo.upsertTranslation(row.id, lang, translations[0], translations[1], provider);
      } catch (err: any) {
        if (err?.message === "TRANSLATION_UNAVAILABLE") return; // 全链不可用：整批放弃
        // 单家失败不阻塞后续供应商
      } finally {
        pendingSupplierTranslations.delete(pendingKey);
      }
    }
  }

  // 4b. GET SUPPLIER PLAINTEXT CONTACT (VIP only)
  router.get("/api/suppliers/:id/contact", asyncHandler(async (req, res) => {
    const supplierId = Number(String(req.params.id).replace(/^sup-db-/, ""));
    if (!supplierId) return res.status(400).json({ error: "INVALID_SUPPLIER" });
    const userKey = normalizeUserKey(req.query.user_key) || ""; // 本地差异 #7：F.1 归一化收敛
    if (!userKey) return res.status(403).json({ error: "VIP_REQUIRED" });

    // VIP 判定与登录接口同款：active 订阅未过期 或 membership_tier = 'vip'
    const user = await usersRepo.findByKey(userKey);
    if (!user) return res.status(403).json({ error: "VIP_REQUIRED" });
    const subs = await membershipRepo.findActiveSubscriptions(userKey);
    const isVip = subs.length > 0 || user.membership_tier === "vip";
    if (!isVip) return res.status(403).json({ error: "VIP_REQUIRED" });

    const supplier = await suppliersRepo.findContact(supplierId);
    if (!supplier) return res.status(404).json({ error: "SUPPLIER_NOT_FOUND" });

    res.json({
      contactPerson: supplier.contact || "",
      contactPhone: supplier.phone || "",
      contactEmail: supplier.email || "",
    });
  }));

  // 5. POST REGISTER NEW SUPPLIER (persisted into crm_suppliers)
  router.post("/api/suppliers", asyncHandler(async (req, res) => {
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
      let supplierRow = await suppliersRepo.findCrmByRequestHash(requestHash);
      if (!supplierRow) {
        const insertId = await suppliersRepo.insertCrmSupplier({
          companyName: String(nameZh).trim(),
          contactName: String(contactPerson).trim(),
          telephone: String(contactPhone || "").trim(),
          email: String(contactEmail).trim(),
          mainProduct,
          industry: String(industryZh || "").trim(),
          certification,
          requestHash,
        });
        supplierRow = await suppliersRepo.findCrmById(insertId);
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

      // 新供应商注册→使缓存失效，下次请求重新加载
      invalidateSupplierCache();

    return res.status(201).json({ supplier: newSupplier, companionLead });
  }));

  router.post("/api/supplier-claims", asyncHandler(async (req, res) => {
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
    const supplierId = await suppliersRepo.findCrmIdByCompanyName(companyName);

    const claimId = await suppliersRepo.insertClaim({
      userKey,
      supplierId,
      companyName,
      supplierType,
      contactName,
      contactPhone,
      contactEmail,
      businessLicenseNo,
    });

    res.status(201).json({ success: true, id: claimId, status: "pending" });
  }));

  return router;
}
