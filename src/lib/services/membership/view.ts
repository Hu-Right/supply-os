/**
 * 会员体系对外视图 mapper —— 命名红线② 在本域的收口点
 *
 * @module lib/services/membership/view
 * @description 五个会员端点（plans / status / services / upgrade-preview / credits）
 *              原先都是 `NextResponse.json(变量)` 整块透出：响应体就是 repo 的行形状
 *              （plan_catalog / plan_subscriptions / benefit_quotas /
 *              service_catalog 的列名）与服务内部结果类型。列名属于存储层，
 *              不是对外契约，本模块把它们收成 camelCase 视图。
 *
 *              行类型（*Row）保留不动：会员状态被 auth 热路径、门控、额度扣减、
 *              支付履约等内部逻辑按列名读，跟着视图一起改会把存储层语义带进
 *              业务代码；改名只发生在这一处出口。
 *
 *              ⚠ 两个「不能递归改名」的地方：
 *              - MembershipStatus.gates 的键是权益码（notice_view …），是数据不是字段名；
 *              - ComparisonTable.rows[].cells 的键是套餐码（free / pro …）。
 *                所以嵌套容器在这里显式转换，避免通用深改名把这两类键也改掉。
 */
import { toCamelKeys } from "@/shared/utils/case-keys";
import type {
  ActivePlanRow,
  BenefitDefRow,
  BenefitDefView,
  ComparisonTable,
  ComparisonView,
  MembershipStatus,
  MembershipStatusView,
  PlanCatalogRow,
  PlanView,
  QuotaBalanceRow,
  QuotaView,
  ResolvedCellView,
  ServiceCatalogRow,
  ServiceCatalogView,
  SubscriptionView,
  TieredPlanView,
  UpgradePreview,
  UpgradePreviewView,
} from "@/types/membership";

/** 平坦行 → 视图：只改顶层键名，值原样透传 */
const flatView = <T>(row: object): T => toCamelKeys(row) as unknown as T;

export const planViewOf = (row: PlanCatalogRow): PlanView => flatView<PlanView>(row);
export const plansViewOf = (rows: readonly PlanCatalogRow[]): PlanView[] => rows.map(planViewOf);

export const subscriptionViewOf = (row: ActivePlanRow | null): SubscriptionView | null =>
  row ? flatView<SubscriptionView>(row) : null;

export const quotaViewOf = (row: QuotaBalanceRow): QuotaView => flatView<QuotaView>(row);
export const quotasViewOf = (rows: readonly QuotaBalanceRow[]): QuotaView[] => rows.map(quotaViewOf);

export const benefitDefViewOf = (row: BenefitDefRow): BenefitDefView => flatView<BenefitDefView>(row);

export const serviceCatalogViewOf = (row: ServiceCatalogRow): ServiceCatalogView =>
  flatView<ServiceCatalogView>(row);
export const serviceCatalogsViewOf = (rows: readonly ServiceCatalogRow[]): ServiceCatalogView[] =>
  rows.map(serviceCatalogViewOf);

/** 年包抵扣单（/api/membership/credits）只有三个字段，由路由直接写 camel 字面量：
 *  静态门禁看得见它，不需要 mapper。 */

/** 官网对比表额外隐藏行（2026-10-28 设计）：history_notice_db 划线砍掉不展示；
 *  只在本视图收口，目录/门控照常下发（resolveGates 不走这里）。 */
const OFFICIAL_TABLE_HIDDEN_BENEFITS: ReadonlySet<string> = new Set(["history_notice_db"]);

/**
 * 「功能未完善」权益清单（2026-10-29 权益再分配 / 模块收敛）：这些模块已按阶梯分配到
 * 企业/人工档（矩阵里已给值，卡片按 ✓ 展示），但功能尚未达到可交付状态。
 *
 * ⚠ 2026-10-29 产品口径：**不在页面展示「即将上线」角标**（先照常展示权益，功能后续补齐）。
 * 本常量保留为 roadmap 元数据（API 仍下发 isComingSoon，供后台/将来的角标或内部报表用），
 * 验收通过后从集合里删掉即可；前端不读取该字段。
 *
 * 2026-10-29 核对后已移出：product_keyword_lib（产品关键词库）——设置页 + 词组 CRUD
 * API + 权益门控早已实现（/settings/keyword-library、/api/user/keyword-groups），
 * 之前只是矩阵全档 0 把它门控死了，分配后企业/人工档应直接可用。
 * 同日模块收敛：bid_nobid / qualification_gap / requirement_matrix 合并为
 * bid_feasibility_report；enterprise_profile 并入 evidence_library；bid_collab、
 * strategy_meeting 下线。
 */
const COMING_SOON_BENEFITS: ReadonlySet<string> = new Set([
  "bid_feasibility_report",
  "joint_bid_match",
  "order_crm",
  "evidence_library",
  "ai_bid_review",
]);

/**
 * 官网对比表视图：按 commercial_tier 归组去重（9 周期行 → 3 档列）。
 *
 * - 归组完全按 commercial_tier 字段驱动，不假设行数：同档 m/q/y 三行 → 一列；
 *   旧目录数据（各档独占 tier）也能渲染，只是退化为每行一列。
 * - 每档取周期最短的在售行做代表（迁移后即 *_m 行）；代表行携带档内全部周期子行
 *   （periods，按周期升序、与代表行同形的完整视图），供定价页按「月/季/年」各渲染一张卡。
 * - 权益格以代表行为准键到代表 plan_code 上（同档三行矩阵值相同；即便脏数据不同也不报错）。
 */
export function tieredComparisonViewOf(table: ComparisonTable): ComparisonView {
  // 归组保持服务端 sort_order 顺序；同档内按周期升序（无周期行排最后）
  const groups = new Map<string, PlanCatalogRow[]>();
  for (const row of table.plans) {
    const bucket = groups.get(row.commercial_tier);
    if (bucket) bucket.push(row);
    else groups.set(row.commercial_tier, [row]);
  }

  const plans: TieredPlanView[] = [];
  for (const [, rows] of groups) {
    const sorted = [...rows].sort((a, b) => {
      const da = a.billing_period_days ?? Number.POSITIVE_INFINITY;
      const db = b.billing_period_days ?? Number.POSITIVE_INFINITY;
      return da - db;
    });
    const rep = sorted[0];
    const repView = planViewOf(rep);
    plans.push({
      ...repView,
      // 完整视图（不裁字段）：周期卡要独立成交，前端不该在 onBuy 路径上做类型断言
      periods: sorted.map(planViewOf),
    });
  }

  const rows = table.rows
    .filter((r) => !OFFICIAL_TABLE_HIDDEN_BENEFITS.has(r.benefit.benefit_code))
    .map((r) => ({
      benefit: {
        ...benefitDefViewOf(r.benefit),
        ...(COMING_SOON_BENEFITS.has(r.benefit.benefit_code) ? { isComingSoon: true } : {}),
      },
      cells: Object.fromEntries(
        plans.map((p) => {
          const cell = r.cells[p.planCode] ?? null;
          return [p.planCode, cell ? flatView<ResolvedCellView>(cell) : null];
        }).filter(([, cell]) => cell != null),
      ),
    }));

  return { plans, rows };
}

/** 会员状态：plan/subscription/quotas 是行，upgrade_credit 是嵌套小对象 */
export function membershipStatusViewOf(status: MembershipStatus): MembershipStatusView {
  return {
    plan: planViewOf(status.plan),
    subscription: subscriptionViewOf(status.subscription),
    quotas: quotasViewOf(status.quotas),
    // gates 的键是权益码（数据），原样透传
    ...(status.gates ? { gates: status.gates } : {}),
    ...(status.upgrade_credit
      ? {
          upgradeCredit: {
            days: status.upgrade_credit.days,
            open: status.upgrade_credit.open,
            deadlineAt: status.upgrade_credit.deadline_at,
          },
        }
      : {}),
  };
}

/** 升级预览：顶层别名机械改名，三个套餐/订阅字段按各自视图转换 */
export function upgradePreviewViewOf(preview: UpgradePreview): UpgradePreviewView {
  return {
    ...(toCamelKeys(preview) as unknown as UpgradePreviewView),
    currentPlan: preview.current_plan ? planViewOf(preview.current_plan) : null,
    targetPlan: preview.target_plan ? planViewOf(preview.target_plan) : null,
    subscription: subscriptionViewOf(preview.subscription),
  };
}
