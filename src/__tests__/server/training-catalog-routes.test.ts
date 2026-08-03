// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import type { Router } from "express";
import { createTrainingRouter } from "../../../server/routes/training.routes";
import { createCatalogRouter } from "../../../server/routes/catalog.routes";
import { translateViaChain } from "../../../server/services/translation/chain";

vi.mock("../../../server/services/translation/chain", () => ({
  translateViaChain: vi.fn(),
}));

function buildApp(createRouter: (ctx: any) => Router, dbPool: any) {
  const app = express();
  app.use(express.json());
  app.use(createRouter({ dbPool } as any));
  return app;
}

// SQL 内容路由 pool：按语句内容返回不同结果
function createRoutingPool(handler: (sql: string, params: any[]) => any) {
  return {
    query: vi.fn(async (sql: any, params: any[] = []) => [handler(String(sql), params)]),
    execute: vi.fn().mockResolvedValue([{}]),
  } as any;
}

beforeEach(() => {
  vi.mocked(translateViaChain).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── POST /api/training/register ────────────────────────────────────────────
describe("POST /api/training/register", () => {
  it("returns 400 when required fields missing", async () => {
    const pool = { query: vi.fn(), execute: vi.fn() } as any;
    const app = buildApp(createTrainingRouter, pool);
    const res = await request(app).post("/api/training/register").send({ company_name: "A公司" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("企业名称、参会人姓名、手机号码为必填项");
  });

  it("registers without industry lookup when industry_id absent", async () => {
    const pool = {
      query: vi.fn(),
      execute: vi.fn().mockResolvedValue([{ insertId: 77 }]),
    } as any;
    const app = buildApp(createTrainingRouter, pool);
    const res = await request(app).post("/api/training/register").send({
      company_name: "测试机械公司",
      contact_name: "张三",
      telephone: "13800000000",
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, id: 77, message: "研修班报名信息已提交" });
    expect(pool.query).not.toHaveBeenCalled();
    const [sql, params] = pool.execute.mock.calls[0];
    expect(String(sql)).toContain("INSERT INTO crm_training_registrations");
    expect(params.slice(0, 3)).toEqual(["测试机械公司", null, ""]);
  });

  it("resolves industry name from title_zh with title fallback", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 9, code: "10", title: "Machinery", title_zh: "机械", level: 1 }]])
        .mockResolvedValueOnce([[{ id: 10, code: "11", title: "Steel", title_zh: "", level: 1 }]]),
      execute: vi.fn().mockResolvedValue([{ insertId: 1 }]),
    } as any;
    const app = buildApp(createTrainingRouter, pool);
    const base = { company_name: "A", contact_name: "B", telephone: "138" };

    await request(app).post("/api/training/register").send({ ...base, industry_id: 9 });
    expect(pool.execute.mock.calls[0][1][2]).toBe("机械");

    await request(app).post("/api/training/register").send({ ...base, industry_id: 10 });
    expect(pool.execute.mock.calls[1][1][2]).toBe("Steel");
  });

  it("returns 500 when insert fails", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const pool = { query: vi.fn(), execute: vi.fn().mockRejectedValue(new Error("db down")) } as any;
    const app = buildApp(createTrainingRouter, pool);
    const res = await request(app).post("/api/training/register").send({
      company_name: "A",
      contact_name: "B",
      telephone: "138",
    });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("提交失败，请稍后重试");
    expect(errSpy).toHaveBeenCalled();
  });
});

// ─── 研修班下载计数 ──────────────────────────────────────────────────────────
describe("training download tracking", () => {
  it("increments counter per material and exposes stats", async () => {
    const app = buildApp(createTrainingRouter, createRoutingPool(() => []));
    const first = await request(app)
      .post("/api/training/downloads/track")
      .send({ material_id: "m1", file_name: "a.docx" });
    expect(first.body).toEqual({ success: true, material_id: "m1", total: 1 });

    const second = await request(app).post("/api/training/downloads/track").send({ material_id: "m1" });
    expect(second.body.total).toBe(2);

    const stats = await request(app).get("/api/training/downloads/stats");
    expect(stats.body).toEqual({ m1: 2 });
  });

  it("returns 400 when material_id missing", async () => {
    const app = buildApp(createTrainingRouter, createRoutingPool(() => []));
    const res = await request(app).post("/api/training/downloads/track").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("material_id required");
  });
});

// ─── GET /api/certifications ────────────────────────────────────────────────
describe("GET /api/certifications", () => {
  it("returns active certification rows", async () => {
    const rows = [{ id: 1, name: "ISO9001" }];
    const pool = createRoutingPool(() => rows);
    const app = buildApp(createCatalogRouter, pool);
    const res = await request(app).get("/api/certifications");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
  });
});

// ─── GET /api/unspsc/industries ─────────────────────────────────────────────
describe("GET /api/unspsc/industries", () => {
  it("uses plain query without translations for default lang", async () => {
    const rows = [{ id: 1, title_zh: "机械", title: "Machinery", code: "10", parent_id: null, level: 1 }];
    const pool = createRoutingPool((sql) => {
      expect(sql).not.toContain("LEFT JOIN crm_unspsc_translations");
      return rows;
    });
    const app = buildApp(createCatalogRouter, pool);
    const res = await request(app).get("/api/unspsc/industries");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
    expect(translateViaChain).not.toHaveBeenCalled();
  });

  it("joins translations for lang=fr and backfills missing rows", async () => {
    vi.mocked(translateViaChain).mockResolvedValue({
      translations: ["Machinerie"],
      provider: "chain-test",
    } as any);
    const rows = [
      { id: 1, title_zh: "机械", title: "Machinery", code: "10", parent_id: null, level: 1, title_i18n: null },
    ];
    const pool = createRoutingPool((sql, params) => {
      if (sql.includes("LEFT JOIN crm_unspsc_translations")) {
        expect(params[0]).toBe("fr");
        return rows;
      }
      return [];
    });
    const app = buildApp(createCatalogRouter, pool);
    const res = await request(app).get("/api/unspsc/industries?lang=fr");
    expect(res.status).toBe(200);
    expect(res.body[0].title_i18n).toBeNull();

    // fire-and-forget 后台补翻：翻译链成功后写入缓存表
    await vi.waitFor(() => {
      const insertCall = pool.query.mock.calls.find(([sql]) =>
        String(sql).startsWith("INSERT INTO crm_unspsc_translations")
      );
      expect(insertCall).toBeTruthy();
      expect(insertCall![1]).toEqual([1, "fr", "Machinerie", "chain-test"]);
    });
  });

  it("skips backfill when all rows already translated", async () => {
    const rows = [
      { id: 1, title_zh: "机械", title: "Machinery", code: "10", parent_id: null, level: 1, title_i18n: "Machinerie" },
    ];
    const pool = createRoutingPool(() => rows);
    const app = buildApp(createCatalogRouter, pool);
    const res = await request(app).get("/api/unspsc/industries?lang=ru");
    expect(res.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(translateViaChain).not.toHaveBeenCalled();
  });
});

// ─── GET /api/unspsc/children ───────────────────────────────────────────────
describe("GET /api/unspsc/children", () => {
  it("returns 400 when parent_id missing", async () => {
    const app = buildApp(createCatalogRouter, createRoutingPool(() => []));
    const res = await request(app).get("/api/unspsc/children");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("parent_id is required");
  });

  it("queries children by parent_id", async () => {
    const rows = [{ id: 2, title_zh: "农业机械", title: "Ag machinery", code: "1010", parent_id: 1, level: 2 }];
    const pool = createRoutingPool((_sql, params) => {
      expect(params).toEqual([1]);
      return rows;
    });
    const app = buildApp(createCatalogRouter, pool);
    const res = await request(app).get("/api/unspsc/children?parent_id=1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
  });
});

// ─── GET /api/unspsc/search ─────────────────────────────────────────────────
describe("GET /api/unspsc/search", () => {
  it("returns [] for queries shorter than 2 chars without hitting db", async () => {
    const pool = createRoutingPool(() => []);
    const app = buildApp(createCatalogRouter, pool);
    const res = await request(app).get("/api/unspsc/search?q=s");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("builds LIKE params for valid query", async () => {
    const pool = createRoutingPool((_sql, params) => {
      expect(params).toEqual(["steel%", "%steel%", "%steel%"]);
      return [{ id: 3, code: "3010", title: "Steel" }];
    });
    const app = buildApp(createCatalogRouter, pool);
    const res = await request(app).get("/api/unspsc/search?q=steel");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
