/**
 * 会员数据加载 Hook
 * Membership Data Loading Hook
 *
 * @module features/membership/hooks/useMembershipData
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/core/auth";
import { fetchPlans, fetchMembershipStatus } from "../api";
import type { MembershipPlan, MembershipStatus } from "@/types";

export interface UseMembershipDataReturn {
  plans: MembershipPlan[];
  membership: MembershipStatus | null;
  loading: boolean;
  error: string | null;
  freeRemaining: number;
  freeQuota: number;
}

export function useMembershipData(): UseMembershipDataReturn {
  const { authUser } = useAuth();
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [membership, setMembership] = useState<MembershipStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    Promise.all([
      fetchPlans(),
      authUser ? fetchMembershipStatus(authUser.user_key).catch(() => null) : Promise.resolve(null),
    ])
      .then(([fetchedPlans, status]) => {
        if (!alive) return;
        const paidPlans = Array.isArray(fetchedPlans)
          ? fetchedPlans.filter((p) => p.plan_type !== "free")
          : [];
        setPlans(paidPlans);
        setMembership(status);
        setError(null);
      })
      .catch(() => {
        if (alive) {
          setError("套餐数据加载失败，请稍后重试");
          setPlans([]);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [authUser]);

  return {
    plans,
    membership,
    loading,
    error,
    freeRemaining: membership?.free_remaining ?? 3,
    freeQuota: membership?.free_quota ?? 3,
  };
}
