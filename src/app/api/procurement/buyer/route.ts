/**
 * /api/procurement/buyer — 采购方主体（F01，七步流程第 1 步）
 *
 * @module app/api/procurement/buyer/route
 * @description GET = 我的采购主体（无则返回 null，前端引导补认证资料）；
 *              PUT = 创建/更新主体资料（一个账号一个主体，幂等 upsert；已核验主体
 *              改关键身份字段自动回落 pending 重新核验）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError, RouteError } from "@/lib/middleware/route-handler";
import { EC_INTERNAL_ERROR, EC_INVALID_PARAMS } from "@/shared/constants/api";
import { getBuyerByUserId, upsertBuyer, listBuyerVerifications, type BuyerRow } from "@/lib/services/procurement/buyers";
import { buyerViewOf, buyerVerificationViewOf } from "@/lib/services/procurement/views";
import { buyerRiskFlags, findBuyerDuplicates } from "@/lib/services/procurement/buyer-compliance";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  try {
    const pool = getPool();
    const row = await getBuyerByUserId(pool, auth.userId);
    if (!row) return NextResponse.json({ buyer: null, verifications: [] });
    const buyer = (row as unknown as BuyerRow) || null;
    /** 我的主体视图（含核验留痕、查重结果与风险提示，F01 可追溯） */
    const buyerViewOfMine = (
      b: BuyerRow,
      verifications: Awaited<ReturnType<typeof listBuyerVerifications>>,
      duplicates: Awaited<ReturnType<typeof findBuyerDuplicates>>,
      riskFlags: string[],
    ) => ({
      buyer: buyerViewOf(b),
      verifications: verifications.map(buyerVerificationViewOf),
      duplicates,
      riskFlags,
    });
    const verifications = await listBuyerVerifications(pool, Number(buyer.id));
    const duplicates = await findBuyerDuplicates(pool, {
      buyerId: Number(buyer.id),
      orgName: String(buyer.org_name ?? ""),
      regNo: buyer.reg_no,
      email: buyer.official_email,
      phone: buyer.official_phone,
    });
    return NextResponse.json(buyerViewOfMine(buyer, verifications, duplicates, buyerRiskFlags(buyer)));
  } catch (err) {
    if (err instanceof RouteError) throw err;
    console.warn("[api/procurement/buyer] load failed:", (err as Error).message);
    routeError(500, EC_INTERNAL_ERROR, "加载采购主体失败，请稍后重试");
  }
});

export const PUT = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    routeError(400, EC_INVALID_PARAMS, "请求体非法 JSON");
  }
  const orgName = String(body.orgName ?? "").trim();
  if (!orgName) routeError(400, EC_INVALID_PARAMS, "采购主体法定名称必填");

  try {
    const result = await upsertBuyer(getPool(), {
      userId: auth.userId,
      fields: {
        org_name: orgName,
        org_type: body.orgType,
        buyer_role: body.buyerRole,
        country: body.country,
        address: body.address,
        reg_no: body.regNo,
        tax_no: body.taxNo,
        website: body.website,
        official_email: body.officialEmail,
        official_phone: body.officialPhone,
        leader_name: body.leaderName,
        leader_title: body.leaderTitle,
        leader_phone: body.leaderPhone,
        leader_email: body.leaderEmail,
        deliver_country: body.deliverCountry,
        deliver_city: body.deliverCity,
        fund_source: body.fundSource,
        budget_status: body.budgetStatus,
        external_rules: body.externalRules,
        ...(body.licenseFileKey !== undefined || body.license_file_key !== undefined
          ? { license_file_key: body.licenseFileKey ?? body.license_file_key }
          : {}),
        ...(body.licenseFileHash !== undefined || body.license_file_hash !== undefined
          ? { license_file_hash: body.licenseFileHash ?? body.license_file_hash }
          : {}),
        ...(body.agentAuthFileKey !== undefined ? { agent_auth_file_key: body.agentAuthFileKey } : {}),
        ...(body.agentAuthFileHash !== undefined ? { agent_auth_file_hash: body.agentAuthFileHash } : {}),
        ...(body.authContactName !== undefined ? { auth_contact_name: body.authContactName } : {}),
        ...(body.authContactPhone !== undefined ? { auth_contact_phone: body.authContactPhone } : {}),
        ...(body.authContactEmail !== undefined ? { auth_contact_email: body.authContactEmail } : {}),
        ...(body.procurementExperience !== undefined ? { procurement_experience: body.procurementExperience } : {}),
      },
    });
    const row = await getBuyerByUserId(getPool(), auth.userId);
    /** 保存结果视图 */
    const buyerSavedViewOf = (b: BuyerRow | null) => ({
      buyerId: b ? Number(b.id) : result.buyerId,
      status: result.status,
      buyer: b ? buyerViewOf(b) : null,
    });
    return NextResponse.json(buyerSavedViewOf(row));
  } catch (err) {
    if (err instanceof RouteError) throw err;
    console.warn("[api/procurement/buyer] save failed:", (err as Error).message);
    routeError(500, EC_INTERNAL_ERROR, "保存采购主体失败，请稍后重试");
  }
});
