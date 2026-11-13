/**
 * GET /api/certifications — 认证资质列表（公开）
 *
 * 行→视图收在本文件（命名红线②）：仓储 `listActiveCertifications` 只 SELECT 四列，
 * 但「整块透出 rows」等于把 `supplier_certifications` 的列名当对外契约——以后给 SELECT
 * 加一列就会悄悄上网。函数名按约定后缀
 * `*ViewOf`，规则二因此能静态认出这里已收视图，无需再占登记位。
 *
 * 四键的用途（2026-11-13 扩容，供企业能力档案的证书下拉）：
 *   id / name  —— 展示与选中态
 *   code       —— 存库与匹配的锚点（能力档案存 code 快照，不存外键）
 *   category   —— 下拉分组（管理体系 / 行业特定 / 市场准入 / 产品安全 / 社会责任）
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";
import type { CertificationRow } from "@/lib/repos/catalog.repo";

/** 对外契约项（与前端 `features/training/api.ts` 的 CertificationRefItem 同形） */
export interface CertificationOption {
  id: number;
  code: string;
  name: string;
  category: string;
}

/** 行→视图：只发契约四键。归一到 number/string 是因为契约就这么写的，不赌驱动实际给什么：
 *  id 是字符串时转 number、name/code/category 为 NULL 时给空串（脏输入钉了用例，
 *  见 tests/unit/app/api/supplier-catalog-view.test.ts）；
 *  其余列（scope / aliases / is_active / created_at）一律不外泄。 */
function certificationViewOf(row: CertificationRow): CertificationOption {
  return {
    id: Number(row.id),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    category: String(row.category ?? ""),
  };
}

export const GET = withRoute(async () => {
  const rows = await getContext().catalogRepo.listActiveCertifications();
  const items = rows.map(certificationViewOf);
  return NextResponse.json(items);
});
