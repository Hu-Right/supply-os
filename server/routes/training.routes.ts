/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from "express";
import type { AppContext } from "../context";
import { type UnspscCodeRow } from "../services/unspsc";

export function createTrainingRouter(ctx: AppContext): Router {
  const router = Router();
  const { dbPool } = ctx;

  // 6b. TRAINING SEMINAR REGISTRATION
  router.post("/api/training/register", async (req, res) => {
    try {
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

      // Lookup industry name from UNSPSC table
      let industryName = "";
      let industryCode: UnspscCodeRow | null = null;
      if (industry_id) {
        const [rows] = await dbPool.query(
          "SELECT id, code, title, title_zh, level FROM crm_unspsc_codes WHERE id = ?",
          [industry_id]
        );
        if ((rows as any[]).length > 0) {
          industryCode = (rows as UnspscCodeRow[])[0];
          industryName = industryCode.title_zh || industryCode.title || "";
        }
      }

      const [result] = await dbPool.execute(
        `INSERT INTO crm_training_registrations
          (company_name, industry_id, industry, main_product, export_experience, certification, contact_name, position, telephone, email, remark, created_at, ip, audit_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, 'pending')`,
        [
          company_name,
          industry_id || null,
          industryName,
          main_product || "",
          export_experience || "",
          certification || "",
          contact_name,
          position || "",
          telephone,
          email || "",
          remark || "",
          req.ip || req.socket?.remoteAddress || "127.0.0.1",
        ]
      );

      const registrationId = (result as any).insertId;

      return res.status(201).json({
        success: true,
        id: registrationId,
        message: "\u7814\u4fee\u73ed\u62a5\u540d\u4fe1\u606f\u5df2\u63d0\u4ea4",
      });
    } catch (err: any) {
      console.error("Training register error:", err.message);
      return res.status(500).json({ error: "提交失败，请稍后重试" });
    }
  });

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
