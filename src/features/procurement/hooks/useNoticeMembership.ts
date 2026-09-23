/**
 * 公告会员配额 Hook（新权益体系）
 * Notice Membership Hook
 *
 * @module features/procurement/hooks/useNoticeMembership
 * @description 会员状态来自服务端 { plan, subscription, quotas }；剩余解锁读额度账本
 *              notice_view 池，付费套餐列表取自服务端对比矩阵（仅 fixed 明码档自助支付）。
 */
import { useCallback, useEffect, useState } from "react";
import type { MembershipStatus, PlanCatalogRow } from "../types";
import { fetchMembershipPlans, fetchMembershipStatus } from "../api";
import { unlockRemaining } from "@/shared/utils/membership-view";

export interface UseNoticeMembershipOptions {
  /** 当前登录用户 id */
  userId: number | undefined;
  /** 是否 VIP（决定解锁类型） */
  isVip: boolean;
}

export interface UseNoticeMembershipReturn {
  membership: MembershipStatus | null;
  paidPlans: PlanCatalogRow[];
  paidRemaining: number;
  canUsePaidQuota: boolean;
  /** 总可用解锁次数（额度账本 notice_view 池） */
  totalRemaining: number;
  refreshMembership: (useCache?: boolean) => Promise<void>;
  /** 懒加载可自助支付的明码套餐列表（返回套餐数组供调用方动态取码/取价） */
  loadPaidPlans: () => Promise<PlanCatalogRow[]>;
}

export function useNoticeMembership({
  userId,
  isVip,
}: UseNoticeMembershipOptions): UseNoticeMembershipReturn {
  const [membership, setMembership] = useState<MembershipStatus | null>(null);
  const [paidPlans, setPaidPlans] = useState<PlanCatalogRow[]>([]);

  const paidRemaining = unlockRemaining(membership?.quotas);
  const canUsePaidQuota = isVip || paidRemaining > 0;

  // 总可用解锁次数 = 额度账本剩余（已与后端门控同源，不再叠加旧"单次卡"）
  const totalRemaining = paidRemaining;

  // P2-2：useCallback 稳定引用，配合下游 openNotice 的 memo 化不击穿 NoticeCard
  const refreshMembership = useCallback(async (useCache = false) => {
    if (!userId) {
      setMembership(null);
      return;
    }
    try {
      // B1 legacy 退役：身份由 JWT 承载，user_key 兜底参数已删除
      const data = await fetchMembershipStatus(useCache);
      setMembership(data);
    } catch {
      setMembership(null);
    }
  }, [userId]);

  // 套餐列表懒加载：仅在用户首次触发付费操作时才请求，避免初始页面加载时多发一个请求；
  // 仅取明码可自助支付的 fixed 档（contact/free 不在采购详情页支付面板展示）
  const loadPaidPlans = useCallback((): Promise<PlanCatalogRow[]> => {
    if (paidPlans.length > 0) return Promise.resolve(paidPlans);
    return fetchMembershipPlans()
      .then((table) => {
        const list = Array.isArray(table?.plans)
          ? table.plans.filter((p) => p.price_mode === "fixed")
          : [];
        setPaidPlans(list);
        return list;
      })
      .catch(() => [] as PlanCatalogRow[]);
  }, [paidPlans]);

  useEffect(() => {
    refreshMembership(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isVip]);

  return {
    membership,
    paidPlans,
    paidRemaining,
    canUsePaidQuota,
    totalRemaining,
    refreshMembership,
    loadPaidPlans,
  };
}
