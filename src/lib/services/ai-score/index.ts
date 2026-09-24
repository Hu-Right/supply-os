/**
 * AI 适配评分服务编排
 * @module lib/services/ai-score
 * @description 缓存优先 → 组装评分 prompt → 调用用户 LLM → 落库。
 *              复用 ai-summary 的数据获取逻辑（公告+供应商画像）。
 */
import type { Pool } from "mysql2/promise";
import { AiSummaryRepo } from "../../repos/ai-summary.repo";
import { callLlmForScore } from "./llm-client";
import { SCORE_SYSTEM_PROMPT, buildScoreUserPrompt, type AiScoreRaw } from "./prompt";
import { errLlmCallFailed, errNoticeNotFound, errSupplierProfileRequired } from "../ai-summary/errors";
import { fetchNoticeContext } from "../ai/shared/notice-context";
import { fetchSupplierProfile } from "../ai/shared/supplier-profile";
import { resolveLlmCredentials } from "../ai/shared/llm-credentials";

export interface AiScoreResult extends AiScoreRaw {
  cached: boolean;
}

/** 供应商画像取数已上收到 `ai/shared/supplier-profile`（唯一出口，改读 v2 诊断表）。
 *  ai-match 仍从本模块按旧名引用，故保留别名转发，避免同一取数逻辑再抄一份。 */
export { fetchSupplierProfile as fetchSupplierForScore } from "../ai/shared/supplier-profile";

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

  const supplier = await fetchSupplierProfile(pool, userId);
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
