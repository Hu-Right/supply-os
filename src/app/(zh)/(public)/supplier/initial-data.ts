/**
 * /supplier 首屏服务端数据
 *
 * @description 直出默认筛选下的第一页供应商，供 AI/爬虫在不执行 JS 时读到
 *              公司名、主营产品、国家等事实；构建阶段无数据库时返回 undefined。
 */
import "server-only";
import type { Supplier } from "@/types";
import { listSupplierDirectoryPage } from "@/lib/services/suppliers-directory";

export async function loadSupplierInitial(): Promise<{ suppliers: Supplier[]; total: number } | undefined> {
  if (process.env.NEXT_PHASE === "phase-production-build") return undefined;
  try {
    const { items, total } = await listSupplierDirectoryPage({ page: 1, pageSize: 8 });
    return { suppliers: items, total };
  } catch (err) {
    console.error("[supplier] 首屏直出取数失败:", (err as Error).message);
    return undefined;
  }
}
