/**
 * 行业可见性墙 — 范围判定与公告类目命中检查
 * Industry Scope Wall
 *
 * @module lib/services/industry-scope
 * @description 落地「8,800元/行业」口径（2026-09-29）：企业年度会员（industry_scoped=1 的档位）
 *              只能浏览其绑定一级类目（crm_user_industry_prefs.level1_id）下的公告。
 *              全部取值由权益矩阵驱动，无套餐码硬编码：
 *              - 哪些档被墙 → crm_plan_benefits 的 industry_scoped 格（当前仅 business=1）；
 *              - 谁看全量   → all_category_access 格（internal_demo=1，演示/内部档旁路）。
 *
 *              口径（2026-09-29 与业务确认）：
 *              - 匿名访客不墙（保住转化漏斗）；
 *              - 被墙档位未绑定行业 → 暂不墙 + 引导选行业（needsIndustry=true 供前端提示）；
 *              - 墙的执法点：统一搜索强制 level1 过滤（filter-builder）+
 *                详情/正文/解锁入口的类目命中检查（本模块 canAccessNotice）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { BenefitSystemRepo } from "../repos/benefit-system.repo";
import { INDUSTRY_SCOPED_BENEFIT, ALL_CATEGORY_ACCESS_BENEFIT } from "./benefit-matrix";
import { resolveUserIndustryProfile } from "./industry-profile/resolve";

export interface IndustryScope {
  /** true = 该用户的公告可见范围必须限定在 level1Id 之内 */
  scoped: boolean;
  /** 命中墙时的一级类目 id（crm_user_industry_prefs.level1_id）；unscoped 恒 null */
  level1Id: number | null;
  /** 被墙档位但未绑定行业：本次不墙，前端应引导完善注册行业 */
  needsIndustry: boolean;
}

const UNSCOPED: IndustryScope = { scoped: false, level1Id: null, needsIndustry: false };

/**
 * 判定用户的行业范围。判定链（任一不满足即不墙）：
 * 已登录 → 有生效套餐 → 套餐无全类目旁路 → 套餐声明行业限定 → 已绑定一级类目。
 */
export async function resolveIndustryScope(
  pool: Pool,
  catalog: BenefitSystemRepo,
  userId: number | null | undefined,
): Promise<IndustryScope> {
  if (!userId) return UNSCOPED; // 匿名不墙
  const plan = await catalog.findActivePlanForUser(userId);
  if (!plan) return UNSCOPED; // 无生效订阅 = 普通用户，全量
  if (await catalog.isEntitled(userId, ALL_CATEGORY_ACCESS_BENEFIT)) return UNSCOPED; // 演示/内部档旁路
  if (!(await catalog.isEntitled(userId, INDUSTRY_SCOPED_BENEFIT))) return UNSCOPED; // 档位未声明行业限定
  const profile = await resolveUserIndustryProfile(pool, userId);
  const level1 = profile?.levelIds?.[0] ?? null;
  if (!level1) return { scoped: false, level1Id: null, needsIndustry: true }; // 未绑行业：暂不墙+引导
  return { scoped: true, level1Id: level1, needsIndustry: false };
}

/** 公告类目命中情况：有无类目数据、是否命中一级类目 */
export interface NoticeCategoryCheck {
  /** 该公告在桥表里是否有任何码行（无码 = 无类目数据） */
  hasCodes: boolean;
  /** 是否命中目标一级类目 */
  inCategory: boolean;
}

/**
 * 公告与一级类目的命中检查（一次查询同时给出「有无类目数据」与「是否命中」）。
 *
 * 编号口径（2026-10-10 修复）：桥表 `notice_id` 存的是主表**外部编号**
 * `crm_bid_notices.notice_id`，而本模块的调用方（/notices/[id]/{detail,content,unlock}
 * 与参考号快速路径）手里拿的是**内部自增 id**，两者不同域。
 * 直接拿内部 id 去匹配桥表会出两类错误：查不到行（误判无类目），或恰好命中
 * 「外部编号等于另一公告内部 id」的行（实测 21,524 个公告存在这种撞号），
 * 把别的公告的类目当本公告判定。故必须先经主表 JOIN 中转，
 * 与 ai-match/unspsc-levels.ts 同一口径。
 *
 * 索引：`n.id` 走主键点查，`b.notice_id` 走 uk_notice_code 最左前缀。
 */
export async function checkNoticeCategory(
  pool: Pool, noticeDbId: number, level1Id: number,
): Promise<NoticeCategoryCheck> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS rows_total, SUM(b.level1_id = ?) AS hit_rows
     FROM crm_bid_notice_unspsc_codes b
     JOIN crm_bid_notices n ON n.notice_id = b.notice_id
     WHERE n.id = ?`,
    [level1Id, noticeDbId],
  );
  const row = rows[0];
  return {
    hasCodes: Number(row?.rows_total ?? 0) > 0,
    inCategory: Number(row?.hit_rows ?? 0) > 0,
  };
}

/** 公告是否属于指定一级类目（入参为主表内部 id；无类目数据返回 false，放行语义由 canAccessNotice 承担）。 */
export async function noticeInCategory(pool: Pool, noticeDbId: number, level1Id: number): Promise<boolean> {
  return (await checkNoticeCategory(pool, noticeDbId, level1Id)).inCategory;
}

/** 商机是否属于指定一级类目（crm_bid_opportunity_unspsc_codes.level1_id 为 VARCHAR）。 */
export async function opportunityInCategory(pool: Pool, opportunityId: number, level1Id: number): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 FROM crm_bid_opportunity_unspsc_codes
      WHERE opportunity_id = ? AND level1_id = ? LIMIT 1`,
    [opportunityId, String(level1Id)],
  );
  return rows.length > 0;
}

/**
 * 详情/正文/解锁入口的统一守门：用户被行业墙限定且公告不在其一级类目内 → false。
 * 未登录/未被墙/无类目数据一律放行（无类目数据的公告按可见处理，避免脏数据把整站锁死）。
 */
export async function canAccessNotice(
  pool: Pool,
  catalog: BenefitSystemRepo,
  userId: number | null | undefined,
  noticeId: number,
): Promise<boolean> {
  const scope = await resolveIndustryScope(pool, catalog, userId);
  if (!scope.scoped) return true;
  const { hasCodes, inCategory } = await checkNoticeCategory(pool, noticeId, scope.level1Id!);
  if (!hasCodes) return true; // 公告本身无码：按可见处理，不把整站锁死
  return inCategory;
}
