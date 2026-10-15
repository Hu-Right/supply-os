/**
 * 公告打标（后台运维）API client
 * @module core/api/noticeTagging
 * @description /settings/notice-tagging（任务卡片）与 /settings/notice-manage（结果+人工确认）
 *              的取数口。全部端点走 ADMIN_EMAILS 门禁；status 轮询不进缓存（要实时进度）。
 */
import { api } from "@/core/http";

export interface TaggingUsage {
  calls: number;
  promptTokens: number;
  completionTokens: number;
}

export interface TaggingRunStatus {
  running: boolean;
  phase: "idle" | "loading" | "classifying";
  limit: number | null;
  processed: number;
  written: number;
  lowConf: number;
  none: number;
  rejected: number;
  startedAt: string | null;
  finishedAt: string | null;
  stopRequested: boolean;
  recentErrors: string[];
  usage: TaggingUsage;
}

export interface TaggingStats {
  totalNotices: number;
  coveredNotices: number;
  uncoveredNotices: number;
  coverage: number;
  intakePending: number;
  bySource: Record<string, number>;
}

export interface PendingSuggestion {
  noticeId: string;
  pk: number;
  title: string;
  suggestCode: string;
  suggestName: string;
  suggestReason: string;
  expired: boolean;
}

export interface TaggingResultRow {
  noticeId: string;
  title: string;
  nodeCode: string;
  nodeName: string;
  level: number;
  confidence: number;
  source: string;
  model: string;
  evidence: string;
}

export interface TreeOption {
  key: string;
  nameZh: string;
  nameEn: string;
}

/** 当前账号是否有后台运维权限（导航显隐用） */
export async function fetchTaggingAccess(): Promise<boolean> {
  try {
    const r = await api<{ admin: boolean }>("/api/admin/notice-tagging/access");
    return Boolean(r?.admin);
  } catch {
    return false;
  }
}

export async function fetchTaggingStatus(): Promise<{ stats: TaggingStats; run: TaggingRunStatus }> {
  return api<{ stats: TaggingStats; run: TaggingRunStatus }>("/api/admin/notice-tagging/status");
}

export async function startTaggingRun(limit: number): Promise<{ ok: boolean; message: string; run: TaggingRunStatus }> {
  return api("/api/admin/notice-tagging/start", { method: "POST", body: { limit } });
}

export async function stopTaggingRun(): Promise<{ ok: boolean; run: TaggingRunStatus }> {
  return api("/api/admin/notice-tagging/stop", { method: "POST" });
}

export async function fetchPendingSuggestions(page = 1, pageSize = 20): Promise<{ total: number; page: number; pageSize: number; items: PendingSuggestion[] }> {
  return api(`/api/admin/notice-tagging/pending?page=${page}&pageSize=${pageSize}`);
}

export async function fetchTaggingResults(page = 1, pageSize = 20, source = ""): Promise<{ total: number; page: number; pageSize: number; items: TaggingResultRow[] }> {
  const q = source ? `&source=${encodeURIComponent(source)}` : "";
  return api(`/api/admin/notice-tagging/results?page=${page}&pageSize=${pageSize}${q}`);
}

/** 人工确认落点：code 由 UGT 树级联选出（最低 L2） */
export async function confirmTagging(noticeId: string, code: string, reason?: string): Promise<{ ok: boolean; code: string; nodeName: string }> {
  return api("/api/admin/notice-tagging/confirm", { method: "POST", body: { noticeId, code, reason } });
}

/** UGT 树级联选项（复用门户同一取数口；parent 空=32 个大类） */
export async function fetchTreeOptions(parent = ""): Promise<TreeOption[]> {
  const q = parent ? `?parent=${encodeURIComponent(parent)}` : "";
  return api(`/api/commodity/tree${q}`);
}
