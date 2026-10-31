/**
 * 公告对外视图 mapper —— 命名红线② 的唯一收口点
 *
 * @module lib/services/notice-public/view
 * @description 服务表投影（notice_public / notice_search / notice_deadline）的列名是
 *              snake_case，而列名属于存储层，不是对外契约。本模块把「行」转成「视图」：
 *              键名机械 camelCase 化 + **契约白名单过滤**，值一律原样透传（不改时间格式、
 *              不改数字/字符串类型、不做二次归一）。
 *
 *              两段式设计（2026-10-31 收紧）：
 *              1. 改名仍用机械规则（shared/utils/case-keys），与 awards 等域共用；
 *              2. 出口按 NOTICE_CONTRACT_KEYS 白名单裁剪——键集合 = types/procurement.ts
 *                 的 NoticeItem 契约字段。fail-safe 方向：宽表加列若未登记进契约，**该列不上网**
 *                 （旧行为是自动上网，与"列名属存储层"的红线初衷相悖——真实泄漏案例：buyer_id
 *                 内键多年随载荷出网，双端均无消费方）。
 *
 *              ⚠ 白名单只是兜底裁剪，不替代付费墙裁剪：需要只发部分字段的端点
 *                 （如 /api/notices/:id/preview）必须继续显式列键——description /
 *                 description_cn / contacts / attachments 都在契约内，白名单拦不住它们。
 */
import type { NoticeItem } from "@/types/procurement";
import { toCamelKeys, type RowLike } from "@/shared/utils/case-keys";

/** 行对象：DB 驱动的返回结构（列名 → 值） */
export type NoticeRow = RowLike;

/**
 * 对外契约键白名单（= types/procurement.ts NoticeItem 的字段全集，camel）。
 * 维护规则：契约类型加字段时在这里同步登记（忘登记 = 该字段不上网，方向安全）；
 * 服务表加列但未登记契约 → 自动被裁，恢复"列名不出存储层"的红线本意。
 */
const NOTICE_CONTRACT_KEYS: ReadonlySet<string> = new Set([
  // ── NoticeListItem：服务表列（改名面）──
  "noticePk", "noticeId", "sourceUrl", "reference", "title", "titleCn",
  "description", "descriptionCn", "contentLevel", "industry",
  "publishedTs", "deadlineTs", "deadlineState", "deadlineType", "deadlineTimezone", "timezoneSource",
  "countryCode", "countryCodes", "noticeTypeCode", "platformName",
  "buyerName", "buyerNameCn", "buyerGroup",
  "estimatedValue", "currencyCode", "currencySource",
  "contacts", "attachments", "externalLinks",
  "difficulty", "registrationLevel", "beneficiaryCountries", "updatedAt", "isOpportunity",
  // ── NoticeListItem：接口计算/关联补字段 ──
  "agencyI18n", "titleI18n", "descriptionI18n", "titleEn", "descriptionEn",
  "backbonePath", "entrySource", "coreLocked", "breakdownFileCount", "contactCount",
  "unlockType", "unlockedAt", "matchScore", "matchTier", "recoReasons",
  "descriptionTruncated", "reportAvailable", "reportUrl",
  // ── NoticeDetailFields：解锁详情级补充 ──
  "platform", "supplierConditions", "eligibility", "technicalHurdles",
  "aiProducts", "aiAnalysis", "descriptionOther", "originalDescription",
]);

/**
 * 行 → 视图：机械改名 + 白名单裁剪。
 * @description 白名单之外的通知列（含内部键如 buyer_id）不出网；契约内的值原样透传。
 *              路由在 mapper **之后**追加的计算键（如 platform 对象、门控布尔）不经本过滤。
 */
export function toNoticeView(row: NoticeRow | null | undefined): NoticeItem | null {
  if (!row) return null;
  // 经 unknown 中转：行对象的结构与视图类型不重叠（前者 snake、后者 camel），
  // 而本函数保证的正是“把前者逐键改名为后者”，直接断言会被 tsc 拦下。
  const camel = toCamelKeys(row) as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(camel)) {
    if (NOTICE_CONTRACT_KEYS.has(key)) out[key] = camel[key];
  }
  return out as unknown as NoticeItem;
}

/** 批量：列表端点（unified-search / similar / favorites）用 */
export function toNoticeListView(rows: readonly unknown[]): NoticeItem[] {
  return rows.map((row) => toNoticeView(row as NoticeRow) as NoticeItem);
}
