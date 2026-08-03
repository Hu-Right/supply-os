/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from "express";
import type { AppContext } from "../context";
import { asyncHandler } from "../middleware/errorHandler";
import { OpportunitiesRepo } from "../repos/opportunities.repo";
import { type UnspscCodeRow } from "../services/unspsc";

export function createTrainingRouter(ctx: AppContext): Router {
  const router = Router();
  const trainingRepo = ctx.trainingRepo;
  const opportunitiesRepo = ctx.opportunitiesRepo;

  // 6b. TRAINING SEMINAR REGISTRATION
  router.post("/api/training/register", asyncHandler(async (req, res) => {
      const {
        company_name,
        industry_id,
        main_product,
        export_experience,
        certification,
        contact_name,
        position,
        telephone,
        email,
        remark,
      } = req.body;

      if (!company_name || !contact_name || !telephone) {
        return res.status(400).json({ error: "企业名称、参会人姓名、手机号码为必填项" });
      }

      let industryName = "";
      let industryCode: UnspscCodeRow | null = null;
      if (industry_id) {
        industryCode = await opportunitiesRepo.findUnspscCodeById(industry_id);
        if (industryCode) {
          industryName = industryCode.title_zh || industryCode.title || "";
        }
      }

      const registrationId = await trainingRepo.insertRegistration({
        companyName: company_name,
        industryId: industry_id || null,
        industry: industryName,
        mainProduct: main_product || "",
        exportExperience: export_experience || "",
        certification: certification || "",
        contactName: contact_name,
        position: position || "",
        telephone,
        email: email || "",
        remark: remark || "",
        ip: req.ip || req.socket?.remoteAddress || "127.0.0.1",
      });

      return res.status(201).json({
        success: true,
        id: registrationId,
        message: "\u7814\u4fee\u73ed\u62a5\u540d\u4fe1\u606f\u5df2\u63d0\u4ea4",
      });
  }));

  // 6c. 研修班文件下载次数追踪。
  const trainingDownloadCounts: Record<string, number> = {};
  router.post("/api/training/downloads/track", (req, res) => {
    const materialId = String(req.body.material_id || "").slice(0, 60);
    const fileName = String(req.body.file_name || "").slice(0, 120);
    if (!materialId) return res.status(400).json({ error: "material_id required" });
    trainingDownloadCounts[materialId] = (trainingDownloadCounts[materialId] || 0) + 1;
    console.log(`[Download] ${materialId} | ${fileName} | total=${trainingDownloadCounts[materialId]}`);
    return res.json({ success: true, material_id: materialId, total: trainingDownloadCounts[materialId] });
  });

  router.get("/api/training/downloads/stats", (_req, res) => {
    res.json(trainingDownloadCounts);
  });

  return router;
}
