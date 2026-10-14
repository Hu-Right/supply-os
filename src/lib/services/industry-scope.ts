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
 *              2026-10-11 backbone 化（本轮实测驱动的两个修正）：
 *              1. **口径从「十个字母容器」改成「32 品目大类」**。旧实现比的是旧字典 level=1 行 id，
 *                 而那一层实测就是 A..J 十个容器（temp/probe77）：user=1 认 UGT-G-25、user=10 认
 *                 UGT-G-17，两人 level1_id 都是 109（容器 J），旧口径下两人可见内容完全相同（各
 *                 40,171 条）⇒ 选了哪个大类对限定毫无作用。现在只认 prefs.group_code。
 *              2. **公告侧不再 JOIN 桥表**。改读宽表 backbone_path（主键点查）：桥表 notice_id 是
 *                 外部编号，与另一公告的内部 id 实测有 21,524 行撞号，旧实现靠主表中转绕开，
 *                 现在根本不碰桥表，从源头消除这一类误判。
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
import { l1NodesOfGroup } from "./commodity/tree";
import { fromBackbonePathColumn } from "./commodity/backbone-path";

export interface IndustryScope {
  /** true = 该用户的可见范围必须限定在 groupNodes 之内 */
  scoped: boolean;
  /** 绑定的品目大类码（crm_user_industry_prefs.group_code）；未绑恒 null */
  groupCode: string | null;
  /** 该大类的 L1 节点码（可能多个）：检索谓词与公告命中的直接输入；未绑恒 [] */
  groupNodes: string[];
  /** 被限档位但未绑行业：本次不限，前端应引导完善注册行业 */
  needsIndustry: boolean;
}

const UNSCOPED: IndustryScope = { scoped: false, groupCode: null, groupNodes: [], needsIndustry: false };

/**
 * 判定用户的行业范围。判定链（任一不满足即不限）：
 * 已登录 → 有生效套餐 → 套餐无全类目旁路 → 套餐声明行业限定 → 已绑品目大类码。
 *
 * 大类码挂不上 L1 节点时（常量与库分叉，门禁 BB12 断言不该发生）：**仍然算已限定且 nodes=[]**。
 * 消费方必须因此给空结果而不是放开全部 —— 宁可可见量错到 0 让人立刻发现，
 * 也不能静默扩权（那等于付费用户的行业边界消失）。查库失败不写缓存，下一请求会重试。
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
  const groupCode = profile?.groupCode ?? null;
  if (!groupCode) return { scoped: false, groupCode: null, groupNodes: [], needsIndustry: true }; // 未绑行业：暂不限+引导
  const groupNodes = await l1NodesOfGroup(pool, groupCode);
  if (groupNodes.length === 0) {
    console.warn(`[industry-scope] user=${userId} 绑的大类 ${groupCode} 挂不上任何 L1 节点 ⇒ 本轮按空结果处理（不放开全量）`);
  }
  return { scoped: true, groupCode, groupNodes, needsIndustry: false };
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
 * `fromBackbonePathColumn`），不再 JOIN 桥表。除口径升级外，这一改动顺带消灭旧实现的一类
 * 隐患：桥表 `notice_id` 存的是主表**外部编号**，而调用方（/notices/[id]/{detail,content,unlock}
 * 与参考号快速路径）手里拿的是**内部自增 id**，实测有 21,524 个公告存在「外部编号 =
 * 另一公告内部 id」的撞号，旧实现必须靠主表中转才不会把别人的类目当本公告判定。
 * 宽表 `ns.id` 与主表内部 id 同域（BB7 逐行核对），点查即终点。
 *
 * 用的是 `backbone_path`（全量派生）而不是 `precise_backbone_path`（人工审核候选码派生）：
 * 墙是数据口径，不该依赖人工审核状态 —— 与旧实现取 levelN_id（fixed）而非 precise_levelN 同理。
 *
 * `groupNodes` 为空（大类挂不上 L1，门禁 BB12 断言不该发生）时 inCategory 恒 false，
 * 即**不放开**：调用方据此收窄，而不是当成「没限定」。
 */
export async function checkNoticeCategory(
  pool: Pool, noticeDbId: number, groupNodes: readonly string[],
): Promise<NoticeCategoryCheck> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT backbone_path AS p FROM crm_notice_search WHERE id = ? LIMIT 1`,
    [noticeDbId],
  );
  const nodes = fromBackbonePathColumn(rows[0]?.p);
  const wall = new Set(groupNodes);
  return {
    hasCategoryData: nodes.length > 0,
    inCategory: nodes.some((n) => wall.has(n)),
  };
}

/** 公告是否属于指定大类的 L1 节点（入参为主表内部 id；无类目数据返回 false，放行语义由 canAccessNotice 承担）。 */
export async function noticeInCategory(pool: Pool, noticeDbId: number, groupNodes: readonly string[]): Promise<boolean> {
  return (await checkNoticeCategory(pool, noticeDbId, groupNodes)).inCategory;
}

/**
 * 商机是否属于指定品目大类。
 *
 * 小表剥离（2026-10-14）：不再读商机桥表（`crm_bid_opportunity_unspsc_codes`，
 * UNSPSC 原始码本身大量失真）。商机经关联公告（source_notice_id → 主表 → 宽表
 * backbone_path）取 UGT 节点，与公告侧**同一份归属口径**；大类命中用
 * `l1NodesOfGroup`（10 分钟缓存，与可见性执法共用一份）。
 *
 * 与公告侧**有意相同**的一处沿用：无类目数据返回 false（拒绝解锁），不像公告详情
 * 「无类目放行」。解锁是扣配额的付费动作，判不准时宁可让用户少解锁一个，
 * 也不能让他解锁到订阅行业外。关联公告缺归属是数据缺口（等 AI 归属管道消化），
 * 不是判定 bug。
 */
export async function opportunityInCategory(pool: Pool, opportunityId: number, groupCode: string | null): Promise<boolean> {
  if (!groupCode) return false;
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
  const l1 = await l1NodesOfGroup(pool, groupCode);
  if (l1.length === 0) return false;
  const wall = new Set(l1);
  return nodes.some((node) => wall.has(node));
}

/**
 * 详情/正文/解锁入口的统一守门：用户被行业墙限定且公告不在其大类内 → false。
 * 未登录/未被墙/公告无类目数据一律放行（避免脏数据把整站锁死）。
 * 注意「被墙但大类挂不上 L1」不在放行之列：那时 groupNodes=[] ⇒ 有码公告全部判 false。
 */
export async function canAccessNotice(
  pool: Pool,
  catalog: BenefitSystemRepo,
  userId: number | null | undefined,
  noticeId: number,
): Promise<boolean> {
  const scope = await resolveIndustryScope(pool, catalog, userId);
  if (!scope.scoped) return true;
  const { hasCategoryData, inCategory } = await checkNoticeCategory(pool, noticeId, scope.groupNodes);
  if (!hasCategoryData) return true; // 公告本身无码：按可见处理，不把整站锁死
  return inCategory;
}
