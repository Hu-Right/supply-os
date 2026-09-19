/**
 * AI 智能匹配服务
 * @module lib/services/ai-match
 * @description 从用户供应商资源库中推荐 Top N 最匹配公告的供应商。
 *              复用 ai-score 的 prompt 模板和 LLM 调用链。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { LlmConfigRepo } from "../../repos/llm-config.repo";
import { AiSummaryRepo } from "../../repos/ai-summary.repo";
import { UserSupplierPoolRepo } from "../../repos/user-supplier-pool.repo";
import { decryptApiKey } from "../ai-summary/crypto";
import { callLlmForScore } from "../ai-score/llm-client";
import { SCORE_SYSTEM_PROMPT, buildScoreUserPrompt, type AiScoreRaw } from "../ai-score/prompt";
import { errLlmNotConfigured, errNoticeNotFound } from "../ai-summary/errors";
import { preFilterSuppliers } from "./pre-filter";

export interface MatchedSupplier extends AiScoreRaw {
  pool_id: number;
  supplier_id: number;
  company: string;
}

export interface AiMatchResult {
  top: MatchedSupplier[];
  cached: boolean;
  /** 资源库供应商总数（缓存命中时为 Top N 数量，前端仅在 !cached 时做筛选披露） */
  poolSize: number;
  /** 本次实际送入 LLM 评估的数量 */
  evaluated: number;
  /** 评估失败的数量（>0 且 top 为空 = 全部失败，前端按错误态呈现） */
  failed: number;
}

const TOP_N = 3;
const PRE_FILTER_LIMIT = 5;
/** LLM 并发调用上限：5 个候选按 3 并发分两批，替代串行等待 */
const LLM_CONCURRENCY = 3;

/** 获取公告基础信息（description 供粗筛做词项匹配，不进 LLM prompt） */
async function fetchNotice(pool: Pool, noticeId: number) {
  const [rows] = await pool.query(
    `SELECT n.id, n.title, n.notice_type, n.country, n.deadline, n.estimated_value,
            LEFT(n.description, 2000) AS description
     FROM crm_bid_notices n WHERE n.id = ? LIMIT 1`,
    [noticeId],
  );
  const base = (rows as RowDataPacket[])[0];
  if (!base) return null;
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

/** 主入口：AI 智能匹配 */
export async function getOrGenerateAiMatch(
  pool: Pool,
  userId: number,
  noticeId: number,
  forceRegenerate = false,
): Promise<AiMatchResult> {
  const summaryRepo = new AiSummaryRepo(pool);
  const configRepo = new LlmConfigRepo(pool);
  const poolRepo = new UserSupplierPoolRepo(pool);

  // 检查缓存（match_results 独立列，与评分 score_reasons 分键，互不覆盖）
  if (!forceRegenerate) {
    const cached = await summaryRepo.findMatch(userId, noticeId);
    if (cached?.match_results) {
      try {
        const parsed = JSON.parse(cached.match_results);
        if (Array.isArray(parsed)) {
          return { top: parsed, cached: true, poolSize: parsed.length, evaluated: parsed.length, failed: 0 };
        }
      } catch { /* 数据损坏，继续重新生成 */ }
    }
  }

  // 获取资源库供应商画像
  const suppliers = await poolRepo.fetchSupplierProfiles(userId);
  if (suppliers.length === 0) {
    return { top: [], cached: false, poolSize: 0, evaluated: 0, failed: 0 };
  }

  // 获取公告
  const notice = await fetchNotice(pool, noticeId);
  if (!notice) errNoticeNotFound();

  // 获取 LLM 配置
  const config = await configRepo.findActiveByUser(userId);
  if (!config) errLlmNotConfigured();

  let apiKey: string;
  try { apiKey = decryptApiKey(config.api_key); } catch { errLlmNotConfigured(); }

  // 资源库超过精评上限时，按行业/产品词项与公告文本的重叠度粗筛，
  // 只对得分最高的候选做 LLM 精评（零重叠时保持资源库原有顺序）
  let candidates = suppliers;
  if (suppliers.length > PRE_FILTER_LIMIT) {
    candidates = preFilterSuppliers(notice as any, suppliers, PRE_FILTER_LIMIT).candidates;
  }

  // 并发批量评分：单家失败不阻塞其余，失败计数返回（全部失败时前端按错误态呈现）
  const scored: MatchedSupplier[] = [];
  let failed = 0;
  for (let i = 0; i < candidates.length; i += LLM_CONCURRENCY) {
    const batch = candidates.slice(i, i + LLM_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(async (supplier) => ({
        supplier,
        result: await callLlmForScore(
          { baseUrl: config.base_url, apiKey, model: config.model },
          SCORE_SYSTEM_PROMPT,
          buildScoreUserPrompt(notice as any, supplier),
        ),
      })),
    );
    for (const item of settled) {
      if (item.status === "fulfilled") {
        const { supplier, result } = item.value;
        scored.push({
          ...result.data,
          pool_id: Number(supplier.pool_id),
          supplier_id: Number(supplier.supplier_id),
          company: String(supplier.company || ""),
        });
      } else {
        failed += 1;
        console.error("[ai-match] 供应商评分失败:", item.reason instanceof Error ? item.reason.message : item.reason);
      }
    }
  }

  // 排序取 Top N（同分按 pool_id 升序，保证结果可复现）
  scored.sort((a, b) => b.overall - a.overall || a.pool_id - b.pool_id);
  const top = scored.slice(0, TOP_N);

  // 写入缓存（match_results 独立列，仅存 Top N 排行 JSON，不再污染评分 score_* 列）
  if (top.length > 0) {
    await summaryRepo.upsertMatch({
      userId, noticeId,
      matchResults: JSON.stringify(top.map((s) => ({
        pool_id: s.pool_id, supplier_id: s.supplier_id, company: s.company,
        overall: s.overall, details: s.details,
      }))),
      model: config.model,
      providerBaseUrl: config.base_url,
    });
  }

  return {
    top, cached: false,
    poolSize: suppliers.length,
    evaluated: scored.length + failed,
    failed,
  };
}
