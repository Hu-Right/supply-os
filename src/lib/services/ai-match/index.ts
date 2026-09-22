/**
 * AI 供应商适配统一评估服务
 * @module lib/services/ai-match
 * @description 统一评估面板后端：候选集 = {我绑定的自己} ∪ {资源库工厂/友商}（按 supplier_id 去重），
 *              复用 ai-score 的同一套 7 维评分引擎逐一打分，按综合分排序（self 不截断）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { AiSummaryRepo } from "../../repos/ai-summary.repo";
import { UserSupplierPoolRepo } from "../../repos/user-supplier-pool.repo";
import { callLlmForScore } from "../ai-score/llm-client";
import { SCORE_SYSTEM_PROMPT, buildScoreUserPrompt, type AiScoreRaw } from "../ai-score/prompt";
import { fetchSupplierForScore } from "../ai-score";
import { errNoticeNotFound } from "../ai-summary/errors";
import { fetchNoticeContext } from "../ai/shared/notice-context";
import { resolveLlmCredentials } from "../ai/shared/llm-credentials";
import { preFilterSuppliers } from "./pre-filter";
import { loadUnspscMatchData } from "./unspsc-levels";

export interface MatchedSupplier extends AiScoreRaw {
  /** 资源库行 id；self 行为 null */
  pool_id: number | null;
  supplier_id: number;
  company: string;
  /** 是否为用户自己绑定的企业（高亮标识） */
  isSelf: boolean;
  /** 候选来源 */
  source: "self" | "pool";
  /** 基本信息（supplier 主表）是否完整 */
  baseComplete: boolean;
  /** 诊断表（qualification）是否已填 */
  diagComplete: boolean;
}

/** 画像完整度启发式判定（驱动前端补全提示） */
function completeness(p: Record<string, unknown>): { baseComplete: boolean; diagComplete: boolean } {
  const base =
    !!String(p.company || "").trim() && !!String(p.industry || "").trim() && !!String(p.products || "").trim();
  const diagKeys = ["employee_count", "export_scale", "service_countries", "overseas_companies", "ungm_status", "english_team", "payment_terms"];
  const diag = diagKeys.some((k) => !!String(p[k] || "").trim());
  return { baseComplete: base, diagComplete: diag };
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

const PRE_FILTER_LIMIT = 5;
/** LLM 并发调用上限：5 个候选按 3 并发分两批，替代串行等待 */
const LLM_CONCURRENCY = 3;

/** 主入口：统一评估（self + 资源库候选） */
export async function getOrGenerateAiMatch(
  pool: Pool,
  userId: number,
  noticeId: number,
  forceRegenerate = false,
): Promise<AiMatchResult> {
  const summaryRepo = new AiSummaryRepo(pool);
  const poolRepo = new UserSupplierPoolRepo(pool);

  // 检查缓存（match_results 独立列，与评分 score_reasons 分键，互不覆盖）
  // 版本位：仅当每项都带 isSelf 字段才视为新版结构命中，旧版（无 isSelf）自动重生成。
  if (!forceRegenerate) {
    const cached = await summaryRepo.findMatch(userId, noticeId);
    if (cached?.match_results) {
      try {
        const parsed = JSON.parse(cached.match_results);
        if (Array.isArray(parsed) && parsed.every((i) => i && typeof i.isSelf === "boolean")) {
          return {
            top: parsed, cached: true,
            poolSize: parsed.length, evaluated: parsed.length, failed: 0,
            diagPending: await poolRepo.countDiagnosisPending(userId),
          };
        }
      } catch { /* 数据损坏/旧版格式，继续重新生成 */ }
    }
  }

  // 公告上下文
  const notice = await fetchNoticeContext(pool, noticeId);
  if (!notice) errNoticeNotFound();
  // LLM 配置
  const creds = await resolveLlmCredentials(pool, userId);

  // self：绑定的企业主体（owner 画像：基本信息 + owner 诊断）
  const [uRows] = await pool.query("SELECT supplier_id FROM crm_users WHERE id = ? LIMIT 1", [userId]);
  const selfSupplierId = Number((uRows as RowDataPacket[])[0]?.supplier_id || 0);
  const selfProfile = selfSupplierId ? await fetchSupplierForScore(pool, userId) : null;

  // pool：资源库工厂/友商（目录基本信息 + 我关联的诊断），排除与 self 同一家避免重复
  const poolProfilesRaw = await poolRepo.fetchSupplierProfiles(userId);
  const poolProfiles = poolProfilesRaw.filter((s) => Number(s.supplier_id) !== selfSupplierId);

  // 超精评上限先粗筛（self 不参与粗筛、始终保留）：UNSPSC 层级匹配优先、
  // 词项重叠兜底；粗筛数据加载失败时 loader 内建退化，不阻断匹配主流程
  let poolForEval = poolProfiles;
  if (poolProfiles.length > PRE_FILTER_LIMIT) {
    const ids = poolProfiles.map((s) => Number(s.supplier_id) || 0);
    const unspsc = await loadUnspscMatchData(pool, noticeId, ids);
    poolForEval = preFilterSuppliers(notice as never, poolProfiles, PRE_FILTER_LIMIT, unspsc).candidates;
  }

  type Cand = { profile: Record<string, unknown>; supplierId: number; poolId: number | null; isSelf: boolean };
  const cands: Cand[] = [];
  if (selfProfile && selfSupplierId) {
    cands.push({ profile: selfProfile as unknown as Record<string, unknown>, supplierId: selfSupplierId, poolId: null, isSelf: true });
  }
  for (const s of poolForEval) {
    cands.push({ profile: s, supplierId: Number(s.supplier_id), poolId: Number(s.pool_id), isSelf: false });
  }

  if (cands.length === 0) {
    return { top: [], cached: false, poolSize: 0, evaluated: 0, failed: 0, diagPending: 0 };
  }

  // 并发批量评分：单家失败不阻塞其余，失败计数返回
  const scored: MatchedSupplier[] = [];
  let failed = 0;
  for (let i = 0; i < cands.length; i += LLM_CONCURRENCY) {
    const batch = cands.slice(i, i + LLM_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(async (c) => ({
        c,
        result: await callLlmForScore(
          creds,
          SCORE_SYSTEM_PROMPT,
          buildScoreUserPrompt(notice as unknown as Record<string, unknown>, c.profile, c.isSelf ? "self" : "candidate"),
        ),
      })),
    );
    for (const item of settled) {
      if (item.status === "fulfilled") {
        const { c, result } = item.value;
        const comp = completeness(c.profile);
        scored.push({
          ...result.data,
          pool_id: c.poolId,
          supplier_id: c.supplierId,
          company: String(c.profile.company || ""),
          isSelf: c.isSelf,
          source: c.isSelf ? "self" : "pool",
          baseComplete: comp.baseComplete,
          diagComplete: comp.diagComplete,
        });
      } else {
        failed += 1;
        console.error("[ai-match] 供应商评分失败:", item.reason instanceof Error ? item.reason.message : item.reason);
      }
    }
  }

  // 排序：综合分降序；同分 self 优先，再按 supplier_id 升序（保证可复现）
  scored.sort(
    (a, b) =>
      b.overall - a.overall ||
      Number(b.isSelf) - Number(a.isSelf) ||
      a.supplier_id - b.supplier_id,
  );
  // self 不截断：展示全部已评估候选（≤ 5 池 + 1 self）
  const top = scored;

  // 写入缓存（match_results 独立列，携带 isSelf/source/完整度标记）
  if (top.length > 0) {
    await summaryRepo.upsertMatch({
      userId, noticeId,
      matchResults: JSON.stringify(top.map((s) => ({
        pool_id: s.pool_id, supplier_id: s.supplier_id, company: s.company,
        overall: s.overall, details: s.details, reasoning: s.reasoning,
        isSelf: s.isSelf, source: s.source, baseComplete: s.baseComplete, diagComplete: s.diagComplete,
      }))),
      model: creds.model,
      providerBaseUrl: creds.baseUrl,
    });
  }

  return {
    top, cached: false,
    poolSize: poolProfiles.length + (selfProfile ? 1 : 0),
    evaluated: scored.length + failed,
    failed,
    diagPending: await poolRepo.countDiagnosisPending(userId),
  };
}
