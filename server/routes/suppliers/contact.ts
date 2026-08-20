/**
 * 供应商联系方式路由（VIP only）
 * GET /api/suppliers/:id/contact
 */
import { Router } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireAuth } from "../../middleware/auth";
import { SuppliersRepo } from "../../repos/suppliers.repo";
import { UsersRepo } from "../../repos/users.repo";
import { MembershipRepo } from "../../repos/membership.repo";

export interface ContactDeps {
  suppliersRepo: SuppliersRepo;
  usersRepo: UsersRepo;
  membershipRepo: MembershipRepo;
}

export function createSupplierContactRouter(deps: ContactDeps): Router {
  const router = Router();
  const { suppliersRepo, usersRepo, membershipRepo } = deps;

  // P0-5 安全修复：供应商联系方式必须 JWT 认证
  router.get("/api/suppliers/:id/contact", requireAuth, asyncHandler(async (req, res) => {
    const supplierId = Number(String(req.params.id).replace(/^sup-db-/, ""));
    if (!supplierId) return res.status(400).json({ error: "INVALID_SUPPLIER" });
    const userKey = req.userKey || "";
    if (!userKey) return res.status(403).json({ error: "VIP_REQUIRED" });

    const user = await usersRepo.findByKey(userKey);
    if (!user) return res.status(403).json({ error: "VIP_REQUIRED" });
    // P1-5 安全修复：VIP 判定统一为动态计算（有效订阅 OR 付费剩余额度 > 0），
    // 与 membership.routes/auth.ts 同口径，不再信任永久化字段 membership_tier
    const [subs, entitlements] = await Promise.all([
      membershipRepo.findActiveSubscriptions(userKey),
      membershipRepo.findActiveEntitlements(userKey),
    ]);
    const isVip = subs.length > 0 || entitlements.length > 0;
    if (!isVip) return res.status(403).json({ error: "VIP_REQUIRED" });

    const supplier = await suppliersRepo.findContact(supplierId);
    if (!supplier) return res.status(404).json({ error: "SUPPLIER_NOT_FOUND" });

    res.json({
      contactPerson: supplier.contact || "",
      contactPhone: supplier.phone || "",
      contactEmail: supplier.email || "",
    });
  }));

  return router;
}
