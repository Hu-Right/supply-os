/**
 * 供应商分页目录编排（server-only）
 * Supplier Directory Orchestration
 *
 * @module lib/services/suppliers-directory
 * @description 分页取数 + Supplier DTO 视图装配的服务端单一口径：
 *              /api/suppliers 分页分支与首页快照（home-snapshot content 段）共用，
 *              保证两个出口零漂移（2026-10-30 RSC 直出引入）。
 *              独立成文件而不并入 suppliers.ts：后者是纯 mapper（supplierViewOf），
 *              被多处（含单测）直接 import；编排需要 getContext/db 池（server-only），
 *              混入会把 server-only 拖进纯 mapper 的 import 链炸掉测试环境。
 */
import "server-only";
import type { Supplier } from "../types/supplier";
import type { SupplierDirectoryRow } from "../repos/suppliers";
import type { SupplierIndustryInfo } from "./industry-labels";
import type { CountryAliasSnapshot } from "./country/alias-store";
import { loadCountryAliasSnapshot } from "./country/alias-store";
import { loadSupplierIndustryInfo } from "./industry-labels";
import { supplierViewOf } from "./suppliers";
import { getContext } from "../db/context";

/** 批量映射：原始 DB 行 → 前端 Supplier DTO（column→field 转换 + 脱敏 + 行业面标签）。
 *  名字沿用 to*View 约定（命名红线②）：出口处自己看得出「已经过视图」。
 *  字典层任一路失败只降级为原文展示，不阻断目录可用性。 */
export async function toSupplierListView(
  rows: SupplierDirectoryRow[],
  industryRepo: import("../repos/industry-node.repo").IndustryNodeRepo,
): Promise<Supplier[]> {
  const industryById = new Map<number, SupplierIndustryInfo>();
  try {
    for (const [k, v] of await loadSupplierIndustryInfo(industryRepo, rows)) industryById.set(k, v);
  } catch (err) {
    // 字典层故障必须报出来（否则整站默默退回旧文本而无人知道），但不阻断目录
    console.error("[suppliers] 行业面标签装配失败，本次退回自填文本:", err);
  }
  let snap: CountryAliasSnapshot | undefined;
  try {
    snap = await loadCountryAliasSnapshot(getContext().dbPool);
  } catch (err) {
    // 表快照拉不到 → 本次退回原文（不阻断目录）；展示仍不回落静态字典
    console.error("[suppliers] 国家展示快照加载失败，本次退回原文:", err);
  }
  return rows.map((row) => supplierViewOf(row, industryById.get(Number(row.id)) ?? null, snap));
}

export interface SupplierDirectoryPageOptions {
  page: number;
  pageSize: number;
  /** 排序键：只透传键名，表达式由 repo 白名单给出（用户输入永不进 ORDER BY） */
  sort?: string;
  search?: string;
  industryCode?: string;
  industryCodes?: string[];
}

/**
 * 分页供应商目录（repo 取数 → Supplier DTO 视图）。
 * /api/suppliers 分页分支与首页快照共用，两个出口零漂移。
 */
export async function listSupplierDirectoryPage(
  opts: SupplierDirectoryPageOptions,
): Promise<{ items: Supplier[]; total: number; page: number; pageSize: number }> {
  const ctx = getContext();
  const { directoryRepo, industryRepo } = ctx.supplier;
  const offset = (opts.page - 1) * opts.pageSize;
  const { items, total } = await directoryRepo.listDirectoryPaginated({
    limit: opts.pageSize,
    offset,
    search: opts.search,
    sort: opts.sort,
    industryCode: opts.industryCode,
    industryCodes: opts.industryCodes,
  });
  return {
    items: await toSupplierListView(items, industryRepo),
    total,
    page: opts.page,
    pageSize: opts.pageSize,
  };
}
