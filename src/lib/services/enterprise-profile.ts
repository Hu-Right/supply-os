/**
 * 企业能力档案 / 证据资料库 —— 编排服务（v0.2）
 *
 * @module lib/services/enterprise-profile
 * @description 企业设置页「能力档案」与「证据资料」的读写编排：
 *              - 企业主体 = 账号绑定的已认证 supplier（未认证直接 403 引导）；
 *              - 能力项按类型做最小结构化校验（kind + 允许字段），拒绝乱塞 JSON；
 *              - 证据 = upload_files 字节 + enterprise_evidence 元数据（分类/有效期）。
 *              产出为 camelCase 视图，供 API 与前端直接消费。
 */
import type { CapabilityRow, EvidenceRow, EnterpriseProfileRepo, VerifiedEnterpriseRow } from "@/lib/repos/enterprise-profile.repo";
import { routeError } from "@/lib/middleware/route-handler";
import { EC_ACCESS_FORBIDDEN, EC_INVALID_PARAMS, EC_NOT_FOUND } from "@/shared/constants/api";

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
export type ProfileCapabilityType = (typeof CAPABILITY_TYPES)[number];

export const EVIDENCE_CATEGORIES = ["cert", "experience", "financial", "personnel", "other"] as const;

export interface CapabilityView {
  id: number;
  type: ProfileCapabilityType;
  name: string;
  value: Record<string, unknown>;
}

export interface EvidenceView {
  id: number;
  category: string;
  title: string;
  validFrom: string | null;
  validUntil: string | null;
  noExpiry: boolean;
  hasFile: boolean;
}

export interface EnterpriseProfileView {
  enterpriseId: number;
  company: string;
  capabilities: CapabilityView[];
  evidence: EvidenceView[];
}

/** 仓储接口（测试注入内存实现） */
export interface EnterpriseProfileRepoLike {
  findVerifiedEnterprise(userId: number): Promise<VerifiedEnterpriseRow | null>;
  listCapabilities(enterpriseId: number): Promise<CapabilityRow[]>;
  insertCapability(params: {
    enterpriseId: number;
    capabilityType: string;
    name: string;
    value: unknown;
    evidenceRefs: unknown;
    confirmation: unknown;
  }): Promise<number>;
  deleteCapability(enterpriseId: number, id: number): Promise<boolean>;
  listEvidence(enterpriseId: number): Promise<EvidenceRow[]>;
  insertUploadFile(params: { filename: string; buffer: Buffer; contentType: string; uploadedBy: number }): Promise<number>;
  insertEvidence(params: {
    enterpriseId: number;
    uploadFileId: number | null;
    category: string;
    title: string;
    validFrom: string | null;
    validUntil: string | null;
    noExpiry: boolean;
    confirmed: boolean;
  }): Promise<number>;
  deleteEvidence(enterpriseId: number, id: number): Promise<{ deleted: boolean; uploadFileId: number | null }>;
}

export function createEnterpriseProfileRepo(repo: EnterpriseProfileRepo): EnterpriseProfileRepoLike {
  return repo as unknown as EnterpriseProfileRepoLike;
}

// ── 校验 ──────────────────────────────────────────────────────────────

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const num = (v: unknown): number | null => {
  if (v === "" || v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const isoDate = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  const ts = Date.parse(s);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString().slice(0, 10);
};

function sanitizeValue(type: ProfileCapabilityType, raw: unknown): Record<string, unknown> {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  switch (type) {
    case "certification": {
      const code = str(input.code) || str(input.name);
      if (!code) routeError(400, EC_INVALID_PARAMS, "证书项需要填写证书编码/名称");
      const validUntil = isoDate(input.validUntil);
      const noExpiry = input.noExpiry === true;
      if (!noExpiry && !validUntil) routeError(400, EC_INVALID_PARAMS, "证书需填写有效期，或选择长期有效");
      return { kind: "certification", code, issuer: str(input.issuer) || null, validFrom: isoDate(input.validFrom), validUntil: noExpiry ? null : validUntil, noExpiry };
    }
    case "experience": {
      const count = num(input.count);
      const years = num(input.years);
      if (count == null && years == null) routeError(400, EC_INVALID_PARAMS, "业绩项至少填写数量或年限");
      return { kind: "experience", count, years, amount: num(input.amount), currency: str(input.currency) || "CNY", similarScope: str(input.similarScope) || null };
    }
    case "financial": {
      const metric = str(input.metric);
      const value = num(input.value);
      if (!metric || value == null) routeError(400, EC_INVALID_PARAMS, "财务项需填写指标与数值");
      return { kind: "financial", metric, value, year: num(input.year), currency: str(input.currency) || "CNY" };
    }
    case "personnel": {
      const role = str(input.role);
      const count = num(input.count);
      if (!role || count == null) routeError(400, EC_INVALID_PARAMS, "人员项需填写岗位与人数");
      return { kind: "personnel", role, count, local: input.local === true };
    }
    case "localization":
      return {
        kind: "localization",
        hasLocalOffice: input.hasLocalOffice === true,
        hasLocalAgent: input.hasLocalAgent === true,
        hasLocalTaxId: input.hasLocalTaxId === true,
        country: str(input.country) || null,
      };
    case "registration": {
      const platform = str(input.platform);
      if (!platform) routeError(400, EC_INVALID_PARAMS, "注册项需填写平台名称");
      return { kind: "registration", platform, regNo: str(input.regNo) || null, status: str(input.status) || "active" };
    }
    case "technical": {
      const parameter = str(input.parameter);
      const value = num(input.value);
      if (!parameter || value == null) routeError(400, EC_INVALID_PARAMS, "技术项需填写参数名与数值");
      return { kind: "technical", parameter, value, unit: str(input.unit) || null };
    }
    case "text": {
      const text = str(input.text);
      if (!text) routeError(400, EC_INVALID_PARAMS, "文本能力项不能为空");
      return { kind: "text", text };
    }
    default:
      routeError(400, EC_INVALID_PARAMS, "未知的能力类型");
  }
}

/** 证据文件白名单（PDF/图片/Office/压缩包），≤10MB */
const EVIDENCE_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/zip": ".zip",
  "application/x-zip-compressed": ".zip",
};
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

// ── 读取 ──────────────────────────────────────────────────────────────

function capabilityViewOf(row: CapabilityRow): CapabilityView {
  const value = (row.value_json && typeof row.value_json === "object" ? row.value_json : {}) as Record<string, unknown>;
  return {
    id: Number(row.id),
    type: (CAPABILITY_TYPES as readonly string[]).includes(row.capability_type)
      ? (row.capability_type as ProfileCapabilityType)
      : "text",
    name: String(row.name ?? ""),
    value,
  };
}

function evidenceViewOf(row: EvidenceRow): EvidenceView {
  return {
    id: Number(row.id),
    category: String(row.category ?? "other"),
    title: String(row.title ?? ""),
    validFrom: row.valid_from ? String(row.valid_from).slice(0, 10) : null,
    validUntil: row.valid_until ? String(row.valid_until).slice(0, 10) : null,
    noExpiry: Number(row.no_expiry) === 1,
    hasFile: row.upload_file_id != null,
  };
}

async function requireEnterprise(
  repo: EnterpriseProfileRepoLike,
  userId: number,
): Promise<VerifiedEnterpriseRow> {
  const enterprise = await repo.findVerifiedEnterprise(userId);
  if (!enterprise) {
    routeError(403, EC_ACCESS_FORBIDDEN, "请先完成企业认证，再维护企业能力档案");
  }
  return enterprise;
}

export async function getEnterpriseProfile(
  repo: EnterpriseProfileRepoLike,
  userId: number,
): Promise<EnterpriseProfileView> {
  const enterprise = await requireEnterprise(repo, userId);
  const enterpriseId = Number(enterprise.id);
  const [capabilities, evidence] = await Promise.all([
    repo.listCapabilities(enterpriseId),
    repo.listEvidence(enterpriseId),
  ]);
  return {
    enterpriseId,
    company: String(enterprise.company ?? ""),
    capabilities: capabilities.map(capabilityViewOf),
    evidence: evidence.map(evidenceViewOf),
  };
}

// ── 写入 ──────────────────────────────────────────────────────────────

export async function addCapability(
  repo: EnterpriseProfileRepoLike,
  userId: number,
  input: { type?: unknown; name?: unknown; value?: unknown },
): Promise<CapabilityView> {
  const enterprise = await requireEnterprise(repo, userId);
  const type = String(input.type ?? "") as ProfileCapabilityType;
  if (!(CAPABILITY_TYPES as readonly string[]).includes(type)) {
    routeError(400, EC_INVALID_PARAMS, "未知的能力类型");
  }
  const name = str(input.name).slice(0, 120);
  if (!name) routeError(400, EC_INVALID_PARAMS, "能力名称不能为空");
  const value = sanitizeValue(type, input.value);
  const now = new Date().toISOString();
  const id = await repo.insertCapability({
    enterpriseId: Number(enterprise.id),
    capabilityType: type,
    name,
    value,
    evidenceRefs: [],
    confirmation: { source: "manual", confirmedBy: userId, confirmedAt: now },
  });
  return { id, type, name, value };
}

export async function removeCapability(
  repo: EnterpriseProfileRepoLike,
  userId: number,
  capabilityId: number,
): Promise<void> {
  const enterprise = await requireEnterprise(repo, userId);
  const deleted = await repo.deleteCapability(Number(enterprise.id), capabilityId);
  if (!deleted) routeError(404, EC_NOT_FOUND, "能力项不存在");
}

export async function addEvidence(
  repo: EnterpriseProfileRepoLike,
  userId: number,
  input: {
    category?: unknown;
    title?: unknown;
    validFrom?: unknown;
    validUntil?: unknown;
    noExpiry?: unknown;
    file?: { buffer: Buffer; contentType: string; size: number } | null;
  },
): Promise<EvidenceView> {
  const enterprise = await requireEnterprise(repo, userId);
  const category = String(input.category ?? "other");
  if (!(EVIDENCE_CATEGORIES as readonly string[]).includes(category)) {
    routeError(400, EC_INVALID_PARAMS, "未知的证据分类");
  }
  const title = str(input.title).slice(0, 160);
  if (!title) routeError(400, EC_INVALID_PARAMS, "证据名称不能为空");
  const noExpiry = input.noExpiry === true;
  const validFrom = isoDate(input.validFrom);
  const validUntil = isoDate(input.validUntil);
  if (!noExpiry && !validUntil && category === "cert") {
    routeError(400, EC_INVALID_PARAMS, "证书类证据需填写有效期，或选择长期有效");
  }

  let uploadFileId: number | null = null;
  if (input.file) {
    if (input.file.size > MAX_EVIDENCE_BYTES) routeError(400, EC_INVALID_PARAMS, "证据文件不能超过 10MB");
    const ext = EVIDENCE_TYPES[input.file.contentType];
    if (!ext) routeError(400, EC_INVALID_PARAMS, "仅支持 PDF/图片/Office/zip 格式");
    const filename = `evidence_${userId}_${Date.now()}${ext}`;
    uploadFileId = await repo.insertUploadFile({
      filename,
      buffer: input.file.buffer,
      contentType: input.file.contentType,
      uploadedBy: userId,
    });
  }

  const id = await repo.insertEvidence({
    enterpriseId: Number(enterprise.id),
    uploadFileId,
    category,
    title,
    validFrom,
    validUntil: noExpiry ? null : validUntil,
    noExpiry,
    confirmed: true,
  });
  return { id, category, title, validFrom, validUntil: noExpiry ? null : validUntil, noExpiry, hasFile: uploadFileId != null };
}

export async function removeEvidence(
  repo: EnterpriseProfileRepoLike,
  userId: number,
  evidenceId: number,
): Promise<void> {
  const enterprise = await requireEnterprise(repo, userId);
  const result = await repo.deleteEvidence(Number(enterprise.id), evidenceId);
  if (!result.deleted) routeError(404, EC_NOT_FOUND, "证据不存在");
}
