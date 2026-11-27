/**
 * 供应商资源库服务
 * @module lib/services/supplier-pool
 * @description 添加供应商的编排层：上限校验 → 平台目录匹配 → 未匹配时
 *              复用/创建 pending 基础记录，供应商行与资源库行在同一事务内落库，
 *              避免半途失败留下孤儿 supplier 行。路由层只做鉴权、校验与错误映射。
 */
import type { Pool } from "mysql2/promise";
import { UserSupplierPoolRepo, type PoolSupplierItem } from "../repos/user-supplier-pool.repo";
import { SUPPLIER_POOL_MAX_SIZE } from "@/shared/constants/supplier-pool";

/** 资源库容量上限（防滥用）：单个账号可绑定的供应商/合作工厂数量上限，与前端展示同源 */
export const MAX_POOL_SIZE = SUPPLIER_POOL_MAX_SIZE;

/**
 * 资源库行的对外视图（命名红线② 2026-10-28）。
 * 仓储 `listByUser` 返的是列名口径（`pool_id` / `supplier_id` / `has_qualification` /
 * `created_at`，SQL 别名也算列名），而列名属存储层、不是契约。值一律原样透传：
 * `hasQualification` 继续是 0/1 而不是布尔（改值口径就不是改名了）。
 */
export interface PoolSupplierView {
  poolId: number;
  supplierId: number | null;
  company: string;
  /** ⚠ 服务端目前恒给空串（SQL 里写的是 `'' AS industry`），前端那个分支实际不会渲染 */
  industry: string;
  /** 只有 reviewed 的供应商才有公开详情页；前端据此决定行标题是否可点 */
  infoReviewStatus: string;
  hasQualification: number;
  notes: string | null;
  source: string;
  createdAt: string;
}

export function poolSupplierViewOf(row: PoolSupplierItem): PoolSupplierView {
  return {
    poolId: Number(row.pool_id),
    supplierId: row.supplier_id === null || row.supplier_id === undefined ? null : Number(row.supplier_id),
    company: String(row.company ?? ""),
    industry: String(row.industry ?? ""),
    infoReviewStatus: String(row.info_review_status ?? ""),
    hasQualification: Number(row.has_qualification ?? 0),
    notes: row.notes === null || row.notes === undefined ? null : String(row.notes),
    source: String(row.source ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

/** 批量：GET /api/user/supplier-pool 的 list 用 */
export function toPoolSupplierListView(rows: readonly PoolSupplierItem[]): PoolSupplierView[] {
  return rows.map(poolSupplierViewOf);
}

/** 我的资源库列表（取数 + 行→视图都在本层，路由不再自己 new repo） */
export async function listPoolSupplierViews(pool: Pool, userId: number): Promise<PoolSupplierView[]> {
  return toPoolSupplierListView(await new UserSupplierPoolRepo(pool).listByUser(userId));
}

/** 候选项的对外视图（`in_pool` 是 SQL 别名，不上网） */
export interface PoolCandidateView {
  id: number;
  company: string;
  /** ⚠ 同样恒为空串（目录取数口未 JOIN 行业字典） */
  industry: string;
  inPool: number;
}

export function poolCandidateViewOf(row: {
  id: number;
  company: string;
  industry: string;
  in_pool: number;
}): PoolCandidateView {
  return {
    id: Number(row.id),
    company: String(row.company ?? ""),
    industry: String(row.industry ?? ""),
    inPool: Number(row.in_pool ?? 0),
  };
}

export type AddSupplierPoolResult =
  | { ok: true; poolId: number; source: "platform"; supplierId: number }
  | { ok: false; reason: "pool_full" | "duplicate" | "not_found" };

/** 候选确认入口：用户在候选列表中点选指定供应商后按 id 添加（不做模糊猜测） */
export async function addSupplierByIdToPool(
  pool: Pool,
  userId: number,
  supplierId: number,
): Promise<AddSupplierPoolResult> {
  const repo = new UserSupplierPoolRepo(pool);

  const count = await repo.countByUser(userId);
  if (count >= MAX_POOL_SIZE) {
    return { ok: false, reason: "pool_full" };
  }

  const matched = await repo.findVerifiedById(supplierId);
  if (!matched) {
    return { ok: false, reason: "not_found" };
  }
  const poolId = await repo.addFromPlatform(userId, matched.id);
  if (!poolId) {
    return { ok: false, reason: "duplicate" };
  }
  return { ok: true, poolId, source: "platform", supplierId: matched.id };
}

/** 候选搜索：供添加前预览平台目录（含"已在资源库"标记）；出口已是 camel 视图 */
export async function searchPoolCandidates(
  pool: Pool, userId: number, keyword: string, limit = 8,
): Promise<PoolCandidateView[]> {
  const rows = await new UserSupplierPoolRepo(pool).searchVerifiedByCompany(keyword.trim(), limit, userId);
  return rows.map(poolCandidateViewOf);
}
