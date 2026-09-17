/**
 * AI 拆标摘要服务编排
 * @module lib/services/ai-summary
 * @description 缓存优先 → 组装 prompt（公告 + 供应商画像）→ 调用用户 LLM → 落库。
 *              forceRegenerate 时先删缓存。供应商画像缺失时走通用分析。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { LlmConfigRepo } from "../../repos/llm-config.repo";
import { AiSummaryRepo } from "../../repos/ai-summary.repo";
import { encryptApiKey, decryptApiKey } from "./crypto";
import { callLlmForSummary } from "./llm-client";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";
import {
  errLlmNotConfigured, errNoticeNotFound, errLlmCallFailed, errLlmBadFormat,
} from "./errors";

export interface AiSummaryResult {
  coreDeliverables: string;
  keyQualifications: string;
  paymentCycle: string;
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
            n.estimated_value, n.description
     FROM crm_bid_notices n WHERE n.id = ? LIMIT 1`,
    [noticeId],
  );
  return (rows as RowDataPacket[])[0] ?? null;
}

/** 供应商画像（用户绑定的 supplier_id → supplier 表） */
async function fetchSupplierProfile(pool: Pool, userId: number) {
  const [userRows] = await pool.query(
    "SELECT supplier_id FROM crm_users WHERE id = ? LIMIT 1",
    [userId],
  );
  const supplierId = Number((userRows as RowDataPacket[])[0]?.supplier_id || 0);
  if (!supplierId) return null;
  const [supRows] = await pool.query(
    `SELECT company, industry, products, certification, country, city, type
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
  };
}

/** 机会表补充字段（eligibility/technical_hurdles/description_cn） */
async function enrichFromOpportunity(pool: Pool, noticeId: number, notice: RowDataPacket) {
  const [rows] = await pool.query(
    `SELECT o.eligibility, o.technical_hurdles, o.supplier_conditions,
            o.description_cn, o.agency_full
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
  };
}

/** 主入口：获取或生成 AI 摘要 */
export async function getOrGenerateAiSummary(
  pool: Pool,
  userId: number,
  noticeId: number,
  forceRegenerate = false,
): Promise<AiSummaryResult> {
  const summaryRepo = new AiSummaryRepo(pool);
  const configRepo = new LlmConfigRepo(pool);

  // 强制重新分析：先删旧缓存
  if (forceRegenerate) await summaryRepo.remove(userId, noticeId);

  // 缓存命中
  const cached = await summaryRepo.find(userId, noticeId);
  if (cached) {
    return {
      coreDeliverables: cached.core_deliverables || "",
      keyQualifications: cached.key_qualifications || "",
      paymentCycle: cached.payment_cycle || "",
      riskAlerts: cached.risk_alerts || "",
      model: cached.model,
      cached: true,
      inputTokens: cached.input_tokens,
      outputTokens: cached.output_tokens,
    };
  }

  // 用户 LLM 配置
  const config = await configRepo.findActiveByUser(userId);
  if (!config) errLlmNotConfigured();

  // 公告数据
  const noticeBase = await fetchNoticeForPrompt(pool, noticeId);
  if (!noticeBase) errNoticeNotFound();
  const notice = await enrichFromOpportunity(pool, noticeId, noticeBase!);

  // 供应商画像
  const supplier = await fetchSupplierProfile(pool, userId);

  // 组装 prompt + 解密 Key + 调用 LLM
  const userPrompt = buildUserPrompt(notice as any, supplier);
  let apiKey: string;
  try {
    apiKey = decryptApiKey(config!.api_key);
  } catch {
    errLlmNotConfigured();
  }

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

  // 落库
  await summaryRepo.upsert({
    userId, noticeId,
    coreDeliverables: result!.data.coreDeliverables,
    keyQualifications: result!.data.keyQualifications,
    paymentCycle: result!.data.paymentCycle,
    riskAlerts: result!.data.riskAlerts,
    model: result!.model,
    providerBaseUrl: config!.base_url,
    inputTokens: result!.inputTokens,
    outputTokens: result!.outputTokens,
  });

  return {
    coreDeliverables: result!.data.coreDeliverables,
    keyQualifications: result!.data.keyQualifications,
    paymentCycle: result!.data.paymentCycle,
    riskAlerts: result!.data.riskAlerts,
    model: result!.model,
    cached: false,
    inputTokens: result!.inputTokens,
    outputTokens: result!.outputTokens,
  };
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
