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
import { missingBuyerFields, BUYER_REQUIRED_FIELD_LABELS_ZH } from "@/shared/constants/buyer-form";

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

  try {
    const pool = getPool();
    const existing = await getBuyerByUserId(pool, auth.userId);

    /** 未提交的字段沿用库内已有值（部分更新），显式提交空值则视为缺失 */
    const pick = (keys: string[], current: string | null | undefined): string => {
      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(body, key)) {
          return String(body[key] ?? "").trim();
        }
      }
      return String(current ?? "").trim();
    };

    const orgName = pick(["orgName", "org_name"], existing?.org_name);
    const buyerRole = pick(["buyerRole", "buyer_role"], existing?.buyer_role);
    const country = pick(["country"], existing?.country);
    const regNo = pick(["regNo", "reg_no"], existing?.reg_no);
    const officialEmail = pick(["officialEmail", "official_email"], existing?.official_email);
    const authContactName = pick(["authContactName", "auth_contact_name"], existing?.auth_contact_name);
    const licenseKey = pick(["licenseFileKey", "license_file_key"], existing?.license_file_key);
    const agentAuthKey = pick(["agentAuthFileKey", "agent_auth_file_key"], existing?.agent_auth_file_key);

    // 页面标 `*` 的字段每次保存都必须齐全；前端相同判定（shared/constants/buyer-form）
    const missing = missingBuyerFields({
      orgName,
      buyerRole,
      country,
      regNo,
      officialEmail,
      authContactName,
      hasLicense: Boolean(licenseKey),
      hasAgentAuthDoc: Boolean(agentAuthKey),
    });
    if (missing.length > 0) {
      routeError(
        400,
        EC_INVALID_PARAMS,
        "请补全必填信息：" + missing.map((key) => BUYER_REQUIRED_FIELD_LABELS_ZH[key]).join("、"),
      );
    }

    const result = await upsertBuyer(pool, {
      userId: auth.userId,
      fields: {
        org_name: orgName,
        buyer_role: buyerRole || undefined,
        country: country || undefined,
        country_code: pick(["countryCode", "country_code"], existing?.country_code) || undefined,
        reg_no: regNo || undefined,
        tax_no: body.taxNo,
        website: body.website,
        official_email: officialEmail || undefined,
        official_phone: body.officialPhone,
        external_rules: body.externalRules,
        ...(body.licenseFileKey !== undefined || body.license_file_key !== undefined
          ? { license_file_key: body.licenseFileKey ?? body.license_file_key }
          : {}),
        ...(body.licenseFileHash !== undefined || body.license_file_hash !== undefined
          ? { license_file_hash: body.licenseFileHash ?? body.license_file_hash }
          : {}),
        ...(body.agentAuthFileKey !== undefined ? { agent_auth_file_key: body.agentAuthFileKey } : {}),
        ...(body.agentAuthFileHash !== undefined ? { agent_auth_file_hash: body.agentAuthFileHash } : {}),
        ...(body.authContactName !== undefined ? { auth_contact_name: authContactName } : {}),
        ...(body.authContactPhone !== undefined ? { auth_contact_phone: body.authContactPhone } : {}),
        ...(body.authContactEmail !== undefined ? { auth_contact_email: body.authContactEmail } : {}),
      },
    });
    const row = await getBuyerByUserId(pool, auth.userId);
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
