import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { submitShowroomRegister } from "@/features/showroom/api";
import { server } from "@/__tests__/mocks/server";

describe("Showroom API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submitShowroomRegister posts lead to /api/leads with exhibition_register type", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    server.use(
      http.post("/api/leads", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "lead-user-1", companyName: "Test Corp" });
      })
    );

    const result = await submitShowroomRegister({
      companyName: "Test Corp",
      country: "China",
      city: "Shanghai",
      contactPerson: "John",
      contactMethod: "13800138000",
      email: "john@test.com",
      industry: "Machinery",
      mainProducts: "CNC",
      has国际公共采购Participation: false,
      notes: "Test notes",
    });

    expect(result).toEqual({ id: "lead-user-1", companyName: "Test Corp" });
    expect(capturedBody).toMatchObject({
      companyName: "Test Corp",
      contactPerson: "John",
      contactMethod: "13800138000",
      type: "exhibition_register",
    });
  });

  it("submitShowroomRegister handles failure", async () => {
    server.use(
      http.post("/api/leads", () =>
        HttpResponse.json({ error: "Invalid data" }, { status: 400 })
      )
    );

    await expect(
      submitShowroomRegister({
        companyName: "",
        country: "",
        city: "",
        contactPerson: "",
        contactMethod: "",
        email: "",
        industry: "",
        mainProducts: "",
        has国际公共采购Participation: false,
        notes: "",
      })
    ).rejects.toThrow();
  });
});
