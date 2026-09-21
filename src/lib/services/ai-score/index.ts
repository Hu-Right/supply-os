/**
 * AI 适配评分服务编排
 * @module lib/services/ai-score
 * @description 缓存优先 → 组装评分 prompt → 调用用户 LLM → 落库。
 *              复用 ai-summary 的数据获取逻辑（公告+供应商画像）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { AiSummaryRepo } from "../../repos/ai-summary.repo";
import { callLlmForScore } from "./llm-client";
import { SCORE_SYSTEM_PROMPT, buildScoreUserPrompt, type AiScoreRaw } from "./prompt";
import { errLlmCallFailed, errNoticeNotFound, errSupplierProfileRequired } from "../ai-summary/errors";
import { fetchNoticeContext, type NoticeContext } from "../ai/shared/notice-context";
import { resolveLlmCredentials } from "../ai/shared/llm-credentials";

export interface AiScoreResult extends AiScoreRaw {
  cached: boolean;
}

/** 供应商画像（含评分所需扩展字段，JOIN 诊断表获取国际化能力数据） */
async function fetchSupplierForScore(pool: Pool, userId: number) {
  const [userRows] = await pool.query(
    "SELECT supplier_id FROM crm_users WHERE id = ? LIMIT 1",
    [userId],
  );
  const supplierId = Number((userRows as RowDataPacket[])[0]?.supplier_id || 0);
  if (!supplierId) return null;

  // JOIN 诊断表获取国际化能力字段
  const [supRows] = await pool.query(
    `SELECT s.company, s.industry, s.products, s.certification, s.country, s.city, s.type,
            s.registered_capital, s.established_at, s.intro,
            q.employee_count, q.export_scale, q.service_countries,
            q.overseas_companies, q.ungm_status, q.english_team,
            q.payment_terms, q.bid_willingness
     FROM supplier s
     LEFT JOIN crm_users u ON u.supplier_id = s.id
     LEFT JOIN crm_supplier_qualification q ON q.user_id = u.id
     WHERE s.id = ?
     ORDER BY q.id DESC
     LIMIT 1`,
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
    // 诊断表字段
    employee_count: String(row.employee_count || ""),
    export_scale: String(row.export_scale || ""),
    service_countries: String(row.service_countries || ""),
    overseas_companies: String(row.overseas_companies || ""),
    ungm_status: String(row.ungm_status || ""),
    english_team: String(row.english_team || ""),
    payment_terms: String(row.payment_terms || ""),
    bid_willingness: String(row.bid_willingness || ""),
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

  if (forceRegenerate) await summaryRepo.removeScore(userId, noticeId);

  // 缓存命中：仅当评分列已写入才算命中。
  // 避免“仅有摘要 / 仅有匹配”的空评分行（score_* 为 NULL）被误判为已评分而返回全 0。
  const cached = await summaryRepo.findScore(userId, noticeId);
  if (cached && cached.score_overall != null) {
    let details = {} as AiScoreResult["details"];
    try {
      const parsed = cached.score_reasons ? JSON.parse(cached.score_reasons) : {};
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        details = parsed as AiScoreResult["details"];
      }
    } catch { /* 非预期格式，保持空对象 */ }
    return {
      qualification: cached.score_qualification ?? 0,
      experience: cached.score_experience ?? 0,
      certification: cached.score_certification ?? 0,
      region: cached.score_region ?? 0,
      scale: cached.score_scale ?? 0,
      delivery: cached.score_delivery ?? 0,
      price: cached.score_price ?? 0,
      overall: cached.score_overall ?? 0,
      details,
      reasoning: cached.score_reasoning || "",
      cached: true,
    };
  }

  const creds = await resolveLlmCredentials(pool, userId);

  const notice = await fetchNoticeContext(pool, noticeId);
  if (!notice) errNoticeNotFound();

  const supplier = await fetchSupplierForScore(pool, userId);
  // 无企业主体/画像 → 没有可评估对象，早返回友好提示，避免拿 null 画像跑出一份无意义评分。
  if (!supplier) errSupplierProfileRequired();
  const userPrompt = buildScoreUserPrompt(notice as unknown as Record<string, unknown>, supplier);

  let result: Awaited<ReturnType<typeof callLlmForScore>>;
  try {
    result = await callLlmForScore(creds, SCORE_SYSTEM_PROMPT, userPrompt);
  } catch (err) {
    errLlmCallFailed(err instanceof Error ? err.message : String(err));
  }

  const data = result.data;
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
    reasons: JSON.stringify(data.details),
    reasoning: data.reasoning || "",
    model: result.model,
    providerBaseUrl: creds.baseUrl,
  });

  return { ...data, cached: false };
}
