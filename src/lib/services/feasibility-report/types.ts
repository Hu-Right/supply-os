/**
 * 投标可行性报告 —— 领域类型（v0.1）
 *
 * @module lib/services/feasibility-report/types
 * @description 与 docs/P0-投标可行性报告/01-数据契约 对齐：要求项 / 能力项 / 证据锚点 / 报告。
 *              纯类型 + 常量，无 IO，便于规则引擎单测。
 */

// ── 枚举 ──────────────────────────────────────────────────────────────

export const REQUIREMENT_TYPES = [
  "certification",
  "experience",
  "financial",
  "personnel",
  "localization",
  "registration",
  "technical",
  "commercial",
  "delivery",
  "submission",
  "bond",
  "language",
  "warranty",
  "other",
] as const;
export type RequirementType = (typeof REQUIREMENT_TYPES)[number];

export const IMPORTANCE_LEVELS = ["mandatory", "scored", "preferred"] as const;
export type Importance = (typeof IMPORTANCE_LEVELS)[number];

export const RULE_STATUSES = [
  "satisfied",
  "partial",
  "missing",
  "expired",
  "unknown",
  "not_applicable",
] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];

export const CAPABILITY_TYPES = [
  "certification",
  "experience",
  "financial",
  "personnel",
  "localization",
  "registration",
  "technical",
  "text",
] as const;
export type CapabilityType = (typeof CAPABILITY_TYPES)[number];

// ── 证据 ──────────────────────────────────────────────────────────────

export type EvidenceKind =
  | "upload_file"
  | "supplier_field"
  | "notice_quote"
  | "opportunity_field"
  | "manual_note";

export interface EvidenceRef {
  id: string;
  kind: EvidenceKind;
  /** 表:主键 / 字段名 / 公告锚点 */
  ref: string;
  locator?: { page?: number | null; section?: string | null; clause?: string | null } | null;
  quote?: string | null;
  hash?: string | null;
  capturedAt?: string | null;
  /** 前端展示名（文件名/证书名），由编排层填充 */
  displayName?: string | null;
}

export interface SourceAnchor {
  kind: "notice_text" | "attachment" | "opportunity_field" | "external_link";
  ref?: string | null;
  locator?: { page?: number | null; section?: string | null; clause?: string | null; charRange?: [number, number] | null } | null;
  /** 原文片段：要求项必须能回指原文 */
  quote: string;
  capturedAt?: string | null;
}

// ── 要求项 ────────────────────────────────────────────────────────────

export interface RequirementValue {
  /** 结构化值（按 requirement_type 不同字段；无法结构化时只留 rawText） */
  kind?: string;
  [key: string]: unknown;
}

export interface RequirementItem {
  /** req-<seq>：同公告内稳定，重抽复用 seq */
  id: string;
  noticePk: number;
  seq: number;
  type: RequirementType;
  importance: Importance;
  title: string;
  /** 结构化要求；无法结构化时可为空 */
  value?: RequirementValue | null;
  /** 公告原文片段（≤500 字） */
  rawText: string;
  source: SourceAnchor;
  extraction?: {
    method: "rule" | "llm" | "manual";
    model?: string | null;
    promptVersion?: string | null;
    confidence?: number | null;
  };
}

// ── 能力项 ────────────────────────────────────────────────────────────

export interface CapabilityValue {
  kind: CapabilityType;
  [key: string]: unknown;
}

export interface CapabilityItem {
  id: string;
  enterpriseId: number;
  type: CapabilityType;
  name: string;
  value: CapabilityValue;
  evidenceRefs?: EvidenceRef[];
  confirmation?: {
    source: "manual" | "supplier_sync" | "diagnosis";
    confirmedBy?: number | null;
    confirmedAt?: string | null;
  };
}

// ── 判定结果 ──────────────────────────────────────────────────────────

export interface RuleResult {
  ruleId: string;
  status: RuleStatus;
  /** 证据引用（requirement id / capability evidence id），必填规则要求至少 1 条 */
  refs: string[];
  detail?: Record<string, unknown>;
  confidence?: number;
}

// ── 报告 ──────────────────────────────────────────────────────────────

export interface GapItem {
  requirementId: string;
  status: Extract<RuleStatus, "missing" | "expired" | "partial">;
  title: string;
  suggest: string;
  refs: string[];
  ruleId: string;
}

export interface MatrixRow {
  requirementId: string;
  title: string;
  requirement: string;
  capability: string;
  status: RuleStatus;
  refs: string[];
  judgedBy: "rule" | "ai";
}

export interface UnknownItem {
  requirementId: string;
  title: string;
  reason: string;
  need: string;
  ruleId: string;
}

export interface AiAdvice {
  text: string;
  refs: string[];
  confidence: "high" | "medium" | "low";
}

export type Decision = "go" | "no_go" | "conditional";

export interface FeasibilityReport {
  meta: {
    noticePk: number;
    enterpriseId: number;
    promptVersion: string;
    model?: string | null;
    generatedAt: string;
    dataCompleteness: {
      requirementItems: number;
      capabilities: number;
      unknowns: number;
    };
    review: { status: "ai_draft" | "reviewed"; reviewedBy?: number | null; reviewedAt?: string | null };
  };
  verdict: {
    decision: Decision;
    score: number;
    reasons: Array<{ text: string; refs: string[]; confidence: "high" | "medium" | "low"; kind: "rule" }>;
  };
  gaps: GapItem[];
  matrix: MatrixRow[];
  unknowns: UnknownItem[];
  deterministic: {
    rulesRun: number;
    rulesPassed: number;
    rulesFailed: number;
    rulesUnknown: number;
    rulesNotApplicable: number;
  };
  aiAdvice: AiAdvice[];
  disclaimer: string;
}

// ── 判定上下文 ────────────────────────────────────────────────────────

export interface EvaluateContext {
  /** 投标截止时间（ISO） */
  bidDeadline: string;
  /** 当前日期（ISO；缺省用系统时间，测试可注入） */
  today?: string;
  /** 投标准备最小天数（低于则风险标记，默认 7） */
  minPrepDays?: number;
  /** 评分阈值（低于则 conditional，默认 0.55） */
  scoreThreshold?: number;
  promptVersion?: string;
}
