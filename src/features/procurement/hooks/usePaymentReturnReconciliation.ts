/**
 * 支付回跳对账 Hook
 * Payment Return Reconciliation Hook
 *
 * @module features/procurement/hooks/usePaymentReturnReconciliation
 * @description 支付整页跳回后的对账：?order_no=&trade_no=（公告 id 由独立详情路由自带）。
 *              订单已支付则刷新权益并打开对应公告，未决/失败给出提示；对账完成后清理 URL 参数。
 *              [2026-11-25] 旧版 `?notice_id=` 深链与列表页统一重定向一并移除，不再做兼容。
 */
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { clearApiCache } from "@/core/http";
import { getOrderStatus } from "@/core/payment/payment-facade";
import { ORDER_STATUS } from "@/shared/constants/order-status";

export interface UsePaymentReturnReconciliationOptions {
  refreshMembership: () => Promise<void>;
  openNoticeById: (id: number) => Promise<void>;
  setActionMessage: (message: string) => void;
  userId?: number;
  /** 认证初始化是否完成：未就绪时不得判定为未登录（避免误弹登录框） */
  authReady?: boolean;
}

export function usePaymentReturnReconciliation({
  refreshMembership,
  openNoticeById,
  setActionMessage,
  userId,
  authReady,
}: UsePaymentReturnReconciliationOptions) {
  const { t } = useLocale();
  const router = useRouter();
  // 订单对账幂等：同一 order_no 只跑一次业务（userId 变化会重跑本 effect）
  const reconciledOrderRef = useRef<string | null>(null);

  useEffect(() => {
    // 从 window 读取，避免 useSearchParams 对象每次渲染换引用导致 effect 反复取消、
    // 对账跑到一半被 cleanup 打断（详情页有多次状态更新）。
    const searchParams = new URLSearchParams(window.location.search);
    const orderNo = searchParams.get("order_no");
    const tradeNo = searchParams.get("trade_no") || undefined;
    if (!orderNo) return;

    const cleanReturnParams = () => {
      const params = new URLSearchParams(window.location.search);
      params.delete("order_no");
      params.delete("trade_no");
      const qs = params.toString();
      router.replace(qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    };

    // 已对账过的订单直接跳过；但参数仍需清理，否则刷新/分享会一直带着 order_no。
    if (reconciledOrderRef.current === orderNo) {
      cleanReturnParams();
      return;
    }

    let cancelled = false;
    (async () => {
      reconciledOrderRef.current = orderNo;
      try {
        const status = await getOrderStatus(orderNo, tradeNo);
        if (cancelled) return;
        if (status.status === ORDER_STATUS.PAID) {
          setActionMessage(t("procurement_paymentReturnPaid"));
          await refreshMembership();
          const nid = status.noticeId ?? null;
          if (nid && userId) {
            // 2026-11-27 解锁补单已随次数体系下线：paid 后无需再打 /access，
            // 打开详情由套餐判定直接放行；保留缓存失效让会员等级/最近查看即时刷新
            clearApiCache("/api/payment/access-records");
            // SSOT 修复：同步失效会员状态缓存，避免 60s 内展示旧等级
            clearApiCache("/api/membership/status");
            await refreshMembership();
          }
          if (nid) await openNoticeById(nid);
        } else {
          setActionMessage(t("procurement_paymentReturnPending"));
        }
      } catch {
        if (!cancelled) setActionMessage(t("procurement_paymentReturnFailed"));
      } finally {
        if (!cancelled) cleanReturnParams();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, authReady, router]);
}
