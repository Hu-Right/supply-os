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
import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { clearApiCache } from "@/core/http";
import { getOrderStatus } from "@/features/payment";
import { unlockNotice } from "../api";

export interface UsePaymentReturnReconciliationOptions {
  refreshMembership: () => Promise<void>;
  openNoticeById: (id: number) => Promise<void>;
  setActionMessage: (message: string) => void;
  userKey?: string;
}

export function usePaymentReturnReconciliation({
  refreshMembership,
  openNoticeById,
  setActionMessage,
  userKey,
}: UsePaymentReturnReconciliationOptions) {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const orderNo = searchParams.get("order_no");
    const noticeIdParam = searchParams.get("notice_id");
    const tradeNo = searchParams.get("trade_no") || undefined;
    if (!orderNo && !noticeIdParam) return;
    let cancelled = false;
    (async () => {
      if (orderNo) {
        try {
          const status = await getOrderStatus(orderNo, tradeNo);
          if (cancelled) return;
          if (status.status === "paid") {
            setActionMessage(t("procurement_paymentReturnPaid"));
            await refreshMembership();
            const nid = status.notice_id ?? (noticeIdParam ? Number(noticeIdParam) : null);
            // P0-9 安全修复：paid 分支先执行解锁，再打开详情（否则详情接口返回 403 NOTICE_LOCKED）
            if (nid && userKey) {
              try {
                await unlockNotice(nid, "single", 0);
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
        await openNoticeById(Number(noticeIdParam));
      }
      if (!cancelled) router.replace(window.location.pathname);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
}
