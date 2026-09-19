/**
 * /api/user/enterprise — 当前登录用户的企业信息（supplier 企业表）
 *
 * @module app/api/user/enterprise/route
 * @description
 *   GET  按 crm_users.supplier_id 关联 supplier 企业表，返回整行（SELECT * 透传），
 *        供前端分组表格渲染（有则展示、无则 -）；含防重兜底。
 *   PUT  已绑定：按 supplier 最终表可编辑列白名单 UPDATE 该行（企业信息编辑）。
 *   POST 未绑定：INSERT 新 supplier 行并回写 crm_users.supplier_id 完成绑定。
 *        填写字段与 supplier 最终表结构一致（所见即所填），与诊断/审核链路剥离。
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError, parseJson } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS, EC_FORBIDDEN } from "@/shared/constants/api";
import { hasSupplierPool } from "@/lib/services/identity";

/** 判断记录是否缺少关键字段（外部同步可能产生空字段重复记录） */
function isSparseRecord(row: Record<string, unknown> | null): boolean {
  if (!row) return true;
  const products = String(row.products ?? "").trim();
  const industry = String(row.industry ?? "").trim();
  return products === "" && industry === "";
}

/** 企业信息填写/编辑 body：全部可选字符串，键为 supplier 列名 */
const enterpriseBodySchema = z.object({
  company: z.string().max(200).optional(),
  name_confirmed: z.string().max(120).optional(),
  country: z.string().max(100).optional(),
  country_code: z.string().max(5).optional(),
  province: z.string().max(50).optional(),
  city: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
  registered_address: z.string().max(255).optional(),
  contact: z.string().max(100).optional(),
  position: z.string().max(100).optional(),
  phone: z.string().max(60).optional(),
  email: z.string().max(150).optional(),
  registered_phone: z.string().max(40).optional(),
  registered_email: z.string().max(120).optional(),
  website: z.string().max(255).optional(),
  legal_rep: z.string().max(50).optional(),
  established_at: z.string().max(20).optional(),
  registered_capital: z.string().max(40).optional(),
  credit_code: z.string().max(30).optional(),
  industry: z.string().max(200).optional(),
  type: z.string().max(20).optional(),
  business_type: z.string().max(50).optional(),
  certification: z.string().max(500).optional(),
  products: z.string().max(500).optional(),
  intro: z.string().max(2000).optional(),
  remark: z.string().max(2000).optional(),
});

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

/** 已绑定：更新企业行可编辑列 */
export const PUT = withRoute(async (req) => {
  const auth = await requireUserKeyOrThrow(req);
  const ctx = getContext();
  const body = await parseJson(req, enterpriseBodySchema);

  const user = await ctx.user.usersRepo.findProfileById(auth.userId);
  const supplierId = user?.supplier_id ? Number(user.supplier_id) : 0;
  if (!supplierId) {
    routeError(400, EC_INVALID_PARAMS, "尚未绑定企业，请先填写企业信息");
  }

  await ctx.supplier.directoryRepo.updateEnterprise(supplierId, body as Record<string, unknown>);
  return NextResponse.json({ code: 0, message: "ok" });
});

/** 未绑定：新建企业行并绑定到当前用户；防重：credit_code 优先、其次公司名，已存在则直接绑定已有行不新建 */
export const POST = withRoute(async (req) => {
  const auth = await requireUserKeyOrThrow(req);
  const ctx = getContext();

  // 身份互斥（ADR-0001）：已建立供应商资源库（外贸员身份）的账号不可再绑定企业——先用先占
  if (await hasSupplierPool(ctx.dbPool, auth.userId)) {
    routeError(403, EC_FORBIDDEN, "您已建立供应商资源库，如需绑定企业请先清空资源库");
  }

  const repo = ctx.supplier.directoryRepo;
  const body = await parseJson(req, enterpriseBodySchema);

  const companyName = String(body.company || body.name_confirmed || "").trim();
  if (!companyName) {
    routeError(400, EC_INVALID_PARAMS, "企业名称不能为空");
  }

  // ── 防重：已存在则绑定已有行，不新建 ──
  let existingId = 0;
  const creditCode = String(body.credit_code || "").trim();
  if (creditCode) {
    const byCredit = await repo.findByCreditCode(creditCode);
    if (byCredit) existingId = Number(byCredit.id);
  }
  if (!existingId) {
    const byCompany = await repo.findByCompanyBest(companyName);
    if (byCompany) existingId = Number(byCompany.id);
  }

  if (existingId) {
    await ctx.user.usersRepo.bindSupplier(auth.userId, existingId, "verified");
    return NextResponse.json({ code: 0, message: "ok", data: { supplierId: existingId, reused: true } });
  }

  // ── 新建：审核中 + 自注册来源 ──
  const newId = await repo.insertEnterprise(
    { ...(body as Record<string, unknown>), company: companyName, name_confirmed: companyName },
    { verify_status: "processing", source_channel: "self_register" },
  );
  if (!newId) {
    routeError(500, EC_INVALID_PARAMS, "企业信息创建失败");
  }

  await ctx.user.usersRepo.bindSupplier(auth.userId, newId, "verified");
  return NextResponse.json({ code: 0, message: "ok", data: { supplierId: newId, reused: false } });
});
