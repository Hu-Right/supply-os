/**
 * AI 拆标摘要服务编排 v2
 * @module lib/services/ai-summary
 * @description 缓存优先 → 组装 prompt（公告 + 附件 + 供应商画像含简介）→ 调用 LLM → 落库。
 *              支持 6 维度分析 + 流式输出。forceRegenerate 时先删缓存。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { LlmConfigRepo } from "../../repos/llm-config.repo";
import { AiSummaryRepo } from "../../repos/ai-summary.repo";
import { encryptApiKey } from "./crypto";
import { callLlmForSummary, callLlmForSummaryStream, parseAiSummaryResponse } from "./llm-client";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";
import { extractAttachmentsText } from "./doc-extractor";
import {
  errNoticeNotFound, errLlmCallFailed, errLlmBadFormat,
} from "./errors";
import { resolveLlmCredentials } from "../ai/shared/llm-credentials";

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

/** 供应商画像（含企业简介 intro + 诊断表国际化能力字段） */
async function fetchSupplierProfile(pool: Pool, userId: number) {
  const [userRows] = await pool.query(
    "SELECT supplier_id FROM crm_users WHERE id = ? LIMIT 1",
    [userId],
  );
  const supplierId = Number((userRows as RowDataPacket[])[0]?.supplier_id || 0);
  if (!supplierId) return null;

  // JOIN 诊断表获取国际化能力字段
  const [supRows] = await pool.query(
    `SELECT s.company, s.industry, s.products, s.certification, s.country, s.city, s.type, s.intro,
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

  if (forceRegenerate) await summaryRepo.remove(userId, noticeId);

  const cached = await summaryRepo.find(userId, noticeId);
  if (cached) return toResult(cached, true, cached.model || "", cached.input_tokens ?? null, cached.output_tokens ?? null);

  const creds = await resolveLlmCredentials(pool, userId);

  const noticeBase = await fetchNoticeForPrompt(pool, noticeId);
  if (!noticeBase) errNoticeNotFound();
  const notice = await enrichFromOpportunity(pool, noticeId, noticeBase);

  // 附件文本提取（静默降级）
  const attachmentsText = await extractAttachmentsText(notice.documents).catch(() => "");

  const supplier = await fetchSupplierProfile(pool, userId);

  const userPrompt = buildUserPrompt(
    { ...notice, attachments_text: attachmentsText } as any,
    supplier,
  );

  let result: Awaited<ReturnType<typeof callLlmForSummary>>;
  try {
    result = await callLlmForSummary(creds, SYSTEM_PROMPT, userPrompt);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "LLM_BAD_JSON" || msg === "LLM_BAD_SHAPE") errLlmBadFormat();
    errLlmCallFailed(msg);
  }

  await summaryRepo.upsert({
    userId, noticeId,
    coreDeliverables: result.data.coreDeliverables,
    keyQualifications: result.data.keyQualifications,
    paymentCycle: result.data.paymentCycle,
    competitiveLandscape: result.data.competitiveLandscape,
    bidStrategy: result.data.bidStrategy,
    riskAlerts: result.data.riskAlerts,
    model: result.model,
    providerBaseUrl: creds.baseUrl,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  return toResult(null, false, result.model, result.inputTokens, result.outputTokens);
}

/** 流式入口：返回 AsyncIterable<string>，逐 token 推送 JSON 片段 */
export async function* streamAiSummary(
  pool: Pool,
  userId: number,
  noticeId: number,
): AsyncIterable<string> {
  const summaryRepo = new AiSummaryRepo(pool);

  // 缓存命中且内容非空才一次性推送完整 JSON；空/损坏记录（历史误存的空结果）视为未命中，继续重新生成并覆盖
  const cached = await summaryRepo.find(userId, noticeId);
  if (cached && String(cached.core_deliverables || "").trim()) {
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

  let creds;
  try {
    creds = await resolveLlmCredentials(pool, userId);
  } catch {
    yield JSON.stringify({ error: "LLM_NOT_CONFIGURED" });
    return;
  }

  const noticeBase = await fetchNoticeForPrompt(pool, noticeId);
  if (!noticeBase) { yield JSON.stringify({ error: "NOTICE_NOT_FOUND" }); return; }
  const notice = await enrichFromOpportunity(pool, noticeId, noticeBase);

  const attachmentsText = await extractAttachmentsText(notice.documents).catch(() => "");
  const supplier = await fetchSupplierProfile(pool, userId);

  const userPrompt = buildUserPrompt(
    { ...notice, attachments_text: attachmentsText } as any,
    supplier,
  );

  // 流式调用 LLM，逐 token yield；同时累积完整文本，结束后落库缓存。
  // 修复：此前流式路径不持久化，导致"开始分析"结果刷新后丢失、按钮复现。
  let accumulated = "";
  try {
    for await (const chunk of callLlmForSummaryStream(
      creds,
      SYSTEM_PROMPT,
      userPrompt,
    )) {
      accumulated += chunk;
      yield chunk;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    yield JSON.stringify({ error: msg });
    return;
  }

  // 持久化：解析累积文本为 6 维度并 upsert，使下次进入直接命中缓存。
  // 仅在解析出"有实际内容"的结果时落库——避免把 LLM 偶发的空/无效响应存成缓存，
  // 否则下次流式命中该空记录会"一闪而过"却无任何反馈。解析/落库失败静默降级。
  try {
    const data = parseAiSummaryResponse(accumulated);
    if (String(data.coreDeliverables || "").trim()) {
      await summaryRepo.upsert({
        userId,
        noticeId,
        coreDeliverables: data.coreDeliverables,
        keyQualifications: data.keyQualifications,
        paymentCycle: data.paymentCycle,
        competitiveLandscape: data.competitiveLandscape,
        bidStrategy: data.bidStrategy,
        riskAlerts: data.riskAlerts,
        model: creds.model,
        providerBaseUrl: creds.baseUrl,
      });
    }
  } catch { /* 忽略：不影响已流式返回的内容 */ }
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
