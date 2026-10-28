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

/** 六卡 + 权益矩阵：cells 的键是套餐码，逐格转视图但不动键 */
export function comparisonViewOf(table: ComparisonTable): ComparisonView {
  return {
    plans: plansViewOf(table.plans),
    rows: table.rows.map((r) => ({
      benefit: benefitDefViewOf(r.benefit),
      cells: Object.fromEntries(
        Object.entries(r.cells).map(([planCode, cell]) => [planCode, flatView<ResolvedCellView>(cell)]),
      ),
    })),
  };
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
