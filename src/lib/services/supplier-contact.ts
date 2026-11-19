/**
 * 供应商联系方式取值口径：绑定账号优先，供应商表兜底
 *
 * @module lib/services/supplier-contact
 * @description 同一家企业有两套联系人来源：
 *              1) 供应商表 `supplier.contact/phone/email`（爬取/录入的原始档案）；
 *              2) 绑定账号 `users.display_name/phone/email`（企业认领后自己维护的）。
 *              口径：账号有值就用账号（企业自己维护的最新联系方式），账号该字段为空才回退档案。
 *              字段级合并，不做整行取舍——账号只填了电话时，联系人仍用档案里的。
 *              账号昵称（采友_xxxx）是系统生成的，不参与取值。
 */

/** 绑定账号侧的联系人信息（users 表，supplier_link_status='verified'） */
export interface BoundAccountContact {
  displayName: string | null;
  phone: string | null;
  email: string | null;
}

/** 供应商档案侧的联系人信息（supplier 表） */
export interface SupplierContactSource {
  contact?: string | null;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
}

/** 合并后的明文联系方式 */
export interface SupplierContactRaw {
  person: string;
  position: string;
  phone: string;
  email: string;
}

function pick(...values: Array<string | null | undefined>): string {
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

/**
 * 展示/拨号用的手机号：E.164 的中国大陆号码去掉 `+86`
 * （`+8618876733493` → `18876733493`）。其他地区保持原样。
 */
export function displayPhone(raw: string): string {
  const s = String(raw ?? "").trim();
  return /^\+861\d{10}$/.test(s) ? s.slice(3) : s;
}

/** 按字段合并：账号优先、档案兜底 */
export function mergeSupplierContact(
  base: SupplierContactSource,
  account: BoundAccountContact | null | undefined,
): SupplierContactRaw {
  return {
    person: pick(account?.displayName, base.contact),
    position: String(base.position ?? "").trim(),
    phone: displayPhone(pick(account?.phone, base.phone)),
    email: pick(account?.email, base.email),
  };
}