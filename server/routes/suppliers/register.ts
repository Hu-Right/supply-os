/**
 * 供应商注册 + 认领路由
 * POST /api/suppliers
 * POST /api/supplier-claims
 */
import crypto from "crypto";
import { Router } from "express";
import type { Pool } from "mysql2/promise";
import { Lead } from "../../types/crm";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireAuth } from "../../middleware/auth";
import { rateLimitMiddleware } from "../../middleware/rateLimiter";
import { mapSupplierRow } from "../../services/suppliers";
import { insertUngmAppointment } from "../../services/leads";
import { SupplierRegistrationRepo } from "../../repos/suppliers/supplier-registration.repo";
import { SupplierClaimRepo } from "../../repos/suppliers/supplier-claim.repo";
import { UsersRepo } from "../../repos/users.repo";

export interface RegisterDeps {
  registrationRepo: SupplierRegistrationRepo;
  claimRepo: SupplierClaimRepo;
  usersRepo: UsersRepo;
  // 双轨制退役（轨道D）：leadsDb 内存数组已删除，伴生线索直接落库
  dbPool: Pool;
  invalidateCache: () => void;
}

export function createSupplierRegisterRouter(deps: RegisterDeps): Router {
  const router = Router();
  const { registrationRepo, claimRepo, usersRepo, dbPool, invalidateCache } = deps;
  // P2-9 安全修复：供应商注册为写入型成本端点，必须认证 + 限流（防批量注入）
  const registerRateLimit = rateLimitMiddleware({ windowMs: 60_000, maxAttempts: 10 });

  // POST /api/suppliers — 注册新供应商
  router.post("/api/suppliers", requireAuth, registerRateLimit, asyncHandler(async (req, res) => {
    const {
        nameZh,
        type,
        industryZh,
        ungmCode,
        mainProductsZh,
        complianceLabelsZh,
        contactPerson,
        contactEmail,
        contactPhone
      } = req.body;

      if (!nameZh || !contactPerson || !contactEmail) {
        return res.status(400).json({ error: "Missing name or contact data" });
      }

      const mainProduct = Array.isArray(mainProductsZh)
        ? mainProductsZh.join(", ")
        : String(mainProductsZh || "");
      const certification = Array.isArray(complianceLabelsZh)
        ? complianceLabelsZh.join(", ")
        : String(complianceLabelsZh || "");
      const requestHash = crypto
        .createHash("md5")
        .update(`${String(nameZh).trim()}|${String(contactEmail).trim().toLowerCase()}`)
        .digest("hex");

      let supplierRow = await registrationRepo.findCrmByRequestHash(requestHash);
      if (!supplierRow) {
        const insertId = await registrationRepo.insertCrmSupplier({
          companyName: String(nameZh).trim(),
          contactName: String(contactPerson).trim(),
          telephone: String(contactPhone || "").trim(),
          email: String(contactEmail).trim(),
          mainProduct,
          industry: String(industryZh || "").trim(),
          certification,
          requestHash,
        });
        supplierRow = await registrationRepo.findCrmById(insertId);
      }

      const newSupplier = mapSupplierRow(supplierRow, null);

      const companionLead: Lead = {
        id: `lead-user-sup-${Date.now()}`,
        companyName: nameZh,
        country: "China",
        city: "Unknown",
        contactPerson,
        contactMethod: contactPhone || contactEmail,
        email: contactEmail,
        industry: industryZh || "Other",
        mainProducts: mainProduct,
        hasIntlProcurement: !!ungmCode,
        notes: `申请注册为供应商。类型: ${type}. 国际公共采购 Code: ${ungmCode || "None"}. 待运营专家进行出海合规资质审查。`,
        type: "supplier_register",
        status: "new",
        createdAt: new Date().toISOString(),
        followUpLogs: [
          {
            date: new Date().toISOString().substring(0, 16).replace("T", " "),
            content: "供应商入驻申请：等待检验出资及三方安规检测单据。",
            author: "Admin System"
          }
        ]
      };
      // 双轨制退役（轨道D）：伴生线索全量落库（原 leadsDb 内存数组已删除，
      // 进程重启不再丢失；lead_type 由 extra JSON 区分）
      await insertUngmAppointment(dbPool, companionLead, req.body, req.ip || req.socket?.remoteAddress || "");

      invalidateCache();

    return res.status(201).json({ supplier: newSupplier, companionLead });
  }));

  // POST /api/supplier-claims — 供应商认领
  // B1 退役准备（高危端点升级）：requireAuth 强制 JWT 身份，认领归属取自 req.userKey，
  // 杜绝 body.user_key 伪造他人认领（见《legacy 通道清点报告》§2.2）。
  // 前端注册流程在拿到 JWT 后才调用本端点（api() 自动携带），行为向后兼容。
  router.post("/api/supplier-claims", requireAuth, asyncHandler(async (req, res) => {
    const userKey = req.userKey || "";
    const companyName = String(req.body.company_name || "").trim();
    if (!userKey || !companyName) {
      return res.status(400).json({ error: "请先登录并填写公司名称" });
    }

    const supplierType = req.body.supplier_type === "international" ? "international" : "domestic";
    const contactName = String(req.body.contact_name || "");
    const contactPhone = String(req.body.contact_phone || "");
    const contactEmail = String(req.body.contact_email || userKey);
    const businessLicenseNo = String(req.body.business_license_no || "");
    const supplierId = await registrationRepo.findCrmIdByCompanyName(companyName);

    const claimId = await claimRepo.insertClaim({
      userKey,
      supplierId,
      companyName,
      supplierType,
      contactName,
      contactPhone,
      contactEmail,
      businessLicenseNo,
    });

    // P0-6 安全修复：删除自动绑手机逻辑（原逻辑无短信验证码校验，可构成账号接管链）
    // 如需绑手机，用户应通过独立的 phone_bind 验证码流程（send-phone-code + verify-phone-code）

    res.status(201).json({ success: true, id: claimId, status: "pending" });
  }));

  return router;
}
