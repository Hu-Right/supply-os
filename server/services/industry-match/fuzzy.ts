/**
 * 类目推断兜底匹配（Tier 4）
 * Category-inference fallback matching (Tier 4)
 *
 * @module server/services/industry-match/fuzzy
 * @description 当 T0~T3 精确层级结果不足一页时，通过 CatalogRepo.smartInferUnspsc
 *              在 UNSPSC 类目树中推断与用户行业关键词相关的类目，再按推断类目的
 *              code 前缀精确匹配公告标签。
 *
 *              与旧版名称模糊匹配（b.name LIKE）的关键区别：
 *              - 旧版：在公告标签名称中做字符串相似度匹配，跨行业误匹配率高
 *              - 新版：在类目树中定位语义最近的类目节点，按 code 前缀精确召回，
 *                保证结果始终在同一行业分支内
 *
 *              去重保护：推断出的 code 前缀若已被 T0~T3 覆盖（branchPrefix 或
 *              更精确的 levelN_id 等值），则跳过，避免重复查询。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { UserIndustryProfile } from "./types";
import { ACTIVE_NOTICE_WHERE, NOTICE_SELECT_FIELDS, DEADLINE_ORDER } from "./filter";
import { CatalogRepo } from "../../repos/catalog.repo";
import { unspscPrefixFromCode } from "../../services/unspsc";

/** 推断出的兜底匹配分数（低于 T3 码前缀 1 分，高于无匹配） */
const INFERRED_SCORE = 0.5;

/**
 * 基于 UNSPSC 类目推断的兜底匹配。
 *
 * 流程：
 * 1. 用用户行业中文名调用 smartInferUnspsc，在类目树中找到最佳匹配节点
 * 2. 从匹配节点的 code 提取前缀（如 "421412"）
 * 3. 检查该前缀是否已被 T0~T3 覆盖（避免重复查询）
 * 4. 用 code 前缀精确匹配桥接表中的公告标签
 *
 * @returns 与主力查询字段结构一致的公告行（含 match_score），无命中返回空数组
 */
export async function inferNoticesByCategory(
  pool: Pool,
  profile: UserIndustryProfile,
  limit: number,
  locale?: string,
  existingTierPrefixes?: string[],
): Promise<RowDataPacket[]> {
  const title = String(profile.industryTitleZh || "").trim();
  if (!title || limit < 1) return [];

  // Step 1: 在 UNSPSC 类目树中推断与用户行业关键词相关的类目
  const catalogRepo = new CatalogRepo(pool);
  const inferred = await catalogRepo.smartInferUnspsc(title);
  if (!inferred) return [];

  // Step 2: 从推断类目的各级 ID 中找到最深有效节点的 code，提取前缀
  // 优先从最深级（level5）向上查找，确保前缀尽可能精确
  const inferredIds = [
    inferred.level5_id,
    inferred.level4_id,
    inferred.level3_id,
    inferred.level2_id,
    inferred.level1_id,
  ].filter((id): id is number => id != null && id > 0);

  let inferredPrefix = "";
  for (const id of inferredIds) {
    const [codeRows] = await pool.query(
      "SELECT code FROM crm_unspsc_codes WHERE id = ? LIMIT 1",
      [id],
    );
    const codeRow = (codeRows as RowDataPacket[])[0];
    if (codeRow?.code) {
      inferredPrefix = unspscPrefixFromCode(String(codeRow.code));
      break;
    }
  }
  if (!inferredPrefix) return [];

  // Step 3: 去重——推断前缀已被 T0~T3 覆盖时跳过
  // 覆盖判定：推断前缀以某已有前缀开头（如推断 "421412" 被 T3 的 "4214" 覆盖）
  const prefixesToCheck = [
    ...(existingTierPrefixes || []),
    ...(profile.branchPrefix ? [profile.branchPrefix] : []),
  ];
  for (const existing of prefixesToCheck) {
    if (existing && inferredPrefix.startsWith(existing)) return [];
  }

  // Step 4: 按推断 code 前缀精确匹配公告标签
  // 中文环境：从机会表获取 description_cn；其他语言：从翻译表获取译文
  const isZh = locale === "zh";
  const oppJoin = isZh
    ? "LEFT JOIN crm_bid_opportunities opp ON opp.source_notice_id = n.notice_id AND (opp.is_qualified = 1 OR opp.status = 1 OR opp.audit_status = 1)"
    : "";
  const trJoin = locale && !isZh
    ? "LEFT JOIN crm_notice_translations tr ON tr.notice_id = n.id AND tr.lang = ?"
    : "";
  const i18nSelect = isZh
    ? "MAX(opp.description_cn) AS description_cn,"
    : (locale ? "tr.title_tr AS title_i18n, tr.description_tr AS description_i18n," : "");
  const i18nParams = locale && !isZh ? [locale] : [];

  const [result] = await pool.query(
    `SELECT ${NOTICE_SELECT_FIELDS}, ${i18nSelect} ${INFERRED_SCORE} AS match_score
     FROM crm_bid_notices n
     INNER JOIN crm_bid_notice_unspsc_codes b ON b.notice_id = n.notice_id
     ${oppJoin}
     ${trJoin}
     WHERE b.code LIKE ? AND ${ACTIVE_NOTICE_WHERE}
     GROUP BY n.id
     ORDER BY ${DEADLINE_ORDER}
     LIMIT ?`,
    [...i18nParams, `${inferredPrefix}%`, limit],
  );
  return result as RowDataPacket[];
}
