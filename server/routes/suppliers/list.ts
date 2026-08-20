/**
 * 供应商列表路由（含翻译缓存）
 * GET /api/suppliers
 */
import { Router } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import { translateViaChain, type ChainResult } from "../../services/translation/chain";
import { mapSupplierRow } from "../../services/suppliers";
import { SupplierDirectoryRepo } from "../../repos/suppliers/supplier-directory.repo";
import { SupplierRegistrationRepo } from "../../repos/suppliers/supplier-registration.repo";

// 同一 (supplier, lang) 的并发首次翻译只触发一次翻译链调用
const pendingSupplierTranslations = new Map<string, Promise<ChainResult>>();

// 供应商字段按需翻译
const SUPPLIER_TRANSLATION_LANGS: Record<string, string> = {
  en: "English",
  fr: "French",
  ru: "Russian",
  es: "Spanish",
  ar: "Arabic",
};

export interface ListDeps {
  directoryRepo: SupplierDirectoryRepo;
  registrationRepo: SupplierRegistrationRepo;
  cache: Map<string, { data: any; expires: number }>;
  cacheTtl: number;
  invalidateCache: () => void;
}

export function createSupplierListRouter(deps: ListDeps): Router {
  const router = Router();
  const { directoryRepo, registrationRepo, cache, cacheTtl, invalidateCache } = deps;

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

      const cacheKey = `p:${lang}:${page}:${pageSize}:${search || ""}:${type || ""}:${industry || ""}`;
      const cached = cache.get(cacheKey);
      if (cached && cached.expires > Date.now()) {
        res.json(cached.data);
        return;
      }

      const { items: supplierRows, total } = await directoryRepo.listDirectoryPaginated({
        limit: pageSize,
        offset: (page - 1) * pageSize,
        lang,
        search,
        type,
        industry,
      });

      const trMap = new Map<number, any>();
      if (SUPPLIER_TRANSLATION_LANGS[lang] && supplierRows.length > 0) {
        const trRows = await registrationRepo.listTranslations(lang, supplierRows.map((row) => row.id));
        for (const tr of trRows) {
          trMap.set(Number(tr.supplier_id), tr);
        }
      }

      const items = supplierRows.map((row) => mapSupplierRow(row, trMap.get(Number(row.id)) || null));
      const result = { items, total, page, pageSize };

      cache.set(cacheKey, { data: result, expires: Date.now() + 2 * 60 * 1000 });
      res.json(result);

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
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      res.json(cached.data);
      return;
    }

    const supplierRows = await directoryRepo.listDirectory();

    const trMap = new Map<number, any>();
    if (SUPPLIER_TRANSLATION_LANGS[lang] && supplierRows.length > 0) {
      const trRows = await registrationRepo.listTranslations(lang, supplierRows.map((row) => row.id));
      for (const tr of trRows) {
        trMap.set(Number(tr.supplier_id), tr);
      }
    }

    const result = supplierRows.map((row) => mapSupplierRow(row, trMap.get(Number(row.id)) || null));
    cache.set(cacheKey, { data: result, expires: Date.now() + cacheTtl });
    res.json(result);

    if (SUPPLIER_TRANSLATION_LANGS[lang]) {
      const missing = supplierRows.filter((row) => !trMap.has(Number(row.id)));
      if (missing.length > 0) {
        void backfillSupplierTranslations(missing, lang);
      }
    }
  }));

  // 缺失译文后台补翻
  async function backfillSupplierTranslations(rows: any[], lang: string) {
    for (const row of rows) {
      const pendingKey = `${row.id}:${lang}`;
      if (pendingSupplierTranslations.has(pendingKey)) continue;
      const fields = [
        String(row.industry || "").trim(),
        String(row.products || "").trim(),
      ];
      const pending = translateViaChain(fields, "zh", lang);
      pendingSupplierTranslations.set(pendingKey, pending);
      try {
        const { translations, provider } = await pending;
        await registrationRepo.upsertTranslation(row.id, lang, translations[0], translations[1], provider);
      } catch (err: any) {
        if (err?.message === "TRANSLATION_UNAVAILABLE") return;
      } finally {
        pendingSupplierTranslations.delete(pendingKey);
      }
    }
  }

  return router;
}
