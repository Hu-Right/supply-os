/**
 * AI 智能匹配服务
 * @module lib/services/ai-match
 * @description 从用户供应商资源库中推荐 Top N 最匹配公告的供应商。
 *              复用 ai-score 的 prompt 模板和 LLM 调用链。
 */
import type { Pool } from "mysql2/promise";
import { AiSummaryRepo } from "../../repos/ai-summary.repo";
import { UserSupplierPoolRepo } from "../../repos/user-supplier-pool.repo";
import { callLlmForScore } from "../ai-score/llm-client";
import { SCORE_SYSTEM_PROMPT, buildScoreUserPrompt, type AiScoreRaw } from "../ai-score/prompt";
import { errNoticeNotFound } from "../ai-summary/errors";
import { fetchNoticeContext } from "../ai/shared/notice-context";
import { resolveLlmCredentials } from "../ai/shared/llm-credentials";
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
  /** 资源库中缺诊断资料的工厂数（实时统计，用于"补全提升准确度"提示） */
  diagPending: number;
}

const TOP_N = 3;
const PRE_FILTER_LIMIT = 5;
/** LLM 并发调用上限：5 个候选按 3 并发分两批，替代串行等待 */
const LLM_CONCURRENCY = 3;

/** 主入口：AI 智能匹配 */
export async function getOrGenerateAiMatch(
  pool: Pool,
  userId: number,
  noticeId: number,
  forceRegenerate = false,
): Promise<AiMatchResult> {
  const summaryRepo = new AiSummaryRepo(pool);
  const poolRepo = new UserSupplierPoolRepo(pool);

  // 检查缓存（match_results 独立列，与评分 score_reasons 分键，互不覆盖）
  if (!forceRegenerate) {
    const cached = await summaryRepo.findMatch(userId, noticeId);
    if (cached?.match_results) {
      try {
        const parsed = JSON.parse(cached.match_results);
        if (Array.isArray(parsed)) {
          return {
            top: parsed, cached: true,
            poolSize: parsed.length, evaluated: parsed.length, failed: 0,
            diagPending: await poolRepo.countDiagnosisPending(userId),
          };
        }
      } catch { /* 数据损坏，继续重新生成 */ }
    }
  }

  // 获取资源库供应商画像
  const suppliers = await poolRepo.fetchSupplierProfiles(userId);
  if (suppliers.length === 0) {
    return { top: [], cached: false, poolSize: 0, evaluated: 0, failed: 0, diagPending: 0 };
  }

  // 获取公告
  const notice = await fetchNoticeContext(pool, noticeId);
  if (!notice) errNoticeNotFound();

  // 获取 LLM 配置并解密 API Key（共享层）
  const creds = await resolveLlmCredentials(pool, userId);

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
          creds,
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

  // 写入缓存（match_results 独立列，仅存 Top N 排行 JSON，不再污染评分 score_* 列；
  // 附带每家工厂的整体推理过程，供前端展开展示）
  if (top.length > 0) {
    await summaryRepo.upsertMatch({
      userId, noticeId,
      matchResults: JSON.stringify(top.map((s) => ({
        pool_id: s.pool_id, supplier_id: s.supplier_id, company: s.company,
        overall: s.overall, details: s.details, reasoning: s.reasoning,
      }))),
      model: creds.model,
      providerBaseUrl: creds.baseUrl,
    });
  }

  return {
    top, cached: false,
    poolSize: suppliers.length,
    evaluated: scored.length + failed,
    failed,
    diagPending: await poolRepo.countDiagnosisPending(userId),
  };
}
