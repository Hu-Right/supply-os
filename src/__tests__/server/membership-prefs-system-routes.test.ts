// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { Router } from "express";
import { createMembershipRouter } from "../../../server/routes/membership.routes";
import { createUserPrefsRouter } from "../../../server/routes/user-prefs.routes";
import { createSystemRouter } from "../../../server/routes/system.routes";

function createPool(queryResults: any[] = []) {
  let callIndex = 0;
  return {
    query: vi.fn().mockImplementation(() => {
      const result = queryResults[callIndex] ?? [];
      callIndex++;
      return Promise.resolve([result]);
    }),
    execute: vi.fn().mockResolvedValue([{}]),
  } as any;
}

function buildApp(createRouter: (ctx: any) => Router, dbPool: any) {
  const app = express();
  app.use(express.json());
  app.use(createRouter({ dbPool } as any));
  return app;
}

// ─── GET /api/membership/plans ──────────────────────────────────────────────
describe("GET /api/membership/plans", () => {
  it("returns active plan rows directly", async () => {
    const plans = [
      { plan_code: "free", name: "免费版", price: 0 },
      { plan_code: "annual", name: "年度会员", price: 5600 },
    ];
    const app = buildApp(createMembershipRouter, createPool([plans]));
    const res = await request(app).get("/api/membership/plans");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(plans);
  });

  it("returns 500 when db fails", async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error("boom")), execute: vi.fn() } as any;
    const app = buildApp(createMembershipRouter, pool);
    const res = await request(app).get("/api/membership/plans");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("boom");
  });
});

// ─── GET /api/membership/status ─────────────────────────────────────────────
describe("GET /api/membership/status", () => {
  it("returns 400 USER_REQUIRED without user_key", async () => {
    const app = buildApp(createMembershipRouter, createPool());
    const res = await request(app).get("/api/membership/status");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("USER_REQUIRED");
  });

  it("computes vip tier when active subscription exists", async () => {
    const pool = createPool([
      [{ free_quota: 5 }], // free plan quota
      [{ total: 2 }], // free used
      [{ plan_code: "annual", status: "active" }], // active subs
      [{ total: 4 }], // paid unlocks
      [], // entitlements
    ]);
    const app = buildApp(createMembershipRouter, pool);
    const res = await request(app).get("/api/membership/status?user_key=UK_One");
    expect(res.status).toBe(200);
    expect(res.body.user_key).toBe("uk_one"); // normalizeUserKey lowercases
    expect(res.body.membership_tier).toBe("vip");
    expect(res.body.free_quota).toBe(5);
    expect(res.body.free_used).toBe(2);
    expect(res.body.free_remaining).toBe(3);
    expect(res.body.paid_unlocks).toBe(4);
    expect(res.body.active_subscriptions).toHaveLength(1);
  });

  it("computes vip tier from remaining entitlement quota", async () => {
    const pool = createPool([
      [{ free_quota: 3 }],
      [{ total: 0 }],
      [], // no active subscription
      [{ total: 1 }],
      [{ quota_total: 10, quota_used: 3, quota_remaining: 7 }],
    ]);
    const app = buildApp(createMembershipRouter, pool);
    const res = await request(app).get("/api/membership/status?user_key=vip@x.com");
    expect(res.body.membership_tier).toBe("vip");
    expect(res.body.paid_quota_total).toBe(10);
    expect(res.body.paid_quota_used).toBe(3);
    expect(res.body.paid_quota_remaining).toBe(7);
  });

  it("defaults free_quota to 3 and floors free_remaining at 0", async () => {
    const pool = createPool([
      [], // no free plan row → default quota 3
      [{ total: 9 }], // used exceeds quota
      [],
      [{ total: 0 }],
      [],
    ]);
    const app = buildApp(createMembershipRouter, pool);
    const res = await request(app).get("/api/membership/status?user_key=free@x.com");
    expect(res.body.membership_tier).toBe("free");
    expect(res.body.free_quota).toBe(3);
    expect(res.body.free_used).toBe(9);
    expect(res.body.free_remaining).toBe(0);
    expect(res.body.paid_quota_remaining).toBe(0);
  });
});

// ─── GET/POST /api/user/industry-prefs ──────────────────────────────────────
describe("user industry prefs", () => {
  it("GET returns 400 without user_key", async () => {
    const app = buildApp(createUserPrefsRouter, createPool());
    const res = await request(app).get("/api/user/industry-prefs");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("USER_REQUIRED");
  });

  it("GET returns stored prefs row", async () => {
    const prefs = { level1_id: 1, level2_id: null, level3_id: null, level4_id: null, level5_id: null };
    const app = buildApp(createUserPrefsRouter, createPool([[prefs]]));
    const res = await request(app).get("/api/user/industry-prefs?user_key=u1");
    expect(res.status).toBe(200);
    expect(res.body.prefs).toEqual(prefs);
  });

  it("GET returns prefs null when no row", async () => {
    const app = buildApp(createUserPrefsRouter, createPool([[]]));
    const res = await request(app).get("/api/user/industry-prefs?user_key=u1");
    expect(res.body.prefs).toBeNull();
  });

  it("POST returns 400 without user_key", async () => {
    const app = buildApp(createUserPrefsRouter, createPool());
    const res = await request(app).post("/api/user/industry-prefs").send({ level1_id: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("USER_REQUIRED");
  });

  it("POST clears prefs when level1 empty (DELETE)", async () => {
    const pool = createPool();
    const app = buildApp(createUserPrefsRouter, pool);
    const res = await request(app).post("/api/user/industry-prefs").send({ user_key: "U1", level1_id: 0 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, cleared: true });
    expect(pool.execute).toHaveBeenCalledTimes(1);
    expect(String(pool.execute.mock.calls[0][0])).toContain("DELETE FROM crm_user_industry_prefs");
    expect(pool.execute.mock.calls[0][1]).toEqual(["u1"]);
  });

  it("POST upserts valid levels and nulls invalid values", async () => {
    const pool = createPool();
    const app = buildApp(createUserPrefsRouter, pool);
    const res = await request(app)
      .post("/api/user/industry-prefs")
      .send({ user_key: "u2", level1_id: 11, level2_id: "22", level3_id: -5, level4_id: "abc" });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true });
    expect(String(pool.execute.mock.calls[0][0])).toContain("ON DUPLICATE KEY UPDATE");
    expect(pool.execute.mock.calls[0][1]).toEqual(["u2", 11, 22, null, null, null]);
  });
});

// ─── GET /api/system/* ───────────────────────────────────────────────────────
describe("system routes", () => {
  it("icp returns bah from system table", async () => {
    const app = buildApp(createSystemRouter, createPool([[{ bah: "京ICP备00000000号" }]]));
    const res = await request(app).get("/api/system/icp");
    expect(res.status).toBe(200);
    expect(res.body.bah).toBe("京ICP备00000000号");
  });

  it("icp falls back to empty bah when query fails", async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error("no table")), execute: vi.fn() } as any;
    const app = buildApp(createSystemRouter, pool);
    const res = await request(app).get("/api/system/icp");
    expect(res.status).toBe(200);
    expect(res.body.bah).toBe("");
  });

  it("version sets no-cache headers and returns a version string", async () => {
    const app = buildApp(createSystemRouter, createPool());
    const res = await request(app).get("/api/system/version");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-cache, no-store, must-revalidate");
    expect(typeof res.body.version).toBe("string");
    expect(res.body.version.length).toBeGreaterThan(0);
  });
});
