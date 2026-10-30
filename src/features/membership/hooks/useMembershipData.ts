/**
 * 会员数据加载 Hook（新权益体系）
 * Membership Data Loading Hook
 *
 * @module features/membership/hooks/useMembershipData
 * @description 拉取服务端解析好的对比矩阵（commercial_tier 归组后的档位列 + 逐格权益）与当前会员状态；
 *              派生升级判断所需的当前订阅 code/price 与剩余解锁次数。
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/core/auth";
import { fetchMembershipPlans, fetchMembershipStatus, fetchAnnualPlanCredit } from "@/core/api/membership";
import { unlockRemaining } from "@/shared/utils/membership-view";
import type {
  AnnualCreditView, ComparisonView, MembershipStatusView, TieredPlanView, UpgradeCreditWindowView,
} from "@/types";

export interface UseMembershipDataOptions {
  /** RSC 直出的对比矩阵初值（page.tsx 服务端取数）。提供时跳过 plans 拉取，只补登录态数据 */
  initialComparison?: ComparisonView | null;
}

export interface UseMembershipDataReturn {
  /** 档位代表行（对比矩阵 plans 列，服务端已按 commercial_tier 归组并排除 free，行内携带 periods 周期子行） */
  plans: TieredPlanView[];
  /** 完整对比矩阵（各卡按 plan code 取自身列渲染权益 chip） */
  comparison: ComparisonView | null;
  membership: MembershipStatusView | null;
  loading: boolean;
  error: string | null;
  /** 总可用解锁次数（额度账本 notice_view 池，"不限"归一为 UNLIMITED_QUOTA=-1） */
  totalRemaining: number;
  /** 当前有效订阅套餐 code（无订阅 = null，升级判断依据） */
  currentPlanCode: string | null;
  /** 当前有效订阅套餐价格（升级差价计算依据） */
  currentPlanPrice: number | null;
  /** 当前生效套餐名称（含普通用户 free 档） */
  currentPlanName: string | null;
  /** 升级全额抵扣窗口（服务端下发；当前档无窗口承诺时为 null） */
  upgradeCredit: UpgradeCreditWindowView | null;
  /** 可用的年包抵扣单（文档「199 升级年包可全额抵扣」；无则 null） */
  annualCredit: AnnualCreditView | null;
}

export function useMembershipData(options?: UseMembershipDataOptions): UseMembershipDataReturn {
  const { authUser } = useAuth();
  // RSC 初值：套餐矩阵是公开数据且与登录态无关（/api/membership/plans 两种身份同表），
  // 有初值就不再拉 plans——首屏直出，后续目录变更由 ISR revalidate 兜底
  const hasInitial = options?.initialComparison != null;
  const [plans, setPlans] = useState<TieredPlanView[]>(hasInitial ? options!.initialComparison!.plans : []);
  const [comparison, setComparison] = useState<ComparisonView | null>(options?.initialComparison ?? null);
  const [membership, setMembership] = useState<MembershipStatusView | null>(null);
  const [annualCredit, setAnnualCredit] = useState<AnnualCreditView | null>(null);
  const [loading, setLoading] = useState(!hasInitial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    Promise.all([
      // 登录态强制跳过缓存：确保拿到与当前身份一致的视图（V2）
      hasInitial ? Promise.resolve(null) : fetchMembershipPlans(Boolean(authUser)),
      // SSOT 修复：走 apiCached 与 useMembershipTier 共享同一份缓存，
      // 避免 MembershipPage 与 AppHeader 各发一次 /api/membership/status
      authUser ? fetchMembershipStatus(true).catch(() => null) : Promise.resolve(null),
      // 年包抵扣单：只用于把年付卡展示价与真实应付对齐，定价以支付服务端下单时重算为准
      authUser ? fetchAnnualPlanCredit().catch(() => null) : Promise.resolve(null),
    ])
      .then(([table, status, credit]) => {
        if (!alive) return;
        // 有 RSC 初值时不回写 null 覆盖直出内容；无初值且拉取失败才清空进错误态
        if (table) {
          setComparison(table);
          setPlans(Array.isArray(table.plans) ? table.plans : []);
        }
        setMembership(status);
        setAnnualCredit(credit ?? null);
        setError(null);
      })
      .catch(() => {
        if (alive && !hasInitial) {
          setError("套餐数据加载失败，请稍后重试");
          setPlans([]);
          setComparison(null);
          setAnnualCredit(null);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [authUser, hasInitial]);

  // 升级判断以「当前有效订阅」为准；普通用户（无订阅）不进入升级差价路径。
  const hasSubscription = Boolean(membership?.subscription);
  const currentPlanCode = hasSubscription ? membership?.plan.planCode ?? null : null;
  const currentPlanPrice = hasSubscription ? Number(membership?.plan.price) : null;

  return {
    plans,
    comparison,
    membership,
    loading,
    error,
    totalRemaining: unlockRemaining(membership?.quotas),
    currentPlanCode,
    currentPlanPrice,
    currentPlanName: membership?.plan?.nameZh ?? null,
    upgradeCredit: membership?.upgradeCredit ?? null,
    annualCredit,
  };
}
