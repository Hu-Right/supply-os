/**
 * 供应商联系方式路由（VIP only）
 * GET /api/suppliers/:id/contact
 */
import { Router } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import { normalizeUserKey } from "../../utils/normalize";
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

  router.get("/api/suppliers/:id/contact", asyncHandler(async (req, res) => {
    const supplierId = Number(String(req.params.id).replace(/^sup-db-/, ""));
    if (!supplierId) return res.status(400).json({ error: "INVALID_SUPPLIER" });
    const userKey = normalizeUserKey(req.query.user_key) || "";
    if (!userKey) return res.status(403).json({ error: "VIP_REQUIRED" });

    const user = await usersRepo.findByKey(userKey);
    if (!user) return res.status(403).json({ error: "VIP_REQUIRED" });
    const subs = await membershipRepo.findActiveSubscriptions(userKey);
    const isVip = subs.length > 0 || user.membership_tier === "vip";
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
