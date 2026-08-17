/**
 * 供应商注册 + 认领路由
 * POST /api/suppliers
 * POST /api/supplier-claims
 */
import crypto from "crypto";
import { Router } from "express";
import type { AppContext } from "../../context";
import { Lead } from "../../types/crm";
import { asyncHandler } from "../../middleware/errorHandler";
import { normalizeUserKey } from "../../utils/normalize";
import { mapSupplierRow } from "../../services/suppliers";
import { SuppliersRepo } from "../../repos/suppliers.repo";
import { UsersRepo } from "../../repos/users.repo";

export interface RegisterDeps {
  suppliersRepo: SuppliersRepo;
  usersRepo: UsersRepo;
  leadsDb: AppContext["leadsDb"];
  invalidateCache: () => void;
}

export function createSupplierRegisterRouter(deps: RegisterDeps): Router {
  const router = Router();
  const { suppliersRepo, usersRepo, leadsDb, invalidateCache } = deps;

  // POST /api/suppliers — 注册新供应商
  router.post("/api/suppliers", asyncHandler(async (req, res) => {
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

      let supplierRow = await suppliersRepo.findCrmByRequestHash(requestHash);
      if (!supplierRow) {
        const insertId = await suppliersRepo.insertCrmSupplier({
          companyName: String(nameZh).trim(),
          contactName: String(contactPerson).trim(),
          telephone: String(contactPhone || "").trim(),
          email: String(contactEmail).trim(),
          mainProduct,
          industry: String(industryZh || "").trim(),
          certification,
          requestHash,
        });
        supplierRow = await suppliersRepo.findCrmById(insertId);
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
        has国际公共采购Participation: !!ungmCode,
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
      leadsDb.unshift(companionLead);

      invalidateCache();

    return res.status(201).json({ supplier: newSupplier, companionLead });
  }));

  // POST /api/supplier-claims — 供应商认领
  router.post("/api/supplier-claims", asyncHandler(async (req, res) => {
    const userKey = normalizeUserKey(req.body.user_key) || "";
    const companyName = String(req.body.company_name || "").trim();
    if (!userKey || !companyName) {
      return res.status(400).json({ error: "请先登录并填写公司名称" });
    }

    const supplierType = req.body.supplier_type === "international" ? "international" : "domestic";
    const contactName = String(req.body.contact_name || "");
    const contactPhone = String(req.body.contact_phone || "");
    const contactEmail = String(req.body.contact_email || userKey);
    const businessLicenseNo = String(req.body.business_license_no || "");
    const supplierId = await suppliersRepo.findCrmIdByCompanyName(companyName);

    const claimId = await suppliersRepo.insertClaim({
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
