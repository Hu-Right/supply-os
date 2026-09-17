/**
 * GET /api/user/enterprise — 当前登录用户的企业信息（supplier 企业表）
 *
 * @module app/api/user/enterprise/route
 * @description 依据 crm_users.supplier_id 关联 supplier 企业表，返回整行
 *              （SELECT * 透传，DATETIME 序列化为 ISO），供前端按分组表格渲染
 *              （基本信息/联系信息/工商与业务信息，有则展示、无则 -）。
 *              防重兜底：记录关键字段全空时按公司名回退到数据更完整的同公司记录。
 *              未绑定或记录不存在时 bound=false。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";

/** 判断记录是否缺少关键字段（外部同步可能产生空字段重复记录） */
function isSparseRecord(row: Record<string, unknown> | null): boolean {
  if (!row) return true;
  const products = String(row.products ?? "").trim();
  const industry = String(row.industry ?? "").trim();
  return products === "" && industry === "";
}

export const GET = withRoute(async (req) => {
  const auth = await requireUserKeyOrThrow(req);
  const ctx = getContext();
  const repo = ctx.supplier.directoryRepo;

  const user = await ctx.user.usersRepo.findProfileById(auth.userId);
  const supplierId = user?.supplier_id ? Number(user.supplier_id) : 0;
  const linkStatus = String(user?.supplier_link_status || "none");

  if (!supplierId) {
    return NextResponse.json({ code: 0, message: "ok", data: { bound: false, linkStatus, enterprise: null } });
  }

  let row = await repo.findFullById(supplierId);
  // 防重兜底：当前记录关键字段全空时，按公司名查找数据更完整的同公司记录
  if (row && isSparseRecord(row)) {
    const companyName = String(row.company ?? "").trim();
    if (companyName) {
      const better = await repo.findByCompanyBest(companyName);
      if (better && better.id !== row.id) {
        row = await repo.findFullById(Number(better.id));
      }
    }
  }

  if (!row) {
    return NextResponse.json({ code: 0, message: "ok", data: { bound: false, linkStatus, enterprise: null } });
  }

  return NextResponse.json({ code: 0, message: "ok", data: { bound: true, linkStatus, enterprise: row } });
});
