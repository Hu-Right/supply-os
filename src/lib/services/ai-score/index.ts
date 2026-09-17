/**
 * AI 适配评分服务编排
 * @module lib/services/ai-score
 * @description 缓存优先 → 组装评分 prompt → 调用用户 LLM → 落库。
 *              复用 ai-summary 的数据获取逻辑（公告+供应商画像）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { LlmConfigRepo } from "../../repos/llm-config.repo";
import { AiSummaryRepo } from "../../repos/ai-summary.repo";
import { decryptApiKey } from "../ai-summary/crypto";
import { callLlmForScore } from "./llm-client";
import { SCORE_SYSTEM_PROMPT, buildScoreUserPrompt, type AiScoreRaw } from "./prompt";
import { errLlmNotConfigured, errNoticeNotFound, errLlmCallFailed } from "../ai-summary/errors";

export interface AiScoreResult extends AiScoreRaw {
  cached: boolean;
}

/** 公告评分所需字段 */
async function fetchNoticeForScore(pool: Pool, noticeId: number): Promise<RowDataPacket | null> {
  const [rows] = await pool.query(
    `SELECT n.id, n.title, n.notice_type, n.country, n.deadline, n.estimated_value
     FROM crm_bid_notices n WHERE n.id = ? LIMIT 1`,
    [noticeId],
  );
  const base = (rows as RowDataPacket[])[0];
  if (!base) return null;

  // 机会表补充资格条件
  const [oppRows] = await pool.query(
    `SELECT o.eligibility, o.technical_hurdles, o.supplier_conditions
     FROM crm_bid_opportunities o
     WHERE o.source_notice_id = (SELECT notice_id FROM crm_bid_notices WHERE id = ? LIMIT 1)
       AND (o.is_qualified = 1 OR o.status = 1 OR o.audit_status = 1)
     LIMIT 1`,
    [noticeId],
  );
  const opp = (oppRows as RowDataPacket[])[0];
  return {
    ...base,
    eligibility: opp?.eligibility || "",
    technical_hurdles: opp?.technical_hurdles || "",
    supplier_conditions: opp?.supplier_conditions || "",
  };
}

/** 供应商画像（含评分所需扩展字段） */
async function fetchSupplierForScore(pool: Pool, userId: number) {
  const [userRows] = await pool.query(
    "SELECT supplier_id FROM crm_users WHERE id = ? LIMIT 1",
    [userId],
  );
  const supplierId = Number((userRows as RowDataPacket[])[0]?.supplier_id || 0);
  if (!supplierId) return null;
  const [supRows] = await pool.query(
    `SELECT company, industry, products, certification, country, city, type,
            registered_capital, established_at, intro
     FROM supplier WHERE id = ? LIMIT 1`,
    [supplierId],
  );
  const row = (supRows as RowDataPacket[])[0];
  if (!row) return null;
  return {
    company: String(row.company || ""),
    industry: String(row.industry || ""),
    products: String(row.products || ""),
    certification: String(row.certification || ""),
    country: String(row.country || ""),
    city: String(row.city || ""),
    type: String(row.type || ""),
    registered_capital: String(row.registered_capital || ""),
    established_at: String(row.established_at || ""),
    intro: String(row.intro || ""),
  };
}

/** 主入口：获取或生成 AI 适配评分 */
export async function getOrGenerateAiScore(
  pool: Pool,
  userId: number,
  noticeId: number,
  forceRegenerate = false,
): Promise<AiScoreResult> {
  const summaryRepo = new AiSummaryRepo(pool);
  const configRepo = new LlmConfigRepo(pool);

  if (forceRegenerate) await summaryRepo.removeScore(userId, noticeId);

  // 缓存命中
  const cached = await summaryRepo.findScore(userId, noticeId);
  if (cached) {
    return {
      qualification: cached.score_qualification ?? 0,
      experience: cached.score_experience ?? 0,
      certification: cached.score_certification ?? 0,
      region: cached.score_region ?? 0,
      scale: cached.score_scale ?? 0,
      delivery: cached.score_delivery ?? 0,
      price: cached.score_price ?? 0,
      overall: cached.score_overall ?? 0,
      reasons: cached.score_reasons ? JSON.parse(cached.score_reasons) : {},
      cached: true,
    };
  }

  const config = await configRepo.findActiveByUser(userId);
  if (!config) errLlmNotConfigured();

  const notice = await fetchNoticeForScore(pool, noticeId);
  if (!notice) errNoticeNotFound();

  const supplier = await fetchSupplierForScore(pool, userId);
  const userPrompt = buildScoreUserPrompt(notice as any, supplier);

  let apiKey: string;
  try { apiKey = decryptApiKey(config!.api_key); } catch { errLlmNotConfigured(); }

  let result;
  try {
    result = await callLlmForScore(
      { baseUrl: config!.base_url, apiKey, model: config!.model },
      SCORE_SYSTEM_PROMPT,
      userPrompt,
    );
  } catch (err) {
    errLlmCallFailed(err instanceof Error ? err.message : String(err));
  }

  const data = result!.data;
  await summaryRepo.upsertScore({
    userId, noticeId,
    qualification: data.qualification,
    experience: data.experience,
    certification: data.certification,
    region: data.region,
    scale: data.scale,
    delivery: data.delivery,
    price: data.price,
    overall: data.overall,
    reasons: JSON.stringify(data.reasons),
  });

  return { ...data, cached: false };
}
