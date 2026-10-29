/**
 * 投标可行性报告 —— 编排服务（v0.1）
 *
 * @module lib/services/feasibility-report/service
 * @description 串起：企业主体解析 → 要求项（读取/抽取并落库）→ 能力快照 → 判定引擎
 *              → 报告缓存（输入 hash）/落库。LLM 与存储都通过依赖注入，便于单测。
 *              权限：bid_feasibility_report（企业/人工档）；生成走 BYOK 模型。
 */
import { createHash } from "node:crypto";
import type { LlmCredentials } from "../ai-score/llm-client";
import type { AppContext } from "@/lib/db/context";
import { routeError } from "@/lib/middleware/route-handler";
import { EC_ACCESS_FORBIDDEN, EC_INVALID_PARAMS, EC_NOTICE_NOT_FOUND_404, EC_VIP_ONLY } from "@/shared/constants/api";
import { BID_FEASIBILITY_REPORT_BENEFIT } from "../benefit-matrix";
import { FeasibilityReportRepo, type FeasibilityReportRow } from "@/lib/repos/feasibility-report.repo";
import {
  buildExtractionInput,
  deriveCapabilities,
  requirementItemFromRow,
  type CapabilityRowLike,
  type DiagnosisRowLike,
  type EvidenceRowLike,
  type OpportunityRowLike,
  type PublicNoticeRowLike,
  type SupplierRowLike,
} from "./inputs";
import { callLlmForExtraction, extractRequirements } from "./extraction";
import { evaluateFeasibilityReport } from "./engine";
import type { CapabilityItem, FeasibilityReport, RequirementItem } from "./types";

export const EXTRACTION_PROMPT_VERSION = "feas-req-v0.1";
export const REPORT_PROMPT_VERSION = "feas-rules-v0.1";

/** 仓储接口（测试用内存实现；生产用 FeasibilityReportRepo） */
export interface FeasibilityReportRepoLike {
  findVerifiedSupplierForUser(userId: number): Promise<SupplierRowLike | null>;
  findSupplierById(supplierId: number): Promise<SupplierRowLike | null>;
  findDiagnosis(userId: number, supplierId: number): Promise<DiagnosisRowLike | null>;
  getNotice(noticePk: number): Promise<PublicNoticeRowLike | null>;
  getOpportunityByNoticeId(noticeId: string | number): Promise<OpportunityRowLike | null>;
  listCapabilityRows(enterpriseId: number): Promise<CapabilityRowLike[]>;
  listEvidenceRows(enterpriseId: number): Promise<EvidenceRowLike[]>;
  getLatestRequirements(noticePk: number): Promise<{ version: number; rows: unknown[] }>;
  saveRequirements(noticePk: number, items: RequirementItem[], promptVersion: string): Promise<number>;
  getLatestReport(noticePk: number, enterpriseId: number): Promise<FeasibilityReportRow | null>;
  listReports(noticePk: number, enterpriseId: number, limit?: number): Promise<Array<{
    id: number;
    generated_at: string | null;
    decision: string | null;
    score: number | string | null;
    prompt_version: string;
  }>>;
  findReportByHash(noticePk: number, enterpriseId: number, inputHash: string): Promise<FeasibilityReportRow | null>;
  saveReport(params: {
    noticePk: number;
    enterpriseId: number;
    inputHash: string;
    report: unknown;
    promptVersion: string;
    model: string | null;
  }): Promise<void>;
}

export interface ReportHistoryItem {
  id: number;
  generatedAt: string | null;
  decision: string | null;
  score: number | null;
  promptVersion: string;
}

export interface FeasibilityDeps {
  repo: FeasibilityReportRepoLike;
  isEntitled: (userId: number, benefitCode: string) => Promise<boolean>;
  getLlmCredentials: (userId: number) => Promise<LlmCredentials>;
  /** 测试注入：替代真实 BYOK 调用（缺省走 callLlmForExtraction） */
  llmCall?: (systemPrompt: string, userPrompt: string) => Promise<string>;
}

/** 生产依赖装配（路由层调用） */
export function createFeasibilityDeps(ctx: AppContext): FeasibilityDeps {
  return {
    repo: new FeasibilityReportRepo(ctx.dbPool),
    isEntitled: (userId, benefitCode) => ctx.benefitSystemRepo.isEntitled(userId, benefitCode),
    getLlmCredentials: async (userId) => {
      const { resolveLlmCredentials } = await import("../ai/shared/llm-credentials");
      return resolveLlmCredentials(ctx.dbPool, userId);
    },
  };
}

function inputHashOf(params: {
  noticePk: number;
  enterpriseId: number;
  requirementVersion: number | string;
  requirements: RequirementItem[];
  capabilities: CapabilityItem[];
}): string {
  const stable = JSON.stringify({
    noticePk: params.noticePk,
    enterpriseId: params.enterpriseId,
    requirementVersion: params.requirementVersion,
    requirements: params.requirements.map((r) => ({
      id: r.id,
      type: r.type,
      importance: r.importance,
      title: r.title,
      value: r.value,
      rawText: r.rawText,
    })),
    capabilities: params.capabilities.map((c) => ({
      id: c.id,
      type: c.type,
      name: c.name,
      value: c.value,
      evidenceRefs: c.evidenceRefs?.map((e) => e.id),
    })),
  });
  return createHash("sha256").update(stable).digest("hex");
}

function parseReport(row: FeasibilityReportRow | null): FeasibilityReport | null {
  if (!row) return null;
  const raw = row.report_json;
  if (!raw || typeof raw !== "object") return null;
  return raw as FeasibilityReport;
}

/** 读取已有报告（GET；不触发生成）；stale=企业档案/要求项已变化、缓存版本建议重新生成 */
export async function getFeasibilityReportForNotice(
  deps: FeasibilityDeps,
  params: { userId: number; noticePk: number },
): Promise<{ report: FeasibilityReport | null; enterprise: { id: number; name: string } | null; stale: boolean }> {
  if (!(await deps.isEntitled(params.userId, BID_FEASIBILITY_REPORT_BENEFIT))) {
    routeError(403, EC_VIP_ONLY, "投标可行性报告为企业版权益", { feature: BID_FEASIBILITY_REPORT_BENEFIT });
  }
  const supplier = await deps.repo.findVerifiedSupplierForUser(params.userId);
  if (!supplier) return { report: null, enterprise: null, stale: false };
  const enterpriseId = Number(supplier.id);
  const row = await deps.repo.getLatestReport(params.noticePk, enterpriseId);
  const report = parseReport(row);
  if (!report || !row) {
    return { report: null, enterprise: { id: enterpriseId, name: String(supplier.company ?? "") }, stale: false };
  }

  // 判断缓存是否过期：用当前企业档案 + 最新要求项重算 hash
  let stale = false;
  const latest = await deps.repo.getLatestRequirements(params.noticePk);
  if (latest.rows.length > 0) {
    const requirements = latest.rows.map((item) => requirementItemFromRow(item as never));
    const [diagnosis, capabilityRows, evidenceRows] = await Promise.all([
      deps.repo.findDiagnosis(params.userId, enterpriseId),
      deps.repo.listCapabilityRows(enterpriseId),
      deps.repo.listEvidenceRows(enterpriseId),
    ]);
    const capabilities = deriveCapabilities({ enterpriseId, supplier, diagnosis, capabilityRows, evidenceRows });
    const currentHash = inputHashOf({
      noticePk: params.noticePk,
      enterpriseId,
      requirementVersion: latest.version,
      requirements,
      capabilities,
    });
    stale = currentHash !== row.input_hash;
  }
  return { report, enterprise: { id: enterpriseId, name: String(supplier.company ?? "") }, stale };
}

/** 报告历史版本（对比不同输入快照/模型版本） */
export async function getReportHistory(
  deps: FeasibilityDeps,
  params: { userId: number; noticePk: number; limit?: number },
): Promise<ReportHistoryItem[]> {
  if (!(await deps.isEntitled(params.userId, BID_FEASIBILITY_REPORT_BENEFIT))) {
    routeError(403, EC_VIP_ONLY, "投标可行性报告为企业版权益", { feature: BID_FEASIBILITY_REPORT_BENEFIT });
  }
  const supplier = await deps.repo.findVerifiedSupplierForUser(params.userId);
  if (!supplier) return [];
  const rows = await deps.repo.listReports(params.noticePk, Number(supplier.id), params.limit ?? 20);
  return rows.map((row) => ({
    id: Number(row.id),
    generatedAt: row.generated_at,
    decision: row.decision,
    score: row.score == null ? null : Number(row.score),
    promptVersion: String(row.prompt_version ?? ""),
  }));
}

/** 生成报告（POST）：无缓存则抽取要求项 + 判定 + 落库 */
export async function generateFeasibilityReport(
  deps: FeasibilityDeps,
  params: { userId: number; noticePk: number; regenerate?: boolean },
): Promise<{ report: FeasibilityReport; cached: boolean; enterprise: { id: number; name: string } }> {
  if (!(await deps.isEntitled(params.userId, BID_FEASIBILITY_REPORT_BENEFIT))) {
    routeError(403, EC_VIP_ONLY, "投标可行性报告为企业版权益", { feature: BID_FEASIBILITY_REPORT_BENEFIT });
  }

  const supplier = await deps.repo.findVerifiedSupplierForUser(params.userId);
  if (!supplier) {
    routeError(403, EC_ACCESS_FORBIDDEN, "请先完成企业认证，再生成投标可行性报告");
  }
  const enterpriseId = Number(supplier.id);
  const enterprise = { id: enterpriseId, name: String(supplier.company ?? "") };

  const notice = await deps.repo.getNotice(params.noticePk);
  if (!notice) routeError(404, EC_NOTICE_NOT_FOUND_404, "公告不存在");

  const opportunity = await deps.repo.getOpportunityByNoticeId(
    (notice as PublicNoticeRowLike & { notice_id?: string | number }).notice_id ?? "",
  );

  // 1) 要求项：有历史版本且未要求重抽 → 复用；否则 BYOK 抽取并落新版本
  const latest = await deps.repo.getLatestRequirements(params.noticePk);
  let version = latest.version;
  const rows = latest.rows;
  let requirements: RequirementItem[];
  if (rows.length > 0 && !params.regenerate) {
    requirements = rows.map((row) => requirementItemFromRow(row as never));
  } else {
    const creds = await deps.getLlmCredentials(params.userId);
    const extraction = await extractRequirements(buildExtractionInput(notice, opportunity), {
      llm: deps.llmCall ?? callLlmForExtraction(creds),
      model: creds.model,
      promptVersion: EXTRACTION_PROMPT_VERSION,
    });
    if (extraction.items.length === 0) {
      routeError(
        400,
        EC_INVALID_PARAMS,
        `未能从公告中提取到可判定的要求项${extraction.issues.length > 0 ? `（${extraction.issues.slice(0, 3).join("；")}）` : ""}，请稍后重试或联系客服`,
      );
    }
    version = await deps.repo.saveRequirements(params.noticePk, extraction.items, EXTRACTION_PROMPT_VERSION);
    requirements = extraction.items;
  }

  // 2) 企业能力快照（自动带出 + 手工确认行）
  const [diagnosis, capabilityRows, evidenceRows] = await Promise.all([
    deps.repo.findDiagnosis(params.userId, enterpriseId),
    deps.repo.listCapabilityRows(enterpriseId),
    deps.repo.listEvidenceRows(enterpriseId),
  ]);
  const capabilities = deriveCapabilities({
    enterpriseId,
    supplier,
    diagnosis,
    capabilityRows,
    evidenceRows,
  });
  if (capabilities.length === 0) {
    routeError(400, EC_INVALID_PARAMS, "企业档案缺少可判定的能力项（证书/业绩/注册等），请先完善企业资料");
  }

  // 3) 输入快照与缓存
  const inputHash = inputHashOf({
    noticePk: params.noticePk,
    enterpriseId,
    requirementVersion: version,
    requirements,
    capabilities,
  });
  const cachedRow = params.regenerate ? null : await deps.repo.findReportByHash(params.noticePk, enterpriseId, inputHash);
  const cached = parseReport(cachedRow);
  if (cached) return { report: cached, cached: true, enterprise };

  // 4) 判定并落库
  const now = new Date().toISOString();
  const deadlineIso = notice.deadline_ts != null && Number.isFinite(Number(notice.deadline_ts))
    ? new Date(Number(notice.deadline_ts) * 1000).toISOString()
    : new Date(Date.now() + 90 * 86_400_000).toISOString();
  const report = evaluateFeasibilityReport({
    noticePk: params.noticePk,
    enterpriseId,
    requirements,
    capabilities,
    context: { bidDeadline: deadlineIso, today: now, promptVersion: REPORT_PROMPT_VERSION },
  });
  await deps.repo.saveReport({
    noticePk: params.noticePk,
    enterpriseId,
    inputHash,
    report,
    promptVersion: REPORT_PROMPT_VERSION,
    model: null,
  });
  return { report, cached: false, enterprise };
}
