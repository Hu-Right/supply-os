/**
 * 供应商企业主页视图装配（门户公开面）
 *
 * @module lib/services/supplier-profile
 * @description /supplier/[id] 的单一装配入口：把 supplier 行 + 行业树标签 + 国家别名快照
 *              装配成页面直接可渲染的公开视图。
 *
 *              披露纪律（与供应商详情 API 同源）：
 *              - 联系方式只下发脱敏值，明文仅 VIP 走 /api/suppliers/[id]/contact；
 *              - 营业执照只暴露「已上传」标志，不下发文件 URL；
 *              - 信用代码脱敏为「前 4 + **** + 后 4」，与列表/推荐口径一致。
 *
 *              数据诚实：字段为空就返回 null/空数组，由页面整段隐藏，禁止渲染占位推导值。
 */
import type { Supplier } from "@/types";
import type { SupplierDirectoryRow, SupplierBackboneInterestRow } from "@/lib/repos/suppliers";
import { maskCreditCode } from "@/lib/repos/suppliers/supplier-directory.repo";
import { maskEmail, maskPhone, splitListField } from "@/lib/utils/mask";
import type { CountryAliasSnapshot } from "./country/alias-store";
import { primaryCountryOf } from "./country/resolve";
import { mergeSupplierContact, type BoundAccountContact } from "./supplier-contact";
import type { SupplierIndustryInfo } from "./industry-labels";
import { supplierViewOf } from "./suppliers";

/** 注册标识类型 → 中文释义（信用代码脱敏后仍需让用户知道这是哪类号码） */
const CREDIT_CODE_TYPE_LABEL: Record<string, string> = {
  uscc: "统一社会信用代码",
  hk_br: "香港商业登记号",
  hk_cr: "香港公司注册号",
  overseas_reg: "海外注册号",
  tax_id: "税号",
  other: "注册号",
};

const CURRENCY_LABEL: Record<string, string> = {
  CNY: "人民币",
  USD: "美元",
  EUR: "欧元",
  HKD: "港元",
  GBP: "英镑",
  JPY: "日元",
};

export interface SupplierCommodityInterest {
  code: string;
  nameZh: string;
  nameEn: string;
  level: number;
  confidence: number | null;
  isPrimary: boolean;
  /** L2 大类名（前端按它分组；节点缺失时回退品目名） */
  categoryZh: string;
  categoryEn: string;
}

/** `激光切割机 (Laser cutting machine)` → { zh, en }；无括号时两侧同原文 */
function splitBilingual(raw: string): { zh: string; en: string } {
  const text = String(raw ?? "").trim();
  const m = text.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (!m) return { zh: text, en: text };
  return { zh: m[1].trim() || text, en: m[2].trim() || text };
}

function toCommodityInterest(row: SupplierBackboneInterestRow): SupplierCommodityInterest | null {
  const code = String(row.code ?? "").trim();
  if (!code) return null;
  const name = splitBilingual(row.name);
  const categoryZh = String(row.l2_name_zh ?? "").trim() || name.zh;
  const categoryEn = String(row.l2_name_en ?? "").trim() || name.en;
  const confidence = row.confidence == null ? null : Number(row.confidence);
  return {
    code,
    nameZh: name.zh,
    nameEn: name.en,
    level: Number(row.level) || 0,
    confidence: Number.isFinite(confidence) ? confidence : null,
    isPrimary: Number(row.is_primary) === 1,
    categoryZh,
    categoryEn,
  };
}

export interface SupplierProfileView {
  /** 给客户端交互（联系弹窗/认领）复用的既有 DTO（联系方式已脱敏） */
  supplier: Supplier;
  dbId: number;
  company: string;
  type: "domestic" | "international";
  /** ISO2 国别码（相似供应商/结构化数据用；空串表示未提供） */
  countryCode: string;
  country: string;
  province: string;
  city: string;
  address: string;
  industry: {
    primary: { code: string; nameZh: string; nameEn: string } | null;
    path: string[];
    pathEn: string[];
    tags: Array<{ code: string; nameZh: string; nameEn: string }>;
  };
  products: string[];
  /** 主营产品原文（用户输入什么就展示什么；保留换行/标点，不拆 chip） */
  productsText: string;
  /** 平台归类（supplier_backbone_interests）：与自由文本产品互补，用于筛选/撮合，不替代原文 */
  commodityInterests: SupplierCommodityInterest[];
  certifications: string[];
  website: string | null;
  creditCodeMasked: string;
  /** 注册标识原始类型键（uscc/hk_br/...，供 en 文案映射） */
  creditCodeType: string;
  creditCodeTypeLabel: string;
  registeredCapital: string | null;
  establishedAt: string | null;
  legalRepMasked: string;
  verifyStatus: "done" | "unverified";
  reviewed: boolean;
  dataCompleteness: number;
  hasLicense: boolean;
  contact: {
    person: string;
    position: string;
    email: string;
    phone: string;
  };
}

/** 姓名脱敏：保留首字，其余用 * 代替（中英文都适用） */
function maskPersonName(value: unknown): string {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (v.length <= 1) return "*";
  return `${v.slice(0, 1)}${"*".repeat(Math.min(v.length - 1, 2))}`;
}

/** 注册资本：整千分位 + 币种中文名；空值返回 null */
function formatRegisteredCapital(value: unknown, currency: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const num = Number(raw);
  const amount = Number.isFinite(num) ? new Intl.NumberFormat("zh-CN").format(num) : raw;
  const cur = String(currency ?? "").trim().toUpperCase();
  return cur ? `${amount} ${CURRENCY_LABEL[cur] ?? cur}` : amount;
}

/** 成立时间：DATE 或 ISO 字符串统一成 YYYY-MM；解析不了返回 null（不展示乱值） */
function formatEstablishedAt(value: unknown): string | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** 只放行 http(s) 外链，防 javascript: 之类脏数据进 href */
function safeWebsite(value: unknown): string | null {
  const v = String(value ?? "").trim();
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * supplier 行 → 企业主页公开视图
 *
 * @param row        supplier 行（findById / findByIdAnyStatus 的扩展列集）
 * @param industry   行业面标签（失败时传 null，页面退回产品首项作为行业文本）
 * @param snap       国家别名快照（失败时传 undefined，国家回落原文）
 */
export function supplierProfileViewOf(
  row: SupplierDirectoryRow,
  industry?: SupplierIndustryInfo | null,
  snap?: CountryAliasSnapshot,
  interests: SupplierBackboneInterestRow[] = [],
  accountContact?: BoundAccountContact | null,
): SupplierProfileView {
  // 联系方式口径：绑定账号优先，供应商档案兜底（字段级合并）
  const mergedContact = mergeSupplierContact(row, accountContact ?? null);
  const supplier = supplierViewOf(row, industry, snap);
  const company = String(row.company ?? "").trim();
  const countryKey = String(row.country ?? "").trim() || "China";
  const centry = snap ? primaryCountryOf(countryKey, snap) : undefined;
  const country = centry?.zh || centry?.canonical || countryKey;
  // country_code 是更可靠的国内/国际判据；缺失时按国家名回落
  const type: SupplierProfileView["type"] =
    row.country_code ? (row.country_code === "CN" ? "domestic" : "international") : supplier.type;
  const province = String(row.province ?? "").trim();
  const city = String(row.city ?? "").trim();
  const address = [province, city, String(row.address ?? "").trim()]
    .filter((v, i, arr) => v && arr.indexOf(v) === i)
    .join(" · ");

  return {
    supplier,
    dbId: Number(row.id),
    company,
    type,
    countryCode: String(row.country_code ?? ""),
    country,
    province,
    city,
    address,
    industry: {
      primary: industry?.primary
        ? { code: industry.primary.code, nameZh: industry.primary.nameZh, nameEn: industry.primary.nameEn }
        : null,
      path: industry?.pathZh ?? [],
      pathEn: industry?.pathEn ?? [],
      tags: (industry?.tags ?? []).map((t) => ({ code: t.code, nameZh: t.nameZh, nameEn: t.nameEn })),
    },
    products: splitListField(row.products),
    productsText: String(row.products ?? "").trim(),
    commodityInterests: interests
      .map(toCommodityInterest)
      .filter((v): v is SupplierCommodityInterest => v !== null),
    certifications: splitListField(row.certification),
    website: safeWebsite(row.website),
    creditCodeMasked: maskCreditCode(row.credit_code),
    creditCodeType: String(row.credit_code_type ?? "uscc"),
    creditCodeTypeLabel:
      CREDIT_CODE_TYPE_LABEL[String(row.credit_code_type ?? "uscc")] ?? CREDIT_CODE_TYPE_LABEL.other,
    registeredCapital: formatRegisteredCapital(row.registered_capital, row.currency),
    establishedAt: formatEstablishedAt(row.established_at),
    legalRepMasked: maskPersonName(row.legal_rep),
    verifyStatus: row.verify_status === "done" ? "done" : "unverified",
    reviewed: row.info_review_status === "reviewed",
    dataCompleteness: supplier.dataCompleteness ?? 0,
    hasLicense: Boolean(String(row.license_url ?? "").trim()),
    contact: {
      person: maskPersonName(mergedContact.person),
      position: mergedContact.position,
      email: mergedContact.email ? maskEmail(mergedContact.email) : "",
      phone: mergedContact.phone ? maskPhone(mergedContact.phone) : "",
    },
  };
}
