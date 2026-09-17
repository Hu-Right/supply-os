/**
 * AI 拆标摘要服务编排 v2
 * @module lib/services/ai-summary
 * @description 缓存优先 → 组装 prompt（公告 + 附件 + 供应商画像含简介）→ 调用 LLM → 落库。
 *              支持 6 维度分析 + 流式输出。forceRegenerate 时先删缓存。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { LlmConfigRepo } from "../../repos/llm-config.repo";
import { AiSummaryRepo } from "../../repos/ai-summary.repo";
import { encryptApiKey, decryptApiKey } from "./crypto";
import { callLlmForSummary, callLlmForSummaryStream } from "./llm-client";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";
import { extractAttachmentsText } from "./doc-extractor";
import {
  errLlmNotConfigured, errNoticeNotFound, errLlmCallFailed, errLlmBadFormat,
} from "./errors";

export interface AiSummaryResult {
  coreDeliverables: string;
  keyQualifications: string;
  paymentCycle: string;
  competitiveLandscape: string;
  bidStrategy: string;
  riskAlerts: string;
  model: string;
  cached: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** 公告分析所需字段（从主表获取） */
async function fetchNoticeForPrompt(pool: Pool, noticeId: number): Promise<RowDataPacket | null> {
  const [rows] = await pool.query(
    `SELECT n.id, n.title, n.notice_type, n.agency, n.country, n.deadline,
            n.estimated_value, n.description, n.documents
     FROM crm_bid_notices n WHERE n.id = ? LIMIT 1`,
    [noticeId],
  );
  return (rows as RowDataPacket[])[0] ?? null;
}

/** 供应商画像（含企业简介 intro） */
async function fetchSupplierProfile(pool: Pool, userId: number) {
  const [userRows] = await pool.query(
    "SELECT supplier_id FROM crm_users WHERE id = ? LIMIT 1",
    [userId],
  );
  const supplierId = Number((userRows as RowDataPacket[])[0]?.supplier_id || 0);
  if (!supplierId) return null;
  const [supRows] = await pool.query(
    `SELECT company, industry, products, certification, country, city, type, intro
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
    intro: String(row.intro || ""),
  };
}

/** 机会表补充字段 + documents */
async function enrichFromOpportunity(pool: Pool, noticeId: number, notice: RowDataPacket) {
  const [rows] = await pool.query(
    `SELECT o.eligibility, o.technical_hurdles, o.supplier_conditions,
            o.description_cn, o.agency_full, o.documents
     FROM crm_bid_opportunities o
     WHERE o.source_notice_id = (SELECT notice_id FROM crm_bid_notices WHERE id = ? LIMIT 1)
       AND (o.is_qualified = 1 OR o.status = 1 OR o.audit_status = 1)
     LIMIT 1`,
    [noticeId],
  );
  const opp = (rows as RowDataPacket[])[0];
  if (!opp) return notice;
  return {
    ...notice,
    eligibility: opp.eligibility || "",
    technical_hurdles: opp.technical_hurdles || "",
    supplier_conditions: opp.supplier_conditions || "",
    description_cn: opp.description_cn || "",
    agency_full: opp.agency_full || notice.agency_full || "",
    documents: opp.documents || notice.documents,
  };
}

function toResult(cached: RowDataPacket | null, cachedFlag: boolean, model: string, inputTokens: number | null, outputTokens: number | null): AiSummaryResult {
  return {
    coreDeliverables: cached?.core_deliverables || "",
    keyQualifications: cached?.key_qualifications || "",
    paymentCycle: cached?.payment_cycle || "",
    competitiveLandscape: cached?.competitive_landscape || "",
    bidStrategy: cached?.bid_strategy || "",
    riskAlerts: cached?.risk_alerts || "",
    model: cached?.model || model,
    cached: cachedFlag,
    inputTokens: cached?.input_tokens ?? inputTokens,
    outputTokens: cached?.output_tokens ?? outputTokens,
  };
}

/** 主入口：获取或生成 AI 摘要（非流式，用于缓存回填） */
export async function getOrGenerateAiSummary(
  pool: Pool,
  userId: number,
  noticeId: number,
  forceRegenerate = false,
): Promise<AiSummaryResult> {
  const summaryRepo = new AiSummaryRepo(pool);
  const configRepo = new LlmConfigRepo(pool);

  if (forceRegenerate) await summaryRepo.remove(userId, noticeId);

  const cached = await summaryRepo.find(userId, noticeId);
  if (cached) return toResult(cached, true, cached.model || "", cached.input_tokens ?? null, cached.output_tokens ?? null);

  const config = await configRepo.findActiveByUser(userId);
  if (!config) errLlmNotConfigured();

  const noticeBase = await fetchNoticeForPrompt(pool, noticeId);
  if (!noticeBase) errNoticeNotFound();
  const notice = await enrichFromOpportunity(pool, noticeId, noticeBase!);

  // 附件文本提取（静默降级）
  const attachmentsText = await extractAttachmentsText(notice.documents).catch(() => "");

  const supplier = await fetchSupplierProfile(pool, userId);

  const userPrompt = buildUserPrompt(
    { ...notice, attachments_text: attachmentsText } as any,
    supplier,
  );

  let apiKey: string;
  try { apiKey = decryptApiKey(config!.api_key); } catch { errLlmNotConfigured(); }

  let result;
  try {
    result = await callLlmForSummary(
      { baseUrl: config!.base_url, apiKey, model: config!.model },
      SYSTEM_PROMPT,
      userPrompt,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "LLM_BAD_JSON" || msg === "LLM_BAD_SHAPE") errLlmBadFormat();
    errLlmCallFailed(msg);
  }

  await summaryRepo.upsert({
    userId, noticeId,
    coreDeliverables: result!.data.coreDeliverables,
    keyQualifications: result!.data.keyQualifications,
    paymentCycle: result!.data.paymentCycle,
    competitiveLandscape: result!.data.competitiveLandscape,
    bidStrategy: result!.data.bidStrategy,
    riskAlerts: result!.data.riskAlerts,
    model: result!.model,
    providerBaseUrl: config!.base_url,
    inputTokens: result!.inputTokens,
    outputTokens: result!.outputTokens,
  });

  return toResult(null, false, result!.model, result!.inputTokens, result!.outputTokens);
}

/** 流式入口：返回 AsyncIterable<string>，逐 token 推送 JSON 片段 */
export async function* streamAiSummary(
  pool: Pool,
  userId: number,
  noticeId: number,
): AsyncIterable<string> {
  const summaryRepo = new AiSummaryRepo(pool);
  const configRepo = new LlmConfigRepo(pool);

  // 缓存命中：一次性推送完整 JSON
  const cached = await summaryRepo.find(userId, noticeId);
  if (cached) {
    const full = JSON.stringify({
      coreDeliverables: cached.core_deliverables || "",
      keyQualifications: cached.key_qualifications || "",
      paymentCycle: cached.payment_cycle || "",
      competitiveLandscape: cached.competitive_landscape || "",
      bidStrategy: cached.bid_strategy || "",
      riskAlerts: cached.risk_alerts || "",
    });
    yield full;
    return;
  }

  const config = await configRepo.findActiveByUser(userId);
  if (!config) { yield JSON.stringify({ error: "LLM_NOT_CONFIGURED" }); return; }

  const noticeBase = await fetchNoticeForPrompt(pool, noticeId);
  if (!noticeBase) { yield JSON.stringify({ error: "NOTICE_NOT_FOUND" }); return; }
  const notice = await enrichFromOpportunity(pool, noticeId, noticeBase!);

  const attachmentsText = await extractAttachmentsText(notice.documents).catch(() => "");
  const supplier = await fetchSupplierProfile(pool, userId);

  const userPrompt = buildUserPrompt(
    { ...notice, attachments_text: attachmentsText } as any,
    supplier,
  );

  let apiKey: string;
  try { apiKey = decryptApiKey(config!.api_key); } catch { yield JSON.stringify({ error: "LLM_NOT_CONFIGURED" }); return; }

  // 流式调用 LLM，逐 token yield
  try {
    for await (const chunk of callLlmForSummaryStream(
      { baseUrl: config!.base_url, apiKey, model: config!.model },
      SYSTEM_PROMPT,
      userPrompt,
    )) {
      yield chunk;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    yield JSON.stringify({ error: msg });
    return;
  }
}

/** 保存用户 LLM 配置（api_key 加密后落库） */
export async function saveLlmConfig(
  pool: Pool,
  userId: number,
  providerName: string,
  baseUrl: string,
  apiKeyPlain: string,
  model: string,
): Promise<void> {
  const configRepo = new LlmConfigRepo(pool);
  const encrypted = encryptApiKey(apiKeyPlain);
  await configRepo.upsert(userId, providerName, baseUrl, encrypted, model);
}
