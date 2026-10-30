/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Supplier } from "../types/supplier";
import type { SupplierDirectoryRow } from "../repos/suppliers";
import type { SupplierIndustryInfo } from "./industry-labels";
import { maskPhone, maskEmail, splitListField } from "../utils/mask";
import { primaryCountryOf } from "./country/resolve";
import { loadCountryAliasSnapshot, type CountryAliasSnapshot } from "./country/alias-store";
import { loadSupplierIndustryInfo } from "./industry-labels";
import { getContext } from "../db/context";

// ── 资料完整度 ─
// 统一口径：直接取 supplier.data_quality_score（DB 生成列，20 字段非空各计 5 分），
// 与后台管理端展示完全一致；此前应用层 12 字段加权算法已废弃删除。

/** DB decimal 列读出可能是字符串，统一转 0-100 数值 */
function readQualityScore(row: SupplierDirectoryRow): number {
  const n = Number(row?.data_quality_score);
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) : 0;
}

/** business_type_code → 卡片类型徽章：仅 manufacturer/trader 有真实标签，其余留白（宁缺毋滥，不再用国内外猜测兜底） */
const COMPANY_TYPE_BY_CODE: Partial<Record<string, "factory" | "trader">> = {
  manufacturer: "factory",
  trader: "trader",
};

/**
 *  supplier 行 → 前端 Supplier DTO 映射与联系方式脱敏
 *
 * @param industry 行业面视图（lib/services/industry-labels 批量装配）。给了且能解析到节点
 *                 就把行业展示从「自填文本」升级为「权威树标签 + 双语名」；不给/解析不到
 *                 则回落到主营产品首项（industry 自由文本列已于 2026-10-15 退役）。
 *
 * 名字里的 `ViewOf` 是命名红线② 的约定后缀（与 toNoticeView / awardViewOf / engineeringItemViewOf 同族）：
 * 规则二靠它认出「该出口已经过视图」。旧名 mapSupplierRow 不是不好，而是静态面看不见它，
 * 于是两个供应商端点一直占着整块透出登记位。
 */
export function supplierViewOf(
  row: SupplierDirectoryRow,
  industry?: SupplierIndustryInfo | null,
  snap?: CountryAliasSnapshot,
): Supplier {
  const industryText = splitListField(row.products)[0] || "其他";
  const standard = industry?.primary ?? null;
  // 有标准标签 → 中英文名各取一侧（英文是 ISIC 官方名）；无 → 两列同原文（旧行为）
  const industryZh = standard ? standard.nameZh : industryText;
  const industryEn = standard ? standard.nameEn : industryText;
  const productsZh = splitListField(row.products);
  const cityZh = String(row.city || "").trim() || String(row.province || "").trim() || "—";
  const companyName = String(row.company || "").trim();
  // supplier.business_type 存经营类型（如 foreign），国内/国际改由 country_code 判定（与目录筛选一致）
  const isInternational = Boolean(row.country_code) && row.country_code !== "CN";
  const countryRaw = String(row.country || "").trim();
  const countryKey = countryRaw || "China";
  // 国家展示走表（country_aliases）：命中取 name_i18n.zh + canonical，未命中回原值（无静态字典兼底）。
  const centry = snap ? primaryCountryOf(countryKey, snap) : undefined;
  return {
    id: `sup-db-${row.id}`,
    nameZh: companyName,
    nameEn: companyName, // 公司名保留真实原文，不翻译
    type: isInternational ? "international" : "domestic",
    industryZh,
    industryEn,
    industryCode: standard?.code,
    industryText,
    industryPathZh: standard ? industry?.pathZh : undefined,
    industryPathEn: standard ? industry?.pathEn : undefined,
    industryTags: standard ? industry?.tags : undefined,
    // supplier.country 展示统一走表解析（与归一同一入口）
    countryZh: centry?.zh || centry?.canonical || countryKey,
    countryEn: centry?.canonical || countryKey,
    cityZh,
    cityEn: cityZh,
    mainProductsZh: productsZh,
    mainProductsEn: productsZh,
    complianceLabelsZh: row.certification ? splitListField(row.certification) : [],
    complianceLabelsEn: row.certification ? splitListField(row.certification) : [],
    companyType: COMPANY_TYPE_BY_CODE[row.business_type_code ?? ""],
    contactPerson: row.contact || "",
    contactEmail: maskEmail(row.email),
    contactPhone: maskPhone(row.phone),
    status: "approved",
    dataCompleteness: readQualityScore(row),
  };
}

// ── 分页目录取数 + 视图装配（服务端单一口径）──

/** 批量映射：原始 DB 行 → 前端 Supplier DTO（column→field 转换 + 脱敏 + 行业面标签）。
 *  名字沿用 to*View 约定（命名红线②）：出口处自己看得出「已经过视图」。
 *  字典层任一路失败只降级为原文展示，不阻断目录可用性。 */
export async function toSupplierListView(
  rows: SupplierDirectoryRow[],
  industryRepo: import("../repos/industry-node.repo").IndustryNodeRepo,
): Promise<Supplier[]> {
  const industryById = new Map<number, SupplierIndustryInfo>();
  try {
    for (const [k, v] of await loadSupplierIndustryInfo(industryRepo, rows)) industryById.set(k, v);
  } catch (err) {
    // 字典层故障必须报出来（否则整站默默退回旧文本而无人知道），但不阻断目录
    console.error("[suppliers] 行业面标签装配失败，本次退回自填文本:", err);
  }
  let snap: CountryAliasSnapshot | undefined;
  try {
    snap = await loadCountryAliasSnapshot(getContext().dbPool);
  } catch (err) {
    // 表快照拉不到 → 本次退回原文（不阻断目录）；展示仍不回落静态字典
    console.error("[suppliers] 国家展示快照加载失败，本次退回原文:", err);
  }
  return rows.map((row) => supplierViewOf(row, industryById.get(Number(row.id)) ?? null, snap));
}

export interface SupplierDirectoryPageOptions {
  page: number;
  pageSize: number;
  /** 排序键：只透传键名，表达式由 repo 白名单给出（用户输入永不进 ORDER BY） */
  sort?: string;
  search?: string;
  industryCode?: string;
  industryCodes?: string[];
}

/**
 * 分页供应商目录（repo 取数 → Supplier DTO 视图）。
 * /api/suppliers 分页分支与首页快照（home-snapshot content 段）共用，保证两个出口零漂移。
 */
export async function listSupplierDirectoryPage(
  opts: SupplierDirectoryPageOptions,
): Promise<{ items: Supplier[]; total: number; page: number; pageSize: number }> {
  const ctx = getContext();
  const { directoryRepo, industryRepo } = ctx.supplier;
  const offset = (opts.page - 1) * opts.pageSize;
  const { items, total } = await directoryRepo.listDirectoryPaginated({
    limit: opts.pageSize,
    offset,
    search: opts.search,
    sort: opts.sort,
    industryCode: opts.industryCode,
    industryCodes: opts.industryCodes,
  });
  return {
    items: await toSupplierListView(items, industryRepo),
    total,
    page: opts.page,
    pageSize: opts.pageSize,
  };
}

