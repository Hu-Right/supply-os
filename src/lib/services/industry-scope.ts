/**
 * 行业可见性范围 — 归属判定与单条命中检查
 * Industry Scope Wall
 *
 * @module lib/services/industry-scope
 * @description 落地「8,800元/行业」口径（2026-09-29）：企业年度会员（industry_scoped=1 的档位）
 *              只能浏览其绑定品目大类下的公告。
 *              全部取值由权益矩阵驱动，无套餐码硬编码：
 *              - 哪些档被限 → crm_plan_benefits 的 industry_scoped 格（当前仅 business=1）；
 *              - 谁看全量   → all_category_access 格（internal_demo=1，演示/内部档旁路）。
 *
 *              2026-10-11 backbone 化：公告侧不再 JOIN 桥表，改读宽表 backbone_path（主键点查）；
 *              口径从旧字典 level=1 行 id 改成骨架节点码。
 *
 *              2026-10-15 G 码退役：大类身份 = L1 树码本身（UGT-01…UGT-32），由偏好的
 *              commodity_code 前缀纯切片推导（l1CodeOfNode，BB1 不变量），不再查偏好表
 *              group_code 列、不再经 l1NodesOfGroup 翻译。墙谓词输入（L1 节点码）不变，
 *              付费用户可见范围与 G 码时代一一等价。
 *
 *              口径（2026-09-29 与业务确认，本批只换实现不改语义）：
 *              - 匿名访客不限；
 *              - 被限档位未绑行业 → 暂不限 + 引导选行业（needsIndustry=true 供前端提示）；
 *              - 执法点：统一检索强制大类节点码（filter-builder）+
 *                详情/正文/解锁入口的类目命中检查（本模块 canAccessNotice）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { BenefitSystemRepo } from "../repos/benefit-system.repo";
import { INDUSTRY_SCOPED_BENEFIT, ALL_CATEGORY_ACCESS_BENEFIT } from "./benefit-matrix";
import { resolveUserIndustryProfile } from "./industry-profile/resolve";
import { fromBackbonePathColumn } from "./commodity/backbone-path";
import { l1CodeOfNode } from "./commodity/tree";

export interface IndustryScope {
  /** true = 该用户的可见范围必须限定在 l1Nodes 之内 */
  scoped: boolean;
  /** 绑定的所属大类（L1 树码，由偏好 commodity_code 前缀推导）；未绑恒 null */
  l1Code: string | null;
  /** 该大类的 L1 节点码集（当前恰一个，保集合形状与检索/公告命中共用）：未绑恒 [] */
  l1Nodes: string[];
  /** 被限档位但未绑行业：本次不限，前端应引导完善注册行业 */
  needsIndustry: boolean;
}

const UNSCOPED: IndustryScope = { scoped: false, l1Code: null, l1Nodes: [], needsIndustry: false };

/**
 * 判定用户的行业范围。判定链（任一不满足即不限）：
 * 已登录 → 有生效套餐 → 套餐无全类目旁路 → 套餐声明行业限定 → 已绑品目节点码。
 *
 * 绑定的码推不出合法 L1（形制非法等脏数据，门禁 BB12 断言不该发生）：**仍然算已限定且 l1Nodes=[]**。
 * 消费方必须因此给空结果而不是放开全部 —— 宁可可见量错到 0 让人立刻发现，
 * 也不能静默扩权（那等于付费用户的行业边界消失）。
 */
export async function resolveIndustryScope(
  pool: Pool,
  catalog: BenefitSystemRepo,
  userId: number | null | undefined,
): Promise<IndustryScope> {
  if (!userId) return UNSCOPED; // 匿名不限
  const plan = await catalog.findActivePlanForUser(userId);
  if (!plan) return UNSCOPED; // 无生效订阅 = 普通用户，全量
  if (await catalog.isEntitled(userId, ALL_CATEGORY_ACCESS_BENEFIT)) return UNSCOPED; // 演示/内部档旁路
  if (!(await catalog.isEntitled(userId, INDUSTRY_SCOPED_BENEFIT))) return UNSCOPED; // 档位未声明行业限定
  const profile = await resolveUserIndustryProfile(pool, userId);
  if (!profile) return { scoped: false, l1Code: null, l1Nodes: [], needsIndustry: true }; // 未绑行业：暂不限+引导
  const l1Code = l1CodeOfNode(profile.commodityCode);
  if (!l1Code) {
    console.warn(`[industry-scope] user=${userId} 的偏好码 ${profile.commodityCode} 推导不出 L1 大类码 ⇒ 本轮按空结果处理（不放开全量）`);
    return { scoped: true, l1Code: null, l1Nodes: [], needsIndustry: false };
  }
  return { scoped: true, l1Code, l1Nodes: [l1Code], needsIndustry: false };
}

/** 公告类目命中情况：有无类目数据、是否命中绑定的大类 */
export interface NoticeCategoryCheck {
  /** 该公告在宽表 backbone_path 里是否有任何节点（无节点 = 无类目数据） */
  hasCategoryData: boolean;
  /** 公告的祖先链是否含目标大类的 L1 节点 */
  inCategory: boolean;
}

/**
 * 公告与大类的命中检查（一次点查同时给出「有无类目数据」与「是否命中」）。
 *
 * 2026-10-11 backbone 化：读 `crm_notice_search.backbone_path`（列值解析只走
 * `fromBackbonePathColumn`），不再 JOIN 桥表。宽表 `ns.id` 与主表内部 id 同域
 * （BB7 逐行核对），点查即终点。
 *
 * 用的是 `backbone_path`（全量派生）而不是 `precise_backbone_path`（人工审核候选码派生）：
 * 墙是数据口径，不该依赖人工审核状态。
 *
 * `l1Nodes` 为空（推导不出大类，门禁 BB12 断言不该发生）时 inCategory 恒 false，
 * 即**不放开**：调用方据此收窄，而不是当成「没限定」。
 */
export async function checkNoticeCategory(
  pool: Pool, noticeDbId: number, l1Nodes: readonly string[],
): Promise<NoticeCategoryCheck> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT backbone_path AS p FROM crm_notice_search WHERE id = ? LIMIT 1`,
    [noticeDbId],
  );
  const nodes = fromBackbonePathColumn(rows[0]?.p);
  const wall = new Set(l1Nodes);
  return {
    hasCategoryData: nodes.length > 0,
    inCategory: nodes.some((n) => wall.has(n)),
  };
}

/** 公告是否属于指定大类的 L1 节点（入参为主表内部 id；无类目数据返回 false，放行语义由 canAccessNotice 承担）。 */
export async function noticeInCategory(pool: Pool, noticeDbId: number, l1Nodes: readonly string[]): Promise<boolean> {
  return (await checkNoticeCategory(pool, noticeDbId, l1Nodes)).inCategory;
}

/**
 * 商机是否属于指定品目大类。
 *
 * 小表剥离（2026-10-14）：不再读商机桥表（旧商机桥表，旧品类码本身大量失真）。
 * 商机经关联公告（source_notice_id → 主表 → 宽表 backbone_path）取 UGT 节点，
 * 与公告侧**同一份归属口径**。
 *
 * 与公告侧**有意相同**的一处沿用：无类目数据返回 false（拒绝解锁），不像公告详情
 * 「无类目放行」。解锁是扣配额的付费动作，判不准时宁可让用户少解锁一个，
 * 也不能让他解锁到订阅行业外。关联公告缺归属是数据缺口（等 AI 归属管道消化），
 * 不是判定 bug。
 */
export async function opportunityInCategory(pool: Pool, opportunityId: number, l1Code: string | null): Promise<boolean> {
  if (!l1Code) return false;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ns.backbone_path AS p
       FROM crm_bid_opportunities o
       JOIN crm_bid_notices n ON n.notice_id = o.source_notice_id
       JOIN crm_notice_search ns ON ns.id = n.id
      WHERE o.id = ? LIMIT 1`,
    [opportunityId],
  );
  const nodes = fromBackbonePathColumn(rows[0]?.p);
  if (nodes.length === 0) return false;
  return nodes.includes(l1Code);
}

/**
 * 详情/正文/解锁入口的统一守门：用户被行业墙限定且公告不在其大类内 → false。
 * 未登录/未被墙/公告无类目数据一律放行（避免脏数据把整站锁死）。
 * 注意「被墙但推导不出大类」不在放行之列：那时 l1Nodes=[] ⇒ 有码公告全部判 false。
 */
export async function canAccessNotice(
  pool: Pool,
  catalog: BenefitSystemRepo,
  userId: number | null | undefined,
  noticeId: number,
): Promise<boolean> {
  const scope = await resolveIndustryScope(pool, catalog, userId);
  if (!scope.scoped) return true;
  const { hasCategoryData, inCategory } = await checkNoticeCategory(pool, noticeId, scope.l1Nodes);
  if (!hasCategoryData) return true; // 公告本身无码：按可见处理，不把整站锁死
  return inCategory;
}
