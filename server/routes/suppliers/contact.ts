/**
 * 供应商联系方式路由（VIP only）
 * GET /api/suppliers/:id/contact
 */
import { Router } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireAuth } from "../../middleware/auth";
import { SupplierDirectoryRepo } from "../../repos/suppliers/supplier-directory.repo";
import { UsersRepo } from "../../repos/users.repo";
import { MembershipRepo } from "../../repos/membership.repo";
import { resolveMembershipState } from "../../services/membership-status";
import { sendError, ApiErrorCode } from "../../utils/http-error";

export interface ContactDeps {
  directoryRepo: SupplierDirectoryRepo;
  usersRepo: UsersRepo;
  membershipRepo: MembershipRepo;
}

export function createSupplierContactRouter(deps: ContactDeps): Router {
  const router = Router();
  const { directoryRepo, usersRepo, membershipRepo } = deps;

  // P0-5 安全修复：供应商联系方式必须 JWT 认证
  // N4 试点（2026-08-20）：错误出口改经统一端口 sendError（code/message 契约）
  router.get("/api/suppliers/:id/contact", requireAuth, asyncHandler(async (req, res) => {
    const supplierId = Number(String(req.params.id).replace(/^sup-db-/, ""));
    if (!supplierId) return sendError(res, 400, ApiErrorCode.INVALID_PARAMS, "无效的供应商标识");
    const userKey = req.userKey || "";
    if (!userKey) return sendError(res, 403, ApiErrorCode.VIP_REQUIRED, "该功能仅对 VIP 会员开放");

    const user = await usersRepo.findByKey(userKey);
    if (!user) return sendError(res, 403, ApiErrorCode.VIP_REQUIRED, "该功能仅对 VIP 会员开放");
    // N1 收敛（2026-08-20）：VIP 判定唯一端口 resolveMembershipState
    //（订阅 OR 付费剩余配额 > 0），与 /api/membership/status、auth 登录响应真正同口径。
    const { isVip } = await resolveMembershipState(membershipRepo, userKey);
    if (!isVip) return sendError(res, 403, ApiErrorCode.VIP_REQUIRED, "该功能仅对 VIP 会员开放");

    const supplier = await directoryRepo.findContact(supplierId);
    if (!supplier) return sendError(res, 404, ApiErrorCode.SUPPLIER_NOT_FOUND, "供应商不存在");

    res.json({
      contactPerson: supplier.contact || "",
      contactPhone: supplier.phone || "",
      contactEmail: supplier.email || "",
    });
  }));

  return router;
}
