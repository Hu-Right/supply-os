/**
 * 财务/运营处理发票的权限判定
 *
 * @module lib/middleware/billing-ops
 * @description 不做多租户/RBAC：用环境变量白名单 BILLING_OPS_USER_IDS（逗号分隔 users.id）。
 *              未配置时默认拒绝（403），避免误开放。
 */
import { routeError } from "./route-handler";
import { EC_FORBIDDEN } from "@/shared/constants/api";

export function isBillingOpsUser(userId: number): boolean {
  const ids = (process.env.BILLING_OPS_USER_IDS || "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return ids.includes(userId);
}

export function assertBillingOps(userId: number): void {
  if (!isBillingOpsUser(userId)) {
    routeError(403, EC_FORBIDDEN, "无权限处理发票");
  }
}
