import { describe, it, expect } from "vitest";
import { mapUngmAppointmentRow, mapLeadForMemberView } from "@/lib/services/leads";

const ROW = {
  appointment_key: "lead-user-1730000000000",
  company_name: "中电变压器股份有限公司",
  country: "China",
  city: "保定",
  contact_person: "李大明",
  contact_method: "13812345678",
  email: "lidl@example.com",
  industry: "Electrical Equipment",
  consultation_needs: "希望了解 UNGM 注册流程",
  status: "new",
  created_at: new Date("2026-09-01T08:30:00Z"),
  follow_up_logs: JSON.stringify([
    { date: "2026-09-02 10:00", content: "已电话联系", author: "13887654321" },
  ]),
};

describe("mapLeadForMemberView（会员侧线索视图，隐私收口）", () => {
  const lead = mapLeadForMemberView(ROW);

  it("联系人姓名脱敏", () => {
    expect(lead.contactPerson).toBe("李**");
  });

  it("联系方式/邮箱不下发", () => {
    expect(lead.contactMethod).toBe("****");
    expect(lead.email).toBe("");
  });

  it("内部跟进日志不下发（含其他会员手机号作者）", () => {
    expect(lead).not.toHaveProperty("followUpLogs");
    expect(JSON.stringify(lead)).not.toContain("13887654321");
    expect(JSON.stringify(lead)).not.toContain("已电话联系");
  });

  it("商机信号保留（公司/行业/国家/需求/状态/时间）", () => {
    expect(lead.companyName).toBe("中电变压器股份有限公司");
    expect(lead.industry).toBe("Electrical Equipment");
    expect(lead.country).toBe("China");
    expect(lead.notes).toBe("希望了解 UNGM 注册流程");
    expect(lead.status).toBe("new");
    expect(lead.createdAt).toBe("2026-09-01T08:30:00.000Z");
  });

  it("字符串日期兼容", () => {
    const lead2 = mapLeadForMemberView({ ...ROW, created_at: "2026-09-01T08:30:00Z" });
    expect(lead2.createdAt).toBe("2026-09-01T08:30:00.000Z");
  });
});

describe("mapUngmAppointmentRow（内部全量视图，行为不变）", () => {
  it("完整解析含跟进日志", () => {
    const lead = mapUngmAppointmentRow(ROW);
    expect(lead.contactPerson).toBe("李大明");
    expect(lead.contactMethod).toBe("13812345678");
    expect(lead.followUpLogs).toHaveLength(1);
    expect(lead.followUpLogs?.[0]).toMatchObject({ content: "已电话联系", author: "13887654321" });
  });
});
