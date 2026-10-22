/**
 * /api/user/enterprise — 当前登录用户的企业信息（supplier 企业表）
 *
 * @module app/api/user/enterprise/route
 * @description
 *   GET  按 crm_users.supplier_id 关联 supplier 企业表，返回整行（SELECT * 透传），
 *        供前端分组表格渲染（有则展示、无则 -）；读写严格指向同一个绑定行。
 *   PUT  已绑定：按 supplier 最终表可编辑列白名单 UPDATE 该行（企业信息编辑）。
 *   POST 未绑定：先防重（credit_code 优先、其次公司名）——命中**已认证**行不绑定，
 *        返回 claimRequired 引导走认领审核；命中未认证行与全新建档均走【认领单+临时绑定】
 *        （2026-10-14 统一认领口径：不再裸秒绑，createClaimWithBinding 立认领单、
 *        supplier.claim_status='pending'，后台人工核验执照通过才算真绑定；带执照 7 天审核期，
 *        无执照 1 小时限时上传期）。
 *        账号侧换绑（分状态）：旧绑定未拿下认证时允许换绑——先显式撤回旧绑定
 *        （解绑 + 作废旧认领）再绑新主体；旧绑定已认证则 400，变更主体只能走后台/客服。
 *        填写字段与 supplier 最终表结构一致（所见即所填），与诊断/审核链路剥离。
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError, parseJson } from "@/lib/middleware/route-handler";
import { deleteFile } from "@/lib/services/file-upload";
import { createClaimWithBinding } from "@/lib/services/supplier-claim";
import { upsertPendingLicenseChange, latestLicenseChangeForSupplier } from "@/lib/services/license-change";
import { licenseFilenameFromUrl } from "@/lib/services/file-upload";
import { assertBindingAllowsSubject, readCurrentBinding, assertVerifiedSubjectIdentityStable } from "@/lib/services/enterprise-binding";
import {
  replaceSupplierSelfReport,
  listSupplierSelfReport,
} from "@/lib/services/commodity/supplier-self-report";
import type { SupplierDirectoryRepo } from "@/lib/repos/suppliers";
import type { AppContext } from "@/lib/db/context";
import { EC_INVALID_PARAMS, EC_INTERNAL_ERROR, EC_ENTERPRISE_NOT_BOUND, EC_ENTERPRISE_CLAIMED_BY_OTHER } from "@/shared/constants/api";

/** 企业信息填写/编辑 body：全部可选字符串，键为 supplier 列名 */
const enterpriseBodySchema = z.object({
  company: z.string().max(200).optional(),
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
  business_type: z.string().max(50).optional(),
  certification: z.string().max(500).optional(),
  products: z.string().max(500).optional(),
  intro: z.string().max(2000).optional(),
  remark: z.string().max(2000).optional(),
  /** 营业执照鉴权 URL；null/"" 表示移除。不在 EDITABLE_COLUMNS，由保存端单独协调。 */
  license_url: z.string().max(600).nullish(),
  /**
   * 主营品目自报：品目骨架 UGT 节点码集合（2~5 级）。仅当 key 存在时协调 self_report 落点；
   * 空数组即清空全部自报。服务端只认当前绑定 supplierId，绝不接受前端透传主体。
   */
  commodity_nodes: z.array(z.string().max(24)).max(60).optional(),
});

/**
 * 自报落点写入闸口：只有 body 显式携带 commodity_nodes 才动 self_report 行（缺键保持原状，
 * 与 license_url 同一「显式才协调」口径）。存在性校验与丢弃都在服务内做，这里只点名 dropped。
 */
async function persistSelfReportIfPresent(
  ctx: AppContext,
  supplierId: number,
  body: z.infer<typeof enterpriseBodySchema>,
): Promise<void> {
  if (!("commodity_nodes" in body) || !body.commodity_nodes) return;
  const { stored, dropped } = await replaceSupplierSelfReport(ctx.dbPool, supplierId, body.commodity_nodes);
  if (dropped.length > 0) {
    console.warn(`[enterprise] 供应商 ${supplierId} 自报品目 ${dropped.length} 个码换不出节点被丢弃，样本 ${dropped.slice(0, 3).join("、")}（落库 ${stored.length} 个）`);
  }
}

/**
 * 以企业保存为单一入口协调营业执照：写入新 URL（null 清空），并删除与新的不同的旧文件。
 * 仅当调用方显式传了 license_url（key 存在）时调用；未传则保持原状。
 * 双时钟：本次为"写入非空执照"时，把该用户对此主体的 pending 认领从 1 小时限时上传期
 * 续期到 7 天管理员审核期。
 * 先审后生效（2026-10-14）：已认证供应商换照不直接生效——
 * 新图登记 crm_license_changes 待审，supplier.license_url 保持旧图、旧图永不删除，
 * 后台「资质变更」人工通过后才切换；清空执照同样需要审核。
 * 「已认证」= 认证已通过（verify done）**或**认领已通过（claim verified，永久绑定）——
 * 两者的执照当初都经人工核验，换照必须复审（仅判 verify done 会漏掉
 * 「认领已通过、认证待审」的供应商，其换照曾直接生效）。返回本次是否进入待审。
 */
async function reconcileLicense(
  ctx: AppContext,
  repo: SupplierDirectoryRepo,
  supplierId: number,
  userId: number,
  nextUrl: string | null,
): Promise<{ pendingReview: boolean }> {
  const normalized = nextUrl && nextUrl.trim() ? nextUrl.trim() : null;
  const row = await repo.findFullById(supplierId);
  const oldUrl = row?.license_url ? String(row.license_url) : null;
  if ((oldUrl ?? null) === normalized) return { pendingReview: false };

  if (row?.verify_status === "done" || row?.claim_status === "verified") {
    await upsertPendingLicenseChange({
      supplierId,
      filename: normalized ? licenseFilenameFromUrl(normalized) : null,
      prevFilename: oldUrl ? licenseFilenameFromUrl(oldUrl) : null,
      uploadedBy: userId,
    });
    return { pendingReview: true };
  }

  await repo.updateLicenseUrl(supplierId, normalized);
  if (normalized) {
    const reviewExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
    await ctx.supplier.claimRepo.extendPendingClaimExpiry(userId, supplierId, reviewExpiresAt);
  }
  if (oldUrl && oldUrl !== normalized) {
    try {
      await deleteFile(oldUrl);
    } catch (err) {
      console.warn("[enterprise] 删除旧执照文件失败:", (err as Error).message);
    }
  }
  return { pendingReview: false };
}

/** 双时钟：带执照提交 → 直接 7 天审核期；无执照 → 1 小时限时上传期（与企业页执照必填互为兜底） */
function claimExpiryFrom(licenseUrl: string | undefined): string {
  const ms = licenseUrl ? 7 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  return new Date(Date.now() + ms).toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
}

/** body 里的执照鉴权 URL：非空字符串才视为有执照（空串=未提供，交由双时钟兜底） */
function normalizeLicenseUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t || undefined;
}

/**
 * 统一认领口径（2026-10-14）：绑定必须落在认领单上，人工审核通过才算真绑定。
 * 已有有效认领（pending/approved，重复保存）幂等跳过；行已认证（verify_status='done'）
 * 视为历史后台背书，不补单。返回是否新建了认领单；false 时调用方需自行补 bindSupplier。
 */
async function ensurePendingClaim(
  ctx: AppContext,
  userId: number,
  supplierId: number,
  licenseUrl: string | undefined,
): Promise<boolean> {
  const existing = await ctx.supplier.claimRepo.findByUserAndSupplier(userId, supplierId).catch(() => null);
  if (existing) return false;
  const row = await ctx.supplier.directoryRepo.findFullById(supplierId);
  if (!row || row.verify_status === "done") return false;
  await createClaimWithBinding(ctx, {
    userId,
    supplierId,
    licenseUrl,
    expiresAt: claimExpiryFrom(licenseUrl),
  });
  return true;
}

export const GET = withRoute(async (req) => {
  const auth = await requireUserKeyOrThrow(req);
  const ctx = getContext();
  const repo = ctx.supplier.directoryRepo;

  const user = await ctx.user.usersRepo.findProfileById(auth.userId);
  const supplierId = user?.supplier_id ? Number(user.supplier_id) : 0;
  const linkStatus = String(user?.supplier_link_status || "none");

  if (!supplierId) {
    return NextResponse.json({ bound: false, linkStatus, enterprise: null });
  }

  // 只读自己绑定的那一行。旧逻辑命中「空壳行」时会静默换成同名更完整的行，
  // 造成 GET 展示 A 行、PUT 写 B 行的读写不对称（已认证判定也会跟着错位）；
  // 2026-10-08 实库取证：21 个绑定行的同名重复行数均为 0，该回退已不再替任何人兜底，
  // 按「不保留向后兼容」直接删除：绑到空壳行就在空壳行上补资料，补完即完整。
  const row = await repo.findFullById(supplierId);

  if (!row) {
    return NextResponse.json({ bound: false, linkStatus, enterprise: null });
  }

  // 换照审核进展（闭环的前台状态源）：先审后生效期间前台据此展示「审核中/被驳回」，
  // 后台通过/驳回后本字段随刷新翻转，不再只靠保存时的瞬时 toast。
  const licenseChange = await latestLicenseChangeForSupplier(supplierId).catch(() => null);

  // 自报主营品目（编辑页回填）：读失败兜底空数组，不阻断企业页展示（与行业面装配失败退回自填文本同风格）。
  const commodityNodes = await listSupplierSelfReport(ctx.dbPool, supplierId).catch(() => []);

  return NextResponse.json({ bound: true, linkStatus, enterprise: row, licenseChange, commodityNodes });
});

/** 已绑定：更新企业行可编辑列（已认证主体的身份三要素不可改写） */
export const PUT = withRoute(async (req) => {
  const auth = await requireUserKeyOrThrow(req);
  const ctx = getContext();
  const body = await parseJson(req, enterpriseBodySchema);

  const user = await ctx.user.usersRepo.findProfileById(auth.userId);
  const supplierId = user?.supplier_id ? Number(user.supplier_id) : 0;
  if (!supplierId) {
    routeError(400, EC_ENTERPRISE_NOT_BOUND, "尚未绑定企业，请先填写企业信息");
  }

  // 编辑闸口：已认证行不得把 company / credit_code 改成另一家公司（否则绕过审核把认证挪走）
  await assertVerifiedSubjectIdentityStable(ctx, supplierId, body as Record<string, unknown>);

  await ctx.supplier.directoryRepo.updateEnterprise(supplierId, body as Record<string, unknown>);
  // 执照以保存为单一入口：仅当本次 body 显式携带 license_url 时协调（含移除）；
  // 已认证供应商换照 → 进入待审（先审后生效）
  let licensePendingReview = false;
  if ("license_url" in body) {
    const r = await reconcileLicense(ctx, ctx.supplier.directoryRepo, supplierId, auth.userId, body.license_url ?? null);
    licensePendingReview = r.pendingReview;
  }
  // legacy 自愈：秒绑时代（2026-10-14 前）绑定的未认证行可能没有认领单，补建进审核队列。
  // 执照已在行上（认领单经 supplier JOIN 读图），不重写。
  const claimCreated = await ensurePendingClaim(ctx, auth.userId, supplierId, undefined);
  // 主营品目自报：仅在 body 显式携带 commodity_nodes 时替换 self_report 落点（服务端解析的 supplierId）。
  await persistSelfReportIfPresent(ctx, supplierId, body);
  return NextResponse.json({ claimCreated, licensePendingReview });
});

/** 未绑定：新建企业行并绑定到当前用户；防重：credit_code 优先、其次公司名，已存在则直接绑定已有行不新建；
 *  账号侧排他：已绑定其他主体的账号一律拒绝（见 POST 内注释） */
export const POST = withRoute(async (req) => {
  const auth = await requireUserKeyOrThrow(req);
  const ctx = getContext();

  // V2（ADR-0004 取代 ADR-0001）：已建供应商资源库的账号也可绑定企业（两种身份不再互斥）。
  const repo = ctx.supplier.directoryRepo;
  const body = await parseJson(req, enterpriseBodySchema);

  const companyName = String(body.company || "").trim();
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
  //
  // 账号侧换绑闸口先于 claimRequired：旧行为下「一账号一主体」只靠前端 bound ? PUT : POST
  // 隐式保证，直接 POST 会让已绑定账号再建一行 supplier 并静默挪走 crm_users.supplier_id（把
  // 审核中的原主体抛下）；现在旧绑定未认证则先显式撤回，已认证则 400 并给出客服出口。
  const binding = await readCurrentBinding(ctx, auth.userId);
  await assertBindingAllowsSubject(ctx, auth.userId, binding, existingId, "certify");
  const isOwnBoundRow = !!binding && binding.supplierId === existingId;

  if (existingId && existingVerified && !isOwnBoundRow) {
    return NextResponse.json({ supplierId: existingId, claimRequired: true });
  }

  // 未认证主体的复用绑定同样受认领排他约束：已被他人认领/他人认领处理中的公司
  // 不能在这里直接绑走（与 POST /api/supplier-claims 同一口径）。
  // 自己已绑定的行属于重复保存资料，放行。
  if (existingId) {
    const ownership = await repo.getClaimOwnership(existingId, auth.userId);
    if (!ownership.selfBound && (ownership.boundByOther || ownership.claimPending)) {
      routeError(400, EC_ENTERPRISE_CLAIMED_BY_OTHER, "该公司已被其他账户认领，无法绑定");
    }
    // 统一认领口径（2026-10-14）：复用未认证行不再裸秒绑，改走认领单+临时绑定，
    // 后台人工审核（核验执照）通过才算真绑定。createClaimWithBinding 内部已含
    // 临时绑定与执照落库；已有有效认领单/已认证行时幂等回落为直接绑定，
    // 执照按保存口径协调（已认证行换照 → 进入待审）。
    const licenseUrl = normalizeLicenseUrl(body.license_url);
    const claimCreated = await ensurePendingClaim(ctx, auth.userId, existingId, licenseUrl);
    let licensePendingReview = false;
    if (!claimCreated) {
      await ctx.user.usersRepo.bindSupplier(auth.userId, existingId, "verified");
      if ("license_url" in body) {
        const r = await reconcileLicense(ctx, repo, existingId, auth.userId, body.license_url ?? null);
        licensePendingReview = r.pendingReview;
      }
    }
    // 自有行重复保存：同 PUT 口径协调自报品目（仅 body 携键时）。
    await persistSelfReportIfPresent(ctx, existingId, body);
    return NextResponse.json({ supplierId: existingId, reused: true, claimCreated, licensePendingReview });
  }

  // ── 新建：审核中 + 自注册来源 ──
  const newId = await repo.insertEnterprise(
    { ...(body as Record<string, unknown>), company: companyName },
    { verify_status: "pending", source_channel: "self_register" },
  );
  if (!newId) {
    routeError(500, EC_INTERNAL_ERROR, "企业信息创建失败");
  }

  // 统一认领口径：新建档案同样先立认领单+临时绑定，人工审核通过才算真绑定；
  // 本次上传的执照随 createClaimWithBinding 首次持久化到该行（上传时尚无 supplier_id）
  const licenseUrl = normalizeLicenseUrl(body.license_url);
  await createClaimWithBinding(ctx, {
    userId: auth.userId,
    supplierId: newId,
    licenseUrl,
    expiresAt: claimExpiryFrom(licenseUrl),
  });
  // 新建建档：本次勾选的自报品目随新行落库（仅 body 携键时）。
  await persistSelfReportIfPresent(ctx, newId, body);
  return NextResponse.json({ supplierId: newId, reused: false, claimCreated: true });
});
