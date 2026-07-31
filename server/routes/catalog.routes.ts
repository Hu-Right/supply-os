/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from "express";
import type { AppContext } from "../context";
import { translateViaChain, type ChainResult } from "../services/translation/chain";

// ── UNSPSC 类目标题按需翻译（对齐供应商翻译：缓存表 + 有道→DeepSeek 链 + 并发去重）──
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
  const { dbPool } = ctx;

  router.get("/api/certifications", async (req, res) => {
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

  router.get("/api/unspsc/industries", async (req, res) => {
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

  router.get("/api/unspsc/children", async (req, res) => {
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

  router.get("/api/unspsc/search", async (req, res) => {
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

  return router;
}
