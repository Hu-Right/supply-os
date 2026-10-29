/**
 * 投标可行性报告 —— 输入装配（DB 行 → 领域对象）
 *
 * @module lib/services/feasibility-report/inputs
 * @description 两个方向：
 *              1) 公告行（notice_public + bid_opportunities）→ 抽取输入；
 *              2) 企业档案（supplier + supplier_diagnosis + enterprise_capability_items）
 *                 → 能力项（CapabilityItem[]），供规则引擎判定。
 *              只做结构映射与保守推断（不猜测没有依据的信息），所有派生证据都带 source 引用。
 */
import type {
  CapabilityItem,
  CapabilityValue,
  RequirementItem,
  RequirementType,
  Importance,
} from "./types";
import { REQUIREMENT_TYPES, IMPORTANCE_LEVELS } from "./types";
import { normalizeCertCode } from "./knowledge";
import type { NoticeExtractionInput } from "./extraction";

// ── DB 行最小形状（snake_case） ────────────────────────────────────────

export interface PublicNoticeRowLike {
  notice_pk: number | string;
  title?: string | null;
  description?: string | null;
  description_cn?: string | null;
  country_code?: string | null;
  notice_type_code?: string | null;
  buyer_name?: string | null;
  deadline_ts?: number | string | null;
  deadline?: string | null;
  attachments?: unknown;
}

export interface OpportunityRowLike {
  eligibility?: string | null;
  technical_hurdles?: string | null;
  supplier_conditions?: string | null;
  bid_overview?: string | null;
}

export interface SupplierRowLike {
  id: number | string;
  company?: string | null;
  country?: string | null;
  industry_code?: string | null;
  certification?: string | null;
  certification_tags?: unknown;
  registered_capital?: string | number | null;
  business_type?: string | null;
  verify_status?: string | null;
}

export interface DiagnosisRowLike {
  user_id?: number | string | null;
  supplier_id?: number | string | null;
  company_name?: string | null;
  ungm_status?: string | null;
  tender_experience?: string | null;
  mandatory_docs?: string | null;
  english_evidence_level?: string | null;
  team_discipline?: string | null;
}

export interface CapabilityRowLike {
  id: number | string;
  enterprise_id: number | string;
  capability_type: string;
  name: string;
  value_json: unknown;
  evidence_refs_json?: unknown;
  confirmation_json?: unknown;
}

export interface EvidenceRowLike {
  id: number | string;
  enterprise_id: number | string;
  upload_file_id?: number | string | null;
  category: string;
  title: string;
  valid_from?: string | null;
  valid_until?: string | null;
  no_expiry?: number | boolean | null;
  confirmed?: number | boolean | null;
}

// ── 公告 → 抽取输入 ──────────────────────────────────────────────────

/** 从 notice_public 行取附件名（服务端已归一为 [{name,url}] 或字符串数组） */
export function attachmentNamesOf(raw: unknown): Array<{ name: string; url?: string | null }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ name: string; url?: string | null }> = [];
  for (const item of raw) {
    if (typeof item === "string") {
      out.push({ name: item });
    } else if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      const name = String(record.name ?? record.title ?? record.label ?? record.url ?? "").trim();
      if (name) out.push({ name, url: record.url == null ? null : String(record.url) });
    }
  }
  return out;
}

function deadlineIsoOf(notice: PublicNoticeRowLike): string | null {
  if (notice.deadline_ts != null && Number.isFinite(Number(notice.deadline_ts))) {
    return new Date(Number(notice.deadline_ts) * 1000).toISOString();
  }
  if (notice.deadline) {
    const ts = Date.parse(String(notice.deadline));
    if (Number.isFinite(ts)) return new Date(ts).toISOString();
  }
  return null;
}

/** 公告行 → 抽取输入（正文 + 已有拆解字段 + 附件清单） */
export function buildExtractionInput(
  notice: PublicNoticeRowLike,
  opportunity?: OpportunityRowLike | null,
): NoticeExtractionInput {
  return {
    noticePk: Number(notice.notice_pk),
    title: String(notice.title ?? "").trim(),
    description: String(notice.description ?? "").trim(),
    descriptionCn: notice.description_cn ?? null,
    countryCode: notice.country_code ?? null,
    noticeType: notice.notice_type_code ?? null,
    agency: notice.buyer_name ?? null,
    deadlineIso: deadlineIsoOf(notice),
    attachments: attachmentNamesOf(notice.attachments),
    opportunity: opportunity
      ? {
          eligibility: opportunity.eligibility ?? null,
          technicalHurdles: opportunity.technical_hurdles ?? null,
          supplierConditions: opportunity.supplier_conditions ?? null,
          bidOverview: opportunity.bid_overview ?? null,
        }
      : null,
  };
}

// ── 要求项行 → 领域对象（报告读取历史抽取结果时用） ─────────────────

export interface RequirementRowLike {
  id: number | string;
  notice_pk: number | string;
  version: number | string;
  seq: number | string;
  requirement_type: string;
  importance: string;
  title: string;
  value_json: unknown;
  raw_text: string;
  source_json: unknown;
  extraction_method?: string | null;
  confidence?: number | string | null;
  prompt_version?: string | null;
}

const asType = (raw: string): RequirementType =>
  (REQUIREMENT_TYPES as readonly string[]).includes(raw) ? (raw as RequirementType) : "other";
const asImportance = (raw: string): Importance =>
  (IMPORTANCE_LEVELS as readonly string[]).includes(raw) ? (raw as Importance) : "scored";

export function requirementItemFromRow(row: RequirementRowLike): RequirementItem {
  const source = (row.source_json ?? {}) as Record<string, unknown>;
  const locator = (source.locator ?? null) as RequirementItem["source"]["locator"];
  const kind = String(source.kind ?? "notice_text");
  const sourceKind: RequirementItem["source"]["kind"] =
    kind === "attachment" || kind === "opportunity_field" || kind === "external_link" ? kind : "notice_text";
  return {
    id: `req-${Number(row.seq)}`,
    noticePk: Number(row.notice_pk),
    seq: Number(row.seq),
    type: asType(String(row.requirement_type)),
    importance: asImportance(String(row.importance)),
    title: String(row.title),
    value: row.value_json && typeof row.value_json === "object"
      ? (row.value_json as RequirementItem["value"])
      : null,
    rawText: String(row.raw_text ?? ""),
    source: {
      kind: sourceKind,
      ref: source.ref == null ? null : String(source.ref),
      locator,
      quote: String(source.quote ?? ""),
      capturedAt: source.capturedAt == null ? null : String(source.capturedAt),
    },
    extraction: {
      method: String(row.extraction_method ?? "llm") as "rule" | "llm" | "manual",
      model: null,
      promptVersion: row.prompt_version ?? null,
      confidence: row.confidence == null ? null : Number(row.confidence),
    },
  };
}

// ── 企业档案 → 能力项 ────────────────────────────────────────────────

/** 证书 token 识别（保守：只识别明确的体系/认证名，不做语义猜测） */
const CERT_TOKEN = /^(ISO\s?\d{4,5}|IEC\s?\d{4,5}|GB\/?T?\s?\d{4,5}|EN\s?\d{3,5}|CE|UL|FDA|HACCP|RoHS|REACH|FSC|SA8000|OHSAS\s?\d{4,5})$/i;

export function splitCertificationTokens(raw: string | null | undefined): string[] {
  return String(raw ?? "")
    .split(/[,，、;；/|·]/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && CERT_TOKEN.test(token));
}

function supplierFieldEvidence(field: string, displayName: string) {
  return {
    id: `supplier_field:${field}`,
    kind: "supplier_field" as const,
    ref: `supplier.${field}`,
    displayName,
  };
}

/** UNGM/平台注册状态归一（只处理明确表述，其余忽略 → 规则会落到 unknown） */
export function normalizeRegistrationStatus(raw: string | null | undefined): "active" | "inactive" | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (/已注册|注册成功|是|active|registered|valid|已认证/i.test(value)) return "active";
  if (/未注册|未|否|inactive|not\s*registered|无效|过期|expired/i.test(value)) return "inactive";
  return null;
}

/**
 * 从企业档案派生能力项：
 * - supplier.certification / certification_tags → certification（无有效期 → 规则判 unknown，保守）
 * - supplier_diagnosis.ungm_status → registration（仅明确状态）
 * - 手动/确认过的能力行（enterprise_capability_items）→ 原样映射
 * 其余字段（营收、人员数等）现有档案没有结构化数据，不猜测。
 */
export function deriveCapabilities(input: {
  enterpriseId: number;
  supplier?: SupplierRowLike | null;
  diagnosis?: DiagnosisRowLike | null;
  capabilityRows?: CapabilityRowLike[];
  evidenceRows?: EvidenceRowLike[];
}): CapabilityItem[] {
  const capabilities: CapabilityItem[] = [];
  const { enterpriseId, supplier, diagnosis, capabilityRows, evidenceRows } = input;

  if (supplier) {
    const tags = [
      ...splitCertificationTokens(supplier.certification),
      ...(Array.isArray(supplier.certification_tags) ? supplier.certification_tags.map((t) => String(t)) : []),
    ];
    const seen = new Set<string>();
    for (const token of tags) {
      const code = normalizeCertCode(token);
      if (!code || seen.has(code)) continue;
      seen.add(code);
      capabilities.push({
        id: `cap-cert-${code}`,
        enterpriseId,
        type: "certification",
        name: token,
        value: {
          kind: "certification",
          code,
          // 目录里没有证书有效期：先置空，规则判 unknown（不编造有效期）
          validUntil: null,
        },
        evidenceRefs: [supplierFieldEvidence("certification", `供应商证书登记：${token}`)],
        confirmation: { source: "supplier_sync", confirmedBy: null, confirmedAt: null },
      });
    }

  }

  if (diagnosis) {
    const regStatus = normalizeRegistrationStatus(diagnosis.ungm_status);
    if (regStatus) {
      capabilities.push({
        id: "cap-reg-ungm",
        enterpriseId,
        type: "registration",
        name: "UNGM 注册",
        value: { kind: "registration", platform: "UNGM", status: regStatus },
        evidenceRefs: [supplierFieldEvidence("diagnosis:ungm_status", "诊断问卷：UNGM 注册状态")],
        confirmation: { source: "diagnosis", confirmedBy: null, confirmedAt: null },
      });
    }
    if (diagnosis.tender_experience?.trim()) {
      capabilities.push({
        id: "cap-text-experience",
        enterpriseId,
        type: "text",
        name: "投标经验（诊断问卷）",
        value: { kind: "text", text: diagnosis.tender_experience.trim(), source: "diagnosis" },
        evidenceRefs: [supplierFieldEvidence("diagnosis:tender_experience", "诊断问卷：投标经验")],
        confirmation: { source: "diagnosis", confirmedBy: null, confirmedAt: null },
      });
    }
    if (diagnosis.english_evidence_level?.trim()) {
      capabilities.push({
        id: "cap-text-english",
        enterpriseId,
        type: "text",
        name: "英文证据能力（诊断问卷）",
        value: { kind: "text", text: diagnosis.english_evidence_level.trim(), source: "diagnosis" },
      });
    }
  }

  // 手动/已确认的能力行优先（同一业务键覆盖派生值）
  for (const row of capabilityRows ?? []) {
    const mapped = capabilityItemFromRow(row);
    if (!mapped) continue;
    // 手工/已确认的证书项：同 code 的派生项先移除（避免同一证书出现两条）
    if (mapped.type === "certification") {
      const code = normalizeCertCode(String((mapped.value as Record<string, unknown>).code ?? ""));
      if (code) {
        const derivedIndex = capabilities.findIndex(
          (c) => c.type === "certification" && normalizeCertCode(String((c.value as Record<string, unknown>).code ?? "")) === code,
        );
        if (derivedIndex >= 0) capabilities.splice(derivedIndex, 1);
      }
    }
    const index = capabilities.findIndex((c) => c.id === mapped.id);
    if (index >= 0) capabilities[index] = mapped;
    else capabilities.push(mapped);
  }

  // 证据行（enterprise_evidence）挂到对应能力上（category 对齐 type）
  for (const evidence of evidenceRows ?? []) {
    const ref = {
      id: `enterprise_evidence:${evidence.id}`,
      kind: "upload_file" as const,
      ref: `enterprise_evidence:${evidence.id}`,
      displayName: evidence.title,
      capturedAt: null,
    };
    const targetType = evidence.category === "cert" ? "certification" : evidence.category;
    // 优先按证据标题匹配同名能力（如「ISO14001 证书」→ code ISO14001），否则挂到同类第一条
    const titleNorm = String(evidence.title ?? "").toLowerCase();
    const sameType = capabilities.filter((c) => c.type === targetType);
    const target =
      sameType.find((c) => {
        const code = String((c.value as Record<string, unknown>)?.code ?? "").toLowerCase();
        return titleNorm.includes(String(c.name).toLowerCase()) || (!!code && titleNorm.includes(code));
      }) ?? sameType[0];
    if (!target) continue;
    target.evidenceRefs = [...(target.evidenceRefs ?? []), ref];
  }

  return capabilities;
}

/** enterprise_capability_items 行 → CapabilityItem */
export function capabilityItemFromRow(row: CapabilityRowLike): CapabilityItem | null {
  if (!row || !row.capability_type || !row.name) return null;
  const value = (row.value_json ?? {}) as CapabilityValue;
  if (!value || typeof value !== "object" || !("kind" in value)) return null;
  const refs = Array.isArray(row.evidence_refs_json)
    ? (row.evidence_refs_json as CapabilityItem["evidenceRefs"])
    : undefined;
  const confirmation = (row.confirmation_json ?? undefined) as CapabilityItem["confirmation"];
  return {
    id: `cap-row-${row.id}`,
    enterpriseId: Number(row.enterprise_id),
    type: row.capability_type as CapabilityItem["type"],
    name: String(row.name),
    value,
    evidenceRefs: refs,
    confirmation,
  };
}
