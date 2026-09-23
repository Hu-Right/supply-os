/**
 * /api/user/enterprise — 当前登录用户的企业信息（supplier 企业表）
 *
 * @module app/api/user/enterprise/route
 * @description
 *   GET  按 crm_users.supplier_id 关联 supplier 企业表，返回整行（SELECT * 透传），
 *        供前端分组表格渲染（有则展示、无则 -）；含防重兜底。
 *   PUT  已绑定：按 supplier 最终表可编辑列白名单 UPDATE 该行（企业信息编辑）。
 *   POST 未绑定：先防重（credit_code 优先、其次公司名）——命中**已认证**行不绑定，
 *        返回 claimRequired 引导走认领审核；命中未认证行直接绑定已有行；
 *        均未命中则 INSERT 新 supplier 行并回写 crm_users.supplier_id 完成绑定。
 *        填写字段与 supplier 最终表结构一致（所见即所填），与诊断/审核链路剥离。
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError, parseJson } from "@/lib/middleware/route-handler";
import { deleteFile } from "@/lib/services/file-upload";
import type { SupplierDirectoryRepo } from "@/lib/repos/suppliers";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";

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
  /** 营业执照鉴权 URL；null/"" 表示移除。不在 EDITABLE_COLUMNS，由保存端单独协调。 */
  license_url: z.string().max(600).nullish(),
});

/**
 * 以企业保存为单一入口协调营业执照：写入新 URL（null 清空），并删除与新的不同的旧文件。
 * 仅当调用方显式传了 license_url（key 存在）时调用；未传则保持原状。
 */
async function reconcileLicense(
  repo: SupplierDirectoryRepo,
  supplierId: number,
  nextUrl: string | null,
): Promise<void> {
  const normalized = nextUrl && nextUrl.trim() ? nextUrl.trim() : null;
  const row = await repo.findFullById(supplierId);
  const oldUrl = row?.license_url ? String(row.license_url) : null;
  if ((oldUrl ?? null) === normalized) return;
  await repo.updateLicenseUrl(supplierId, normalized);
  if (oldUrl && oldUrl !== normalized) {
    try {
      await deleteFile(oldUrl);
    } catch (err) {
      console.warn("[enterprise] 删除旧执照文件失败:", (err as Error).message);
    }
  }
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
  // 执照以保存为单一入口：仅当本次 body 显式携带 license_url 时协调（含移除）
  if ("license_url" in body) {
    await reconcileLicense(ctx.supplier.directoryRepo, supplierId, body.license_url ?? null);
  }
  return NextResponse.json({ code: 0, message: "ok" });
});

/** 未绑定：新建企业行并绑定到当前用户；防重：credit_code 优先、其次公司名，已存在则直接绑定已有行不新建 */
export const POST = withRoute(async (req) => {
  const auth = await requireUserKeyOrThrow(req);
  const ctx = getContext();

  // V2（ADR-0004 取代 ADR-0001）：已建供应商资源库的账号也可绑定企业（两种身份不再互斥）。
  const repo = ctx.supplier.directoryRepo;
  const body = await parseJson(req, enterpriseBodySchema);

  const companyName = String(body.company || body.name_confirmed || "").trim();
  if (!companyName) {
    routeError(400, EC_INVALID_PARAMS, "企业名称不能为空");
  }

  // ── 防重：已存在则绑定已有行，不新建 ──
  let existingId = 0;
  let existingVerified = false;
  const creditCode = String(body.credit_code || "").trim();
  if (creditCode) {
    const byCredit = await repo.findByCreditCode(creditCode);
    if (byCredit) {
      existingId = Number(byCredit.id);
      existingVerified = byCredit.verify_status === "done";
    }
  }
  if (!existingId) {
    const byCompany = await repo.findByCompanyBest(companyName);
    if (byCompany) {
      existingId = Number(byCompany.id);
      existingVerified = byCompany.verify_status === "done";
    }
  }

  // 已认证企业不秒绑：绑定权与归属需审核背书，返回 claimRequired 由前端引导走认领流程
  // （认领通过 → claim approved，后台据此完成注册 KPI「个人→企业」翻转）
  if (existingId && existingVerified) {
    return NextResponse.json({ code: 0, message: "ok", data: { supplierId: existingId, claimRequired: true } });
  }

  if (existingId) {
    await ctx.user.usersRepo.bindSupplier(auth.userId, existingId, "verified");
    if ("license_url" in body) {
      await reconcileLicense(repo, existingId, body.license_url ?? null);
    }
    return NextResponse.json({ code: 0, message: "ok", data: { supplierId: existingId, reused: true } });
  }

  // ── 新建：审核中 + 自注册来源 ──
  const newId = await repo.insertEnterprise(
    { ...(body as Record<string, unknown>), company: companyName, name_confirmed: companyName },
    { verify_status: "pending", source_channel: "self_register" },
  );
  if (!newId) {
    routeError(500, EC_INVALID_PARAMS, "企业信息创建失败");
  }

  await ctx.user.usersRepo.bindSupplier(auth.userId, newId, "verified");
  // 新建后落入本次上传的执照（上传时尚无 supplier_id，此处为首次持久化）
  if ("license_url" in body && body.license_url) {
    await reconcileLicense(repo, newId, body.license_url);
  }
  return NextResponse.json({ code: 0, message: "ok", data: { supplierId: newId, reused: false } });
});
