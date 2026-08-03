import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { fetchPlans } from "@/features/membership/api";
import { server } from "@/__tests__/mocks/server";

const samplePlans = [
  {
    plan_code: "single",
    name: "单条解锁",
    price: 89,
    currency: "CNY",
    plan_type: "single",
  },
  {
    plan_code: "annual",
    name: "年度会员",
    price: 5600,
    currency: "CNY",
    duration_days: 1095,
    unlock_quota: 365,
    plan_type: "subscription",
  },
];

describe("Membership API", () => {
  it("fetchPlans returns the active plan list", async () => {
    server.use(
      http.get("/api/membership/plans", () => HttpResponse.json(samplePlans))
    );

    const plans = await fetchPlans();
    expect(plans).toHaveLength(2);
    expect(plans[0].plan_code).toBe("single");
    expect(plans[1].price).toBe(5600);
  });

  it("fetchPlans returns an empty array when no active plans", async () => {
    server.use(
      http.get("/api/membership/plans", () => HttpResponse.json([]))
    );
    await expect(fetchPlans()).resolves.toEqual([]);
  });

  it("fetchPlans throws on server error", async () => {
    server.use(
      http.get("/api/membership/plans", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 })
      )
    );
    await expect(fetchPlans()).rejects.toThrow();
  });
});
