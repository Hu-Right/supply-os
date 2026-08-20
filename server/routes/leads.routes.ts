/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Router } from "express";
import type { AppContext } from "../context";
import { Lead } from "../types/crm";
import { mapUngmAppointmentRow, insertUngmAppointment } from "../services/leads";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "./admin/middleware";

export function createLeadsRouter(ctx: AppContext): Router {
  const router = Router();
  // 双轨制退役（轨道D）：leadsDb 内存数组已删除——线索全量落库（ungm_1v1_appointments），
  // 进程重启不再丢失数据，多实例部署数据一致；lead_type 由 extra JSON 区分。
  const leadsRepo = ctx.leadsRepo;

  // P0-7 安全修复：线索接口必须管理员鉴权
  router.get("/api/leads", requireAdmin, asyncHandler(async (_req, res) => {
      const appointments = await leadsRepo.listAppointments();
      res.json(appointments.map(mapUngmAppointmentRow));
  }));

  // P0-7 安全修复：创建线索必须认证
  router.post("/api/leads", requireAuth, asyncHandler(async (req, res) => {
      const {
        companyName,
        country,
        city,
        contactPerson,
        contactMethod,
        email,
        industry,
        mainProducts,
        hasIntlProcurement,
        notes,
        type
      } = req.body;

      if (!companyName || !contactPerson || !contactMethod) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const newLead: Lead = {
        id: `lead-user-${Date.now()}`,
        companyName,
        country: country || "China",
        city: city || "Unknown",
        contactPerson,
        contactMethod,
        email: email || "",
        industry: industry || "Other",
        mainProducts: mainProducts || "",
        hasIntlProcurement: !!hasIntlProcurement,
        notes: notes || "",
        type: type || "custom",
        status: "new",
        createdAt: new Date().toISOString(),
        followUpLogs: [
          {
            date: new Date().toISOString().substring(0, 16).replace("T", " "),
            content: `线索自动录入：来自门户前端表单申请，类型 ${type || "custom"}。`,
            author: "CRM System"
          }
        ]
      };

      // 全类型线索一律落库（原仅 consulting_advisor 入库，其余类型只存内存）
      await insertUngmAppointment(ctx.dbPool, newLead, req.body, req.ip || req.socket?.remoteAddress || "");
      return res.status(201).json(newLead);
  }));

  // P0-7 安全修复：线索日志必须管理员鉴权，author 强制 JWT 身份
  router.post("/api/leads/log", requireAdmin, asyncHandler(async (req, res) => {
    const { leadId, content, nextStatus } = req.body;
    const author = req.userKey || "Admin";
    if (!leadId || !content) {
      return res.status(400).json({ error: "Missing leadId or content log parameter" });
    }

    const row = await leadsRepo.findByKey(leadId);
    if (!row) {
      return res.status(404).json({ error: "Lead not found" });
    }
    const targetLead = mapUngmAppointmentRow(row);
    if (!targetLead.followUpLogs) {
      targetLead.followUpLogs = [];
    }

    targetLead.followUpLogs.push({
      date: new Date().toISOString().substring(0, 16).replace("T", " "),
      content,
      author: author || "Operator"
    });

    if (nextStatus) {
      targetLead.status = nextStatus;
    }

    // 全类型线索的跟进日志统一持久化（原仅 consulting_advisor 更新）
    await leadsRepo.updateFollowUpLogs(leadId, JSON.stringify(targetLead.followUpLogs), targetLead.status);

    return res.json(targetLead);
  }));

  return router;
}
