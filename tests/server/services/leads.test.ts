/**
 * server/services/leads.ts 测试
 */
import { describe, it, expect, vi } from "vitest";
import { mapUngmAppointmentRow, insertUngmAppointment } from "../../../server/services/leads";

describe("mapUngmAppointmentRow", () => {
  it("映射基本字段", () => {
    const row = {
      appointment_key: "lead-001",
      company_name: "Acme Corp",
      country: "US",
      city: "New York",
      contact_person: "John",
      contact_method: "email",
      email: "john@acme.com",
      industry: "Technology",
      consultation_needs: "Need help",
      status: "active",
      created_at: "2026-01-01T00:00:00Z",
      follow_up_logs: '[{"action":"call"}]',
    };
    const lead = mapUngmAppointmentRow(row);
    expect(lead.id).toBe("lead-001");
    expect(lead.companyName).toBe("Acme Corp");
    expect(lead.country).toBe("US");
    expect(lead.type).toBe("consulting_advisor");
    expect(lead.status).toBe("active");
  });

  it("缺省字段使用默认值", () => {
    const row = {
      appointment_key: "lead-002",
      company_name: "Test",
      contact_person: "Jane",
      contact_method: "phone",
      created_at: new Date("2026-06-15"),
    };
    const lead = mapUngmAppointmentRow(row);
    expect(lead.country).toBe("China");
    expect(lead.city).toBe("Unknown");
    expect(lead.email).toBe("");
    expect(lead.industry).toBe("Services");
    expect(lead.status).toBe("new");
  });

  it("Date 对象 created_at 正确转换", () => {
    const row = {
      appointment_key: "lead-003",
      company_name: "X",
      contact_person: "A",
      contact_method: "email",
      created_at: new Date("2026-03-01T12:00:00Z"),
    };
    const lead = mapUngmAppointmentRow(row);
    expect(lead.createdAt).toContain("2026-03-01");
  });
});

describe("insertUngmAppointment", () => {
  it("调用 leadsRepo.insertAppointment 传入正确参数", async () => {
    const mockRepo = { insertAppointment: vi.fn().mockResolvedValue(undefined) };
    const lead = {
      id: "lead-100",
      companyName: "Corp",
      country: "CN",
      city: "Beijing",
      contactPerson: "Li",
      contactMethod: "email",
      email: "li@corp.com",
      industry: "Mfg",
      notes: "help",
      status: "new",
      followUpLogs: [],
      createdAt: "2026-01-01T00:00:00Z",
    } as any;

    await insertUngmAppointment(mockRepo as any, lead, { source: "form" }, "1.2.3.4");
    expect(mockRepo.insertAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentKey: "lead-100",
        companyName: "Corp",
        country: "CN",
        ip: "1.2.3.4",
      }),
    );
  });
});
