/**
 * 采购需求发布域 API 客户端
 * @module features/procurement-demand/api
 */
import { api } from "@/core/http";

export interface BuyerInfo {
  id: number;
  orgName: string;
  orgType: string;
  buyerRole: string;
  country: string;
  address: string;
  regNo: string;
  taxNo: string;
  website: string;
  officialEmail: string;
  officialPhone: string;
  leaderName: string;
  leaderTitle: string;
  leaderPhone: string;
  leaderEmail: string;
  deliverCountry: string;
  deliverCity: string;
  fundSource: string;
  budgetStatus: string;
  externalRules: string;
  licenseFileUrl: string | null;
  agentAuthFileUrl: string | null;
  authContactName: string;
  authContactPhone: string;
  authContactEmail: string;
  procurementExperience: string;
  status: string;
  verifiedAt: number | null;
  verifyNote: string;
}

export interface ProjectSummary {
  id: number;
  reference: string;
  versionNo: number;
  status: string;
  titleZh: string;
  titleEn: string;
  purpose: string;
  objectTypes: string[];
  primaryUgtCode: string;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  deliveryCountry: string;
  deliveryCity: string;
  quoteDeadlineAt: number | null;
  publishedAt: number | null;
  createdAt: number | null;
  requirementVerify?: string;
  fundVerify?: string;
}

export interface ProjectDetail extends ProjectSummary {
  background: string;
  internalProjectNo: string;
  usageEnv: string;
  standards: string;
  incotermVersion: string;
  batchDelivery: boolean;
  batchNote: string;
  budgetApproved: string;
  deliveryAddress: string;
  deadlineDate: string;
  installNeeds: string[];
  logisticsNote: string;
  incoterm: string;
  paymentTerms: string;
  guarantees: string[];
  supplierCountryLimit: string;
  manufacturerOnly: boolean;
  supplierQuals: string;
  supplierConfirmDate: string;
  contractDate: string;
  contactDisclosure: string;
  compliance: Record<string, unknown> | null;
  buyerOrgName: string;
  requirementVerify: string;
  fundVerify: string;
  submittedAt: number | null;
  authorization: {
    status: "none" | "pending" | "verified" | "rejected";
    signerName: string | null;
    signedAt: number | null;
  };
  isOwner: boolean;
  /** 仅 owner 返回：预算是否可公开（编辑回填用，避免用"有金额"反推） */
  budgetPublic?: boolean;
  itemCount?: number;
  lots: Array<{ lotNo: string; title: string; scopeNote: string }>;
  items: Array<{
    id: number;
    lotId: number | null;
    lineNo: number;
    nameZh: string;
    nameEn: string;
    spec: string;
    quantity: number | null;
    qtyUnit: string;
    qtyType: string;
    ugtCode: string;
    attributes: unknown;
    alternativesAllowed: boolean;
  }>;
  attachments: Array<{
    id: number;
    versionNo: number;
    kind: string;
    filename: string;
    fileUrl: string;
    fileHash: string;
    sizeBytes: number;
    uploadedAt: number | null;
  }>;
  reviews: Array<{
    id: number;
    versionNo: number;
    stage: string;
    result: string;
    reviewer: string;
    note: string;
    createdAt: number | null;
  }>;
}

export interface ItemDraft {
  lotNo?: string;
  nameZh: string;
  nameEn?: string;
  spec?: string;
  quantity?: number | string;
  qtyUnit?: string;
  qtyType?: string;
  ugtCode?: string;
  alternativesAllowed?: boolean;
}

export interface BuyerVerification {
  id: number;
  kind: string;
  result: string;
  reviewer: string;
  note: string;
  hasEvidence: boolean;
  createdAt: number | null;
}

export async function fetchMyBuyer(): Promise<BuyerInfo | null> {
  const r = await api<{ buyer: BuyerInfo | null }>("/api/procurement/buyer");
  return r.buyer;
}

/** 主体 + 核验留痕（F05 认证页展示） */
export async function fetchMyBuyerWithVerifications(): Promise<{
  buyer: BuyerInfo | null;
  verifications: BuyerVerification[];
}> {
  const r = await api<{ buyer: BuyerInfo | null; verifications?: BuyerVerification[] }>("/api/procurement/buyer");
  return { buyer: r.buyer, verifications: r.verifications ?? [] };
}

export async function saveBuyer(fields: Record<string, unknown>): Promise<{ buyerId: number; status: string }> {
  return api<{ buyerId: number; status: string }>("/api/procurement/buyer", {
    method: "PUT",
    body: JSON.stringify(fields),
  });
}

export async function fetchMyProjects(status?: string): Promise<{ items: ProjectSummary[]; total: number }> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return api(`/api/procurement/projects${q}`);
}

export async function createProject(): Promise<{ id: number; reference: string }> {
  return api("/api/procurement/projects", { method: "POST", body: {} });
}

export async function fetchProject(id: number): Promise<ProjectDetail> {
  return api(`/api/procurement/projects/${id}`);
}

export async function patchProject(id: number, fields: Record<string, unknown>): Promise<{ changed: number }> {
  return api(`/api/procurement/projects/${id}`, { method: "PATCH", body: JSON.stringify(fields) });
}

export async function replaceItems(
  id: number,
  lots: Array<{ lotNo: string; title: string; scopeNote?: string }>,
  items: ItemDraft[],
): Promise<{ itemCount: number }> {
  return api(`/api/procurement/projects/${id}/items`, {
    method: "PUT",
    body: JSON.stringify({ lots, items }),
  });
}

export async function submitProject(id: number): Promise<{ status: string; versionNo: number; reference: string }> {
  return api(`/api/procurement/projects/${id}/submit`, { method: "POST", body: {} });
}

export async function withdrawProject(id: number): Promise<{ status: string }> {
  return api(`/api/procurement/projects/${id}/withdraw`, { method: "POST", body: {} });
}

export async function fetchAuthorization(id: number): Promise<{
  letterHash: string;
  versionNo: number;
  status: "none" | "pending" | "verified" | "rejected";
  signerName: string | null;
  signedAt: number | null;
  rejectReason: string | null;
}> {
  return api(`/api/procurement/projects/${id}/authorization`);
}

export async function fetchMatches(id: number): Promise<{
  items: Array<{ supplierId: number; company: string; province: string; city: string; score: number; reasons: string }>;
  total: number;
}> {
  return api(`/api/procurement/projects/${id}/matches`);
}

export async function fetchPlaza(opts: { categoryL1?: string; keyword?: string; page?: number } = {}): Promise<{
  items: ProjectSummary[];
  total: number;
}> {
  const q = new URLSearchParams();
  if (opts.categoryL1) q.set("category_l1", opts.categoryL1);
  if (opts.keyword) q.set("keyword", opts.keyword);
  if (opts.page) q.set("page", String(opts.page));
  return api(`/api/procurement/plaza${q.toString() ? `?${q.toString()}` : ""}`);
}
