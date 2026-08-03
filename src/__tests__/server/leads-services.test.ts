// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  mapUngmAppointmentRow,
  insertUngmAppointment,
  createLeadsStore,
} from "../../../server/services/leads";

describe("mapUngmAppointmentRow", () => {
  const baseRow = {
    appointment_key: "APT-1",
    company_name: "测试公司",
    contact_person: "张三",
    contact_method: "13800000000",
    created_at: "2026-06-01T08:00:00.000Z",
  };

  it("maps columns to the Lead shape with defaults", () => {
    const lead = mapUngmAppointmentRow(baseRow);
    expect(lead.id).toBe("APT-1");
    expect(lead.companyName).toBe("测试公司");
    expect(lead.country).toBe("China");
    expect(lead.city).toBe("Unknown");
    expect(lead.email).toBe("");
    expect(lead.industry).toBe("Services");
    expect(lead.status).toBe("new");
    expect(lead.type).toBe("consulting_advisor");
    expect(lead["has国际公共采购Participation"]).toBe(false);
    expect(lead.mainProducts).toBe("");
    expect(lead.createdAt).toBe("2026-06-01T08:00:00.000Z");
    expect(lead.followUpLogs).toEqual([]);
  });

  it("keeps provided values over defaults", () => {
    const lead = mapUngmAppointmentRow({
      ...baseRow,
      country: "德国",
      city: "慕尼黑",
      email: "a@b.de",
      industry: "化工",
      status: "contacted",
      consultation_needs: "需要报价咨询",
    });
    expect(lead.country).toBe("德国");
    expect(lead.city).toBe("慕尼黑");
    expect(lead.email).toBe("a@b.de");
    expect(lead.industry).toBe("化工");
    expect(lead.status).toBe("contacted");
    expect(lead.notes).toBe("需要报价咨询");
  });

  it("accepts Date instances and JSON-string follow_up_logs", () => {
    const lead = mapUngmAppointmentRow({
      ...baseRow,
      created_at: new Date("2026-06-02T10:00:00.000Z"),
      follow_up_logs: JSON.stringify([{ date: "2026-06-02", content: "首次联系", author: "顾问" }]),
    });
    expect(lead.createdAt).toBe("2026-06-02T10:00:00.000Z");
    expect(lead.followUpLogs).toEqual([
      { date: "2026-06-02", content: "首次联系", author: "顾问" },
    ]);
  });
});

describe("insertUngmAppointment", () => {
  it("writes all 15 columns with normalized defaults", async () => {
    const dbPool = { execute: vi.fn().mockResolvedValue([]) };
    const lead = mapUngmAppointmentRow({
      appointment_key: "APT-1",
      company_name: "测试公司",
      contact_person: "张三",
      contact_method: "13800000000",
      created_at: "2026-06-01T08:00:00.000Z",
    });

    await insertUngmAppointment(dbPool, lead, { source: "form" }, "127.0.0.1");

    const [sql, params] = dbPool.execute.mock.calls[0];
    expect(sql).toContain("INSERT INTO ungm_1v1_appointments");
    expect(params).toEqual([
      "APT-1",
      "测试公司",
      "China",
      "Unknown",
      "张三",
      "13800000000",
      "",
      "Services",
      "",
      "new",
      "[]",
      JSON.stringify({ source: "consult_form", lead_type: "consulting_advisor" }),
      JSON.stringify({ source: "form" }),
      "127.0.0.1",
      new Date("2026-06-01T08:00:00.000Z"),
    ]);
  });
});

describe("createLeadsStore", () => {
  it("seeds the three demo leads with unique ids", () => {
    const store = createLeadsStore();
    expect(store.map((lead) => lead.id)).toEqual(["lead-01", "lead-02", "lead-03"]);
    expect(store.map((lead) => lead.type)).toEqual([
      "exhibition_register",
      "supplier_register",
      "consulting_advisor",
    ]);
    // 每次调用返回全新数组（互不共享引用）
    expect(createLeadsStore()).not.toBe(store);
  });
});
