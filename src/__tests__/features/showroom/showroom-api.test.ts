import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { submitShowroomRegister } from "@/features/showroom/api";
import { server } from "@/__tests__/mocks/server";

describe("Showroom API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submitShowroomRegister sends POST request", async () => {
    server.use(
      http.post("/api/showroom/register", () =>
        HttpResponse.json({ success: true })
      )
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

    expect(result).toEqual({ success: true });
  });

  it("submitShowroomRegister handles failure", async () => {
    server.use(
      http.post("/api/showroom/register", () =>
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
