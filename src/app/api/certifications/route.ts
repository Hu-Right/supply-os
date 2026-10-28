/**
 * GET /api/certifications — 认证资质列表（公开）
 *
 * 行→视图收在本文件（命名红线②）：仓储 `listActiveCertifications` 只 SELECT `id, name`，
 * 但「整块透出 rows」等于把 `supplier_certifications` 的列名当对外契约——以后给 SELECT
 * 加一列（`sort_order` / `created_at` 都是现成列）就会悄悄上网。函数名按约定后缀
 * `*ViewOf`，规则二因此能静态认出这里已收视图，无需再占登记位。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";
import type { CertificationRow } from "@/lib/repos/catalog.repo";

/** 对外契约项（与前端 `features/supplier/api.ts` 的 CertificationItem 同形） */
export interface CertificationOption {
  id: number;
  name: string;
}

/** 行→视图：只发契约两键。归一到 number/string 是因为契约就这么写的，不赌驱动实际给什么：
 *  id 是字符串时转 number、name 为 NULL 时给空串（两种脏输入各钉了一例，
 *  见 tests/unit/app/api/supplier-catalog-view.test.ts）；
 *  其余列（sort_order / is_active / created_at）一律不外泄。 */
function certificationViewOf(row: CertificationRow): CertificationOption {
  return { id: Number(row.id), name: String(row.name ?? "") };
}

export const GET = withRoute(async () => {
  const rows = await getContext().catalogRepo.listActiveCertifications();
  const items = rows.map(certificationViewOf);
  return NextResponse.json(items);
});
