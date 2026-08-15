/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Router } from "express";
import type { AppContext } from "../context";
import { Lead } from "../types/crm";
import { mapUngmAppointmentRow, insertUngmAppointment } from "../services/leads";
import { asyncHandler } from "../middleware/errorHandler";

export function createLeadsRouter(ctx: AppContext): Router {
  const router = Router();
  const { leadsDb } = ctx;
  const leadsRepo = ctx.leadsRepo;

  // 1. GET ALL LEADS
  router.get("/api/leads", asyncHandler(async (_req, res) => {
      const appointments = await leadsRepo.listAppointments();
      const mapped = appointments.map(mapUngmAppointmentRow);
      const persistedIds = new Set(mapped.map((lead) => lead.id));
      res.json([...mapped, ...leadsDb.filter((lead) => !persistedIds.has(lead.id))]);
  }));

  // 2. CREATE NEW LEAD (Automatically synchronized with CRM intake)
  router.post("/api/leads", asyncHandler(async (req, res) => {
      const {
        companyName,
        country,
        city,
        contactPerson,
        contactMethod,
        email,
        industry,
        mainProducts,
        has国际公共采购Participation,
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
        has国际公共采购Participation: !!has国际公共采购Participation,
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

      if (newLead.type === "consulting_advisor") {
        await insertUngmAppointment(ctx.dbPool, newLead, req.body, req.ip || req.socket?.remoteAddress || "");
      }
      leadsDb.unshift(newLead);
      return res.status(201).json(newLead);
  }));

  // 3. EDIT LEAD STATUS OR ADD ACTIONS Tracker LOG
  router.post("/api/leads/log", async (req, res) => {
    const { leadId, content, author, nextStatus } = req.body;
    if (!leadId || !content) {
      return res.status(400).json({ error: "Missing leadId or content log parameter" });
    }

    const lead = leadsDb.find((l) => l.id === leadId);
    let persistedLead: Lead | null = null;
    if (!lead) {
      const row = await leadsRepo.findByKey(leadId);
      persistedLead = row ? mapUngmAppointmentRow(row) : null;
      if (!persistedLead) {
        return res.status(404).json({ error: "Lead not found" });
      }
    }

    const targetLead = lead || persistedLead!;
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

    if (targetLead.type === "consulting_advisor") {
      await leadsRepo.updateFollowUpLogs(leadId, JSON.stringify(targetLead.followUpLogs), targetLead.status);
    }

    return res.json(targetLead);
  });

  return router;
}
