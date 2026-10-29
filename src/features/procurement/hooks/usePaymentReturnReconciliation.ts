/**
 * 支付回跳对账 Hook
 * Payment Return Reconciliation Hook
 *
 * @module features/procurement/hooks/usePaymentReturnReconciliation
 * @description 支付整页跳回后的对账：?order_no=&trade_no=&notice_id= 或
 *              仅 ?notice_id=。订单已支付则刷新配额并打开对应公告详情，
 *              未决/失败给出提示；对账完成后清理 URL 参数。
 *              Reconciles full-page payment returns from URL params and
 *              cleans them up afterwards.
 */
import { useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { clearApiCache } from "@/core/http";
import { getOrderStatus } from "@/core/payment/payment-facade";
import { unlockNotice } from "../api";
import { ORDER_STATUS } from "@/shared/constants/order-status";

export interface UsePaymentReturnReconciliationOptions {
  refreshMembership: () => Promise<void>;
  openNoticeById: (id: number) => Promise<void>;
  setActionMessage: (message: string) => void;
  /** 未登录直达详情时的登录引导（与列表点击 openNotice 同一门槛） */
  onRequireLogin: () => void;
  userId?: number;
  /** 认证初始化是否完成：未就绪时不得判定为未登录（避免误弹登录框） */
  authReady?: boolean;
}

export function usePaymentReturnReconciliation({
  refreshMembership,
  openNoticeById,
  setActionMessage,
  onRequireLogin,
  userId,
  authReady,
}: UsePaymentReturnReconciliationOptions) {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  // 订单对账幂等：同一 order_no 只跑一次业务（加入 userId 依赖后登录态变化会重跑本 effect）
  const reconciledOrderRef = useRef<string | null>(null);
  // 到达机会一次性消费：每次页面加载（分享/刷新/直达/支付回跳都属整页加载，ref 重置）只在首次
  // 可判定时按 URL 打开一次；之后点开写进 URL 的 notice_id 不再被回跳重复打开，关闭也不会被重开。
  const arrivalResolvedRef = useRef(false);

  useEffect(() => {
    const orderNo = searchParams.get("order_no");
    const noticeIdParam = searchParams.get("notice_id");
    const tradeNo = searchParams.get("trade_no") || undefined;
    if (!orderNo && !noticeIdParam) {
      // 无到达参数：一旦 auth 可判定即消费“到达机会”，此后点开写进 URL 的 notice_id 不会被回跳重复打开
      if (!arrivalResolvedRef.current && (userId || authReady)) arrivalResolvedRef.current = true;
      return;
    }
    // 已对账过的订单直接跳过（避免 userId 从 undefined→set 触发重复对账）
    if (orderNo && reconciledOrderRef.current === orderNo) return;
    let cancelled = false;
    (async () => {
      if (orderNo) {
        reconciledOrderRef.current = orderNo;
        // 支付回跳会自行打开公告：消费到达机会，避免清理 order_no 后又从裸 notice_id 重开
        arrivalResolvedRef.current = true;
        try {
          const status = await getOrderStatus(orderNo, tradeNo);
          if (cancelled) return;
          if (status.status === ORDER_STATUS.PAID) {
            setActionMessage(t("procurement_paymentReturnPaid"));
            await refreshMembership();
            const nid = status.noticeId ?? (noticeIdParam ? Number(noticeIdParam) : null);
            // P0-9 安全修复：paid 分支先执行解锁，再打开详情（否则详情接口返回 403 NOTICE_LOCKED）
            if (nid && userId) {
              try {
                await unlockNotice(nid, "subscription", 0);
              } catch {
                // 解锁可能已在服务端完成，忽略失败
              }
              // P2-5：解锁成功后清除解锁历史缓存，RecentUnlocks 立即刷新
              clearApiCache("/api/payment/unlocks");
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
        }
      } else if (noticeIdParam) {
        // 到达型深链（分享/刷新/直达，均属整页加载，arrivalResolvedRef 已重置）：本次加载只消费一次。
        // auth 未就绪→不空开也不误弹，等 userId/authReady 变化后重跑；确认未登录→弹登录并保留 notice_id，
        // 登录后整页刷新重放。置位后，点开写进 URL 的 notice_id 不再被回跳重复打开，关闭也不会被重开。
        if (arrivalResolvedRef.current) return;
        if (!userId && !authReady) return;
        arrivalResolvedRef.current = true;
        if (userId) {
          await openNoticeById(Number(noticeIdParam));
        } else {
          onRequireLogin();
          return;
        }
      }
      // 回跳参数清理：仅剔除支付对账参数（order_no/trade_no）；notice_id 交由页面选中态同步统一管理
      // （保留在 URL 里，详情页才可分享/刷新）。只有确实带了支付参数时才改写 URL，避免无谓 replace 触发重渲染。
      if (!cancelled && (orderNo || tradeNo)) {
        const params = new URLSearchParams(window.location.search);
        params.delete("order_no");
        params.delete("trade_no");
        const qs = params.toString();
        router.replace(qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, userId, authReady]);
}
