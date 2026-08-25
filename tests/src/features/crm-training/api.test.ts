/**
 * src/features/crm/api.ts + training/api.ts 测试
 * 覆盖 fetchLeads, fetchCertifications, fetchIndustries, fetchSubIndustries,
 * submitTrainingRegister, fetchLandingData, createTrainingOrder,
 * fetchTrainingOrderStatus, mockPayTrainingOrder,
 * saveTrainingParticipants, fetchTrainingParticipants
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiMock = vi.fn();
vi.mock("@/core/http", () => ({
  api: (...args: any[]) => apiMock(...args),
}));

// ── crm/api.ts ──
import { fetchLeads } from "@/features/crm/api";

describe("fetchLeads", () => {
  beforeEach(() => apiMock.mockReset());

  it("GET /api/leads", async () => {
    apiMock.mockResolvedValue([]);
    await fetchLeads();
    expect(apiMock).toHaveBeenCalledWith("/api/leads");
  });
});

// ── training/api.ts ──
import {
  fetchCertifications,
  fetchIndustries,
  fetchSubIndustries,
  submitTrainingRegister,
  fetchLandingData,
  createTrainingOrder,
  fetchTrainingOrderStatus,
  mockPayTrainingOrder,
  saveTrainingParticipants,
  fetchTrainingParticipants,
} from "@/features/training/api";

describe("fetchCertifications", () => {
  it("GET /api/certifications", async () => {
    apiMock.mockResolvedValue([]);
    await fetchCertifications();
    expect(apiMock).toHaveBeenCalledWith("/api/certifications");
  });
});

describe("fetchIndustries", () => {
  it("GET /api/unspsc/industries", async () => {
    apiMock.mockResolvedValue([]);
    await fetchIndustries();
    expect(apiMock).toHaveBeenCalledWith("/api/unspsc/industries");
  });
});

describe("fetchSubIndustries", () => {
  it("GET /api/unspsc/children?parent_id=xxx", async () => {
    apiMock.mockResolvedValue([]);
    await fetchSubIndustries(42);
    expect(apiMock).toHaveBeenCalledWith("/api/unspsc/children?parent_id=42");
  });
});

describe("submitTrainingRegister", () => {
  it("POST /api/training/register", async () => {
    apiMock.mockResolvedValue({ success: true, id: 1 });
    const form = {
      company_name: "Test", industry_id: 1, main_product: "A",
      export_experience: "5", certification: "ISO", contact_name: "X",
      position: "CEO", telephone: "123", email: "x@y.com", remark: "",
    };
    await submitTrainingRegister(form);
    expect(apiMock).toHaveBeenCalledWith("/api/training/register", expect.objectContaining({
      method: "POST",
    }));
  });
});

describe("fetchLandingData", () => {
  it("GET /api/training/landing", async () => {
    apiMock.mockResolvedValue({ course: null, schedules: [] });
    await fetchLandingData();
    expect(apiMock).toHaveBeenCalledWith("/api/training/landing");
  });
});

describe("createTrainingOrder", () => {
  it("POST /api/training/orders", async () => {
    apiMock.mockResolvedValue({ success: true, order_no: "ORD-001" });
    await createTrainingOrder({ course_id: 1, provider: "alipay" });
    expect(apiMock).toHaveBeenCalledWith("/api/training/orders", expect.objectContaining({
      method: "POST",
    }));
  });
});

describe("fetchTrainingOrderStatus", () => {
  it("GET /api/training/orders/:orderNo", async () => {
    apiMock.mockResolvedValue({ order_no: "ORD-001", status: "paid" });
    await fetchTrainingOrderStatus("ORD-001");
    expect(apiMock).toHaveBeenCalledWith("/api/training/orders/ORD-001");
  });
});

describe("mockPayTrainingOrder", () => {
  it("POST /api/training/orders/:orderNo/mock-paid", async () => {
    apiMock.mockResolvedValue({ success: true, status: "paid" });
    await mockPayTrainingOrder("ORD-001");
    expect(apiMock).toHaveBeenCalledWith(
      "/api/training/orders/ORD-001/mock-paid",
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("saveTrainingParticipants", () => {
  it("POST /api/training/orders/:orderNo/participants", async () => {
    apiMock.mockResolvedValue({ success: true });
    const participants = [{ participant_no: 1, full_name: "张三" }];
    await saveTrainingParticipants("ORD-001", participants);
    expect(apiMock).toHaveBeenCalledWith(
      "/api/training/orders/ORD-001/participants",
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("fetchTrainingParticipants", () => {
  it("GET /api/training/orders/:orderNo/participants", async () => {
    apiMock.mockResolvedValue({ success: true, participants: [] });
    await fetchTrainingParticipants("ORD-001");
    expect(apiMock).toHaveBeenCalledWith("/api/training/orders/ORD-001/participants");
  });
});
