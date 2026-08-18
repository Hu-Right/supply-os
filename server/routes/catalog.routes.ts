/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from "express";
import type { AppContext } from "../context";
import { asyncHandler } from "../middleware/errorHandler";
import { translateViaChain, type ChainResult } from "../services/translation/chain";
// ── UNSPSC 类目标题按需翻译（对齐供应商翻译：缓存表 + DeepSeek→Gemini 链 + 并发去重）──
// 源文本为类目英文标题；zh/en 界面直接用类目表原列，仅 fr/ru/es/ar 需要译文
const UNSPSC_TRANSLATION_LANGS: Record<string, string> = {
  fr: "French",
  ru: "Russian",
  es: "Spanish",
  ar: "Arabic",
};

// 同一 (父级列表, lang) 的并发首次翻译只触发一次翻译链调用
const pendingUnspscTranslations = new Map<string, Promise<ChainResult>>();

export function createCatalogRouter(ctx: AppContext): Router {
  const router = Router();
  const catalogRepo = ctx.catalogRepo;

  // UNSPSC 一级行业分类准静态，服务端内存缓存 10 分钟（按 lang 分桶）
  const industriesCache = new Map<string, { data: any[]; ts: number }>();
  const INDUSTRIES_CACHE_TTL = 10 * 60 * 1000;

  router.get("/api/certifications", asyncHandler(async (req, res) => {
      const rows = await catalogRepo.listActiveCertifications();
      res.json(rows);
  }));

  // 6b. GET UNSPSC INDUSTRIES
  // lang=fr/ru/es/ar 时 LEFT JOIN 译文缓存附加 title_i18n（缺失回退英文并后台补翻）；
  // zh/en 或不传 lang 时行为与旧版完全一致
  async function queryUnspscRows(whereAndOrder: string, params: any[], lang: string) {
    if (UNSPSC_TRANSLATION_LANGS[lang]) {
      return catalogRepo.listUnspscWithTranslation(
        `SELECT u.id, u.title_zh, u.title, u.code, u.parent_id, u.level, tr.title_tr AS title_i18n
         FROM crm_unspsc_codes u
         LEFT JOIN crm_unspsc_translations tr ON tr.code_id = u.id AND tr.lang = ?
         WHERE ${whereAndOrder}`,
        [lang, ...params],
      );
    }
    return catalogRepo.listUnspscWithTranslation(
      `SELECT u.id, u.title_zh, u.title, u.code, u.parent_id, u.level FROM crm_unspsc_codes u WHERE ${whereAndOrder}`,
      params,
    );
  }

  // 缺译行后台整批补翻：一次翻译链调用翻译整个列表，入库后下次请求命中缓存；
  // 通道未配置或翻译失败静默放弃（响应已按英文回退，不影响可用性）
  async function backfillUnspscTranslations(rows: any[], lang: string, scopeKey: string) {
    const missing = rows.filter(
      (row) => !row.title_i18n && String(row.title || row.title_zh || "").trim()
    );
    if (missing.length === 0) return;
    const pendingKey = `${scopeKey}:${lang}`;
    if (pendingUnspscTranslations.has(pendingKey)) return;
    const titles = missing.map((row) => String(row.title || row.title_zh || "").trim());
    const pending = translateViaChain(titles, "en", lang);
    pendingUnspscTranslations.set(pendingKey, pending);
    try {
      const { translations, provider } = await pending;
      const entries = missing.map((row, i) => ({
        codeId: row.id, lang, titleTr: translations[i], model: provider,
      }));
      await catalogRepo.upsertUnspscTranslations(entries);
    } catch {
      // TRANSLATION_UNAVAILABLE / 单批失败：静默，前端已有英文兜底
    } finally {
      pendingUnspscTranslations.delete(pendingKey);
    }
  }

  router.get("/api/unspsc/industries", asyncHandler(async (req, res) => {
      const lang = String(req.query.lang || "").toLowerCase();
      const cacheKey = lang || "_default";
      const now = Date.now();
      const cached = industriesCache.get(cacheKey);
      if (cached && now - cached.ts < INDUSTRIES_CACHE_TTL) {
        res.setHeader("Cache-Control", "public, max-age=600");
        return res.json(cached.data);
      }
      const rows = await queryUnspscRows("u.level = 1 ORDER BY u.id", [], lang);
      industriesCache.set(cacheKey, { data: rows, ts: now });
      res.setHeader("Cache-Control", "public, max-age=600");
      res.json(rows);
      if (UNSPSC_TRANSLATION_LANGS[lang]) {
        void backfillUnspscTranslations(rows, lang, "industries");
      }
  }));

  router.get("/api/unspsc/children", asyncHandler(async (req, res) => {
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
  }));

  router.get("/api/unspsc/search", asyncHandler(async (req, res) => {
      const q = String(req.query.q || "").trim();
      if (q.length < 2) return res.json([]);
      const rows = await catalogRepo.searchUnspsc(q);
      res.json(rows);
  }));

  // 智能推断 UNSPSC 类目：输入主营业务关键词，返回最优匹配路径（result，
  // 置信度 >= 0.6 才有值）与候选列表（candidates，供前端让用户确认选择）
  router.get("/api/unspsc/smart-infer", asyncHandler(async (req, res) => {
      const q = String(req.query.q || "").trim();
      if (q.length < 1) return res.json({ result: null, candidates: [] });
      const { best, candidates } = await catalogRepo.smartInferUnspsc(q);
      res.json({ result: best, candidates });
  }));

  return router;
}
