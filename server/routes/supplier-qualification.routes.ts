/**
 * 供应商国际招投标能力初筛路由
 * POST /api/supplier-qualification — 提交初筛表单（无需登录，扫码直达）
 */
import { Router } from "express";
import type { Pool } from "mysql2/promise";
import { asyncHandler } from "../middleware/errorHandler";
import { rateLimitMiddleware } from "../middleware/rateLimiter";
import { sendError, ApiErrorCode } from "../utils/http-error";

export interface QualificationDeps {
  dbPool: Pool;
}

export function createQualificationRouter(deps: QualificationDeps): Router {
  const router = Router();
  const { dbPool } = deps;

  // 限流：每分钟最多 10 次提交（防刷）
  const rateLimit = rateLimitMiddleware({ windowMs: 60_000, maxAttempts: 10 });

  // POST /api/supplier-qualification — 提交初筛表单
  router.post("/api/supplier-qualification", rateLimit, asyncHandler(async (req, res) => {
    const {
      company_name,
      company_website,
      founding_year,
      employee_count,
      industry,
      other_industry,
      main_product,
      export_scale,
      certifications,
      other_certifications,
      service_countries,
      overseas_companies,
      ungm_status,
      english_team,
      payment_terms,
      bid_willingness,
      contact_info,
    } = req.body;

    // 必填校验
    const required: [string, string][] = [
      ["company_name", "企业名称"],
      ["company_website", "企业官网网址"],
      ["industry", "企业所属行业"],
      ["main_product", "企业主营产品"],
      ["export_scale", "出口/国际业务规模"],
      ["certifications", "资质证书"],
      ["service_countries", "售后点/服务站/维修点"],
      ["overseas_companies", "海外分公司/投资公司"],
      ["ungm_status", "UNGM注册状态"],
      ["english_team", "英文团队能力"],
      ["payment_terms", "账期接受度"],
      ["bid_willingness", "投标意愿"],
    ];

    for (const [field, label] of required) {
      const val = req.body[field];
      if (!val || (Array.isArray(val) && val.length === 0)) {
        return sendError(res, 400, ApiErrorCode.INVALID_PARAMS, `${label}为必填项`);
      }
    }

    // 数组转逗号分隔字符串
    const toArray = (v: unknown) => Array.isArray(v) ? v.join(", ") : String(v || "");

    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
      || req.ip
      || req.socket?.remoteAddress
      || "127.0.0.1";

    const [result] = await dbPool.execute(
      `INSERT INTO crm_supplier_qualification
        (company_name, company_website, founding_year, employee_count, industry, other_industry,
         main_product, export_scale, certifications, other_certifications,
         service_countries, overseas_companies, ungm_status, english_team,
         payment_terms, bid_willingness, contact_info, audit_status, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW())`,
      [
        String(company_name).trim(),
        String(company_website).trim(),
        String(founding_year || "").trim() || null,
        String(employee_count || "").trim() || null,
        toArray(industry),
        String(other_industry || "").trim() || null,
        String(main_product).trim(),
        String(export_scale).trim(),
        toArray(certifications),
        String(other_certifications || "").trim() || null,
        String(service_countries).trim(),
        String(overseas_companies).trim(),
        String(ungm_status).trim(),
        String(english_team).trim(),
        String(payment_terms).trim(),
        String(bid_willingness).trim(),
        String(contact_info || "").trim() || null,
        ip,
      ],
    );

    const id = Number((result as any).insertId);
    res.status(201).json({ success: true, id, message: "提交成功，我们将尽快审核" });
  }));

  return router;
}
