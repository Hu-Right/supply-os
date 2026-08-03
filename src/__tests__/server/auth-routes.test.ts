// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createAuthRouter } from "../../../server/routes/auth.routes";
import { UsersRepo } from "../../../server/repos/users.repo";
import { MembershipRepo } from "../../../server/repos/membership.repo";
import { SuppliersRepo } from "../../../server/repos/suppliers.repo";

function createMockCtx(queryResults: any[] = []) {
  let callIndex = 0;
  const dbPool = {
    query: vi.fn().mockImplementation(() => {
      const result = queryResults[callIndex] ?? [[]];
      callIndex++;
      return Promise.resolve([result]);
    }),
    execute: vi.fn().mockResolvedValue([]),
  };
  return {
    dbPool,
    usersRepo: new UsersRepo(dbPool as any),
    membershipRepo: new MembershipRepo(dbPool as any),
    suppliersRepo: new SuppliersRepo(dbPool as any),
  };
}

function buildApp(ctx: any) {
  const app = express();
  app.use(express.json());
  app.use(createAuthRouter(ctx as any));
  return app;
}

// ─── POST /api/auth/register ────────────────────────────────────────────────
describe("POST /api/auth/register", () => {
  it("returns 400 when email missing", async () => {
    const app = buildApp(createMockCtx());
    const res = await request(app).post("/api/auth/register").send({ password: "123456" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("邮箱和密码不能为空");
  });

  it("returns 400 when password too short", async () => {
    const app = buildApp(createMockCtx());
    const res = await request(app).post("/api/auth/register").send({ email: "a@b.com", password: "123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("密码至少 6 位");
  });

  it("registers successfully with valid data", async () => {
    const ctx = createMockCtx();
    const app = buildApp(ctx);
    const res = await request(app).post("/api/auth/register").send({
      email: "Test@Example.COM",
      password: "secure123",
      display_name: "Tester",
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user.user_key).toBe("test@example.com");
    expect(res.body.user.membership_tier).toBe("free");
    expect(ctx.dbPool.execute).toHaveBeenCalledTimes(1);
  });

  it("uses email prefix as default display_name", async () => {
    const ctx = createMockCtx();
    const app = buildApp(ctx);
    const res = await request(app).post("/api/auth/register").send({
      email: "john@test.com",
      password: "123456",
    });
    expect(res.body.user.display_name).toBe("john");
  });
});

// ─── POST /api/auth/login ───────────────────────────────────────────────────
describe("POST /api/auth/login", () => {
  it("returns 401 for wrong password", async () => {
    const ctx = createMockCtx([[{
      user_key: "a@b.com",
      email: "a@b.com",
      display_name: "A",
      password_hash: "wrong_hash",
      membership_tier: "free",
      account_status: "active",
      supplier_id: null,
      supplier_link_status: null,
    }]]);
    const app = buildApp(ctx);
    const res = await request(app).post("/api/auth/login").send({ email: "a@b.com", password: "test" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for disabled account", async () => {
    // hashPassword("pass123") produces a known hash
    const crypto = await import("crypto");
    const hash = crypto.createHash("sha256").update("pass123").digest("hex");
    const ctx = createMockCtx([[{
      user_key: "a@b.com",
      email: "a@b.com",
      display_name: "A",
      password_hash: hash,
      membership_tier: "free",
      account_status: "disabled",
      supplier_id: null,
      supplier_link_status: null,
    }]]);
    const app = buildApp(ctx);
    const res = await request(app).post("/api/auth/login").send({ email: "a@b.com", password: "pass123" });
    expect(res.status).toBe(403);
  });

  it("logs in successfully and returns vip tier with active subscription", async () => {
    const crypto = await import("crypto");
    const hash = crypto.createHash("sha256").update("pass123").digest("hex");
    const ctx = createMockCtx([
      // user query
      [{
        user_key: "a@b.com",
        email: "a@b.com",
        display_name: "A",
        password_hash: hash,
        membership_tier: "free",
        account_status: "active",
        supplier_id: null,
        supplier_link_status: null,
      }],
      // subscription query
      [{ id: 1 }],
    ]);
    const app = buildApp(ctx);
    const res = await request(app).post("/api/auth/login").send({ email: "a@b.com", password: "pass123" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.membership_tier).toBe("vip");
  });

  it("returns supplier info when linked and verified", async () => {
    const crypto = await import("crypto");
    const hash = crypto.createHash("sha256").update("pass123").digest("hex");
    const ctx = createMockCtx([
      [{
        user_key: "a@b.com",
        email: "a@b.com",
        display_name: "A",
        password_hash: hash,
        membership_tier: "free",
        account_status: "active",
        supplier_id: 5,
        supplier_link_status: "verified",
      }],
      [], // no subscription
      [{ id: 5, industry_id: 10, industry: "制造业" }], // supplier
    ]);
    const app = buildApp(ctx);
    const res = await request(app).post("/api/auth/login").send({ email: "a@b.com", password: "pass123" });
    expect(res.body.user.supplier_id).toBe(5);
    expect(res.body.user.supplier_industry).toBe("制造业");
  });
});

// ─── GET /api/auth/user ─────────────────────────────────────────────────────
describe("GET /api/auth/user", () => {
  it("returns 400 when user_key missing", async () => {
    const app = buildApp(createMockCtx());
    const res = await request(app).get("/api/auth/user");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("USER_REQUIRED");
  });

  it("returns 404 when user not found", async () => {
    const ctx = createMockCtx([[]]);
    const app = buildApp(ctx);
    const res = await request(app).get("/api/auth/user?user_key=ghost@test.com");
    expect(res.status).toBe(404);
  });

  it("returns user profile with tier upgrade from subscription", async () => {
    const ctx = createMockCtx([
      [{
        user_key: "a@b.com",
        email: "a@b.com",
        display_name: "User A",
        membership_tier: "free",
        account_status: "active",
        supplier_id: null,
        supplier_link_status: null,
      }],
      [{ id: 1 }], // active subscription
    ]);
    const app = buildApp(ctx);
    const res = await request(app).get("/api/auth/user?user_key=a@b.com");
    expect(res.status).toBe(200);
    expect(res.body.user.membership_tier).toBe("vip");
  });

  it("normalizes user_key (trim + lowercase)", async () => {
    const ctx = createMockCtx([
      [{
        user_key: "upper@test.com",
        email: "upper@test.com",
        display_name: "U",
        membership_tier: "free",
        account_status: "active",
        supplier_id: null,
        supplier_link_status: null,
      }],
      [],
    ]);
    const app = buildApp(ctx);
    const res = await request(app).get("/api/auth/user?user_key=%20UPPER@TEST.COM%20");
    expect(res.status).toBe(200);
    // Verify the query was called with normalized key
    expect(ctx.dbPool.query.mock.calls[0][1]).toEqual(["upper@test.com"]);
  });
});
