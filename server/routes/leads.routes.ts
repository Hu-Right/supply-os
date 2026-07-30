/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Router } from "express";
import type { AppContext } from "../context";
import { Lead } from "../../src/types";
import { mapUngmAppointmentRow, insertUngmAppointment } from "../services/leads";

export function createLeadsRouter(ctx: AppContext): Router {
  const router = Router();
  const { dbPool, leadsDb } = ctx;

  // 1. GET ALL LEADS
  router.get("/api/leads", async (_req, res) => {
    try {
      const [appointmentRows] = await dbPool.query(
        `SELECT appointment_key, company_name, country, city, contact_person, contact_method, email, industry,
                consultation_needs, status, follow_up_logs, created_at
         FROM ungm_1v1_appointments
         ORDER BY created_at DESC, id DESC
         LIMIT 200`
      );
      const appointments = (appointmentRows as any[]).map(mapUngmAppointmentRow);
      const persistedIds = new Set(appointments.map((lead) => lead.id));
      res.json([...appointments, ...leadsDb.filter((lead) => !persistedIds.has(lead.id))]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. CREATE NEW LEAD (Automatically synchronized with CRM intake)
  router.post("/api/leads", async (req, res) => {
    try {
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
        await insertUngmAppointment(dbPool, newLead, req.body, req.ip || req.socket?.remoteAddress || "");
      }
      leadsDb.unshift(newLead);
      return res.status(201).json(newLead);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 3. EDIT LEAD STATUS OR ADD ACTIONS Tracker LOG
  router.post("/api/leads/log", async (req, res) => {
    const { leadId, content, author, nextStatus } = req.body;
    if (!leadId || !content) {
      return res.status(400).json({ error: "Missing leadId or content log parameter" });
    }

    const lead = leadsDb.find((l) => l.id === leadId);
    let persistedLead: Lead | null = null;
    if (!lead) {
      const [appointmentRows] = await dbPool.query(
        `SELECT appointment_key, company_name, country, city, contact_person, contact_method, email, industry,
                consultation_needs, status, follow_up_logs, created_at
         FROM ungm_1v1_appointments
         WHERE appointment_key = ?
         LIMIT 1`,
        [leadId]
      );
      persistedLead = (appointmentRows as any[])[0] ? mapUngmAppointmentRow((appointmentRows as any[])[0]) : null;
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
      await dbPool.execute(
        "UPDATE ungm_1v1_appointments SET follow_up_logs = ?, status = ?, updated_at = NOW() WHERE appointment_key = ?",
        [JSON.stringify(targetLead.followUpLogs), targetLead.status, leadId]
      );
    }

    return res.json(targetLead);
  });

  return router;
}
