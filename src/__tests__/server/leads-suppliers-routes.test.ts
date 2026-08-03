// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createLeadsRouter } from "../../../server/routes/leads.routes";
import { createSuppliersRouter } from "../../../server/routes/suppliers.routes";
import { translateViaChain } from "../../../server/services/translation/chain";
import type { Lead } from "../../types";

vi.mock("../../../server/services/translation/chain", () => ({
  translateViaChain: vi.fn(),
}));

// SQL 内容路由 pool：按语句内容返回不同结果（INSERT 返回 ResultSetHeader 形状）
function createRoutingPool(handler: (sql: string, params: any[]) => any) {
  return {
    query: vi.fn(async (sql: any, params: any[] = []) => [handler(String(sql), params)]),
    execute: vi.fn().mockResolvedValue([{}]),
  } as any;
}

function buildLeadsApp(dbPool: any, leadsDb: Lead[]) {
  const app = express();
  app.use(express.json());
  app.use(createLeadsRouter({ dbPool, leadsDb } as any));
  return app;
}

function buildSuppliersApp(dbPool: any, leadsDb: Lead[]) {
  const app = express();
  app.use(express.json());
  app.use(createSuppliersRouter({ dbPool, leadsDb } as any));
  return app;
}

const appointmentRow = {
  appointment_key: "apt-1",
  company_name: "德国咨询客户",
  country: "",
  city: "",
  contact_person: "Max",
  contact_method: "max@x.de",
  email: "",
  industry: "",
  consultation_needs: "采购咨询",
  status: "",
  follow_up_logs: '[{"date":"2026-07-01 10:00","content":"hi","author":"Op"}]',
  created_at: "2026-07-01T09:00:00.000Z",
};

const memoryLead: Lead = {
  id: "lead-mem-1",
  companyName: "内存线索",
  country: "中国",
  city: "北京",
  contactPerson: "李四",
  contactMethod: "13900000000",
  email: "",
  industry: "机械",
  mainProducts: "",
  has国际公共采购Participation: false,
  notes: "",
  type: "custom",
  status: "new",
  createdAt: "2026-07-02T00:00:00.000Z",
  followUpLogs: [],
};

beforeEach(() => {
  vi.mocked(translateViaChain).mockReset();
});

// ─── GET /api/leads ─────────────────────────────────────────────────────────
describe("GET /api/leads", () => {
  it("merges DB appointments with in-memory leads and dedupes by id", async () => {
    const dupLead = { ...memoryLead, id: "apt-1" };
    const leadsDb: Lead[] = [dupLead, { ...memoryLead }];
    const pool = createRoutingPool(() => [appointmentRow]);
    const app = buildLeadsApp(pool, leadsDb);
    const res = await request(app).get("/api/leads");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const [dbLead, memLead] = res.body;
    expect(dbLead.id).toBe("apt-1");
    expect(dbLead.country).toBe("China"); // mapUngmAppointmentRow 默认值
    expect(dbLead.industry).toBe("Services");
    expect(dbLead.type).toBe("consulting_advisor");
    expect(dbLead.followUpLogs).toHaveLength(1);
    expect(memLead.id).toBe("lead-mem-1");
  });
});

// ─── POST /api/leads ────────────────────────────────────────────────────────
describe("POST /api/leads", () => {
  it("returns 400 when required fields missing", async () => {
    const app = buildLeadsApp(createRoutingPool(() => []), []);
    const res = await request(app).post("/api/leads").send({ companyName: "A" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Missing required fields");
  });

  it("creates a custom lead with defaults and unshifts into memory store", async () => {
    const leadsDb: Lead[] = [];
    const pool = createRoutingPool(() => []);
    const app = buildLeadsApp(pool, leadsDb);
    const res = await request(app)
      .post("/api/leads")
      .send({ companyName: "新线索公司", contactPerson: "王五", contactMethod: "13911112222" });
    expect(res.status).toBe(201);
    expect(res.body.companyName).toBe("新线索公司");
    expect(res.body.country).toBe("China");
    expect(res.body.city).toBe("Unknown");
    expect(res.body.type).toBe("custom");
    expect(res.body.status).toBe("new");
    expect(res.body.followUpLogs[0].content).toContain("custom");
    expect(leadsDb).toHaveLength(1);
    expect(pool.execute).not.toHaveBeenCalled();
  });

  it("persists consulting_advisor leads into ungm_1v1_appointments", async () => {
    const leadsDb: Lead[] = [];
    const pool = createRoutingPool(() => []);
    const app = buildLeadsApp(pool, leadsDb);
    const res = await request(app)
      .post("/api/leads")
      .send({
        companyName: "咨询客户",
        contactPerson: "赵六",
        contactMethod: "zhao@x.com",
        type: "consulting_advisor",
        notes: "需要咨询",
      });
    expect(res.status).toBe(201);
    expect(pool.execute).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.execute.mock.calls[0];
    expect(String(sql)).toContain("INSERT INTO ungm_1v1_appointments");
    expect(params[0]).toBe(res.body.id); // appointment_key = lead.id
    expect(params[8]).toBe("需要咨询"); // consultation_needs
  });
});

// ─── POST /api/leads/log ────────────────────────────────────────────────────
describe("POST /api/leads/log", () => {
  it("returns 400 when leadId or content missing", async () => {
    const app = buildLeadsApp(createRoutingPool(() => []), []);
    const res = await request(app).post("/api/leads/log").send({ leadId: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Missing leadId or content log parameter");
  });

  it("appends log and updates status for in-memory lead", async () => {
    const lead = { ...memoryLead };
    const pool = createRoutingPool(() => []);
    const app = buildLeadsApp(pool, [lead]);
    const res = await request(app)
      .post("/api/leads/log")
      .send({ leadId: "lead-mem-1", content: "已跟进", nextStatus: "contacted" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("contacted");
    expect(res.body.followUpLogs.at(-1).content).toBe("已跟进");
    expect(res.body.followUpLogs.at(-1).author).toBe("Operator");
    expect(pool.execute).not.toHaveBeenCalled(); // 非 consulting_advisor 不回写 DB
  });

  it("writes back to DB for persisted consulting_advisor lead", async () => {
    const pool = createRoutingPool((sql) => {
      if (sql.includes("WHERE appointment_key")) return [appointmentRow];
      return [];
    });
    const app = buildLeadsApp(pool, []);
    const res = await request(app)
      .post("/api/leads/log")
      .send({ leadId: "apt-1", content: "DB 跟进", author: "Admin" });
    expect(res.status).toBe(200);
    expect(res.body.followUpLogs).toHaveLength(2);
    expect(pool.execute).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.execute.mock.calls[0];
    expect(String(sql)).toContain("UPDATE ungm_1v1_appointments SET follow_up_logs");
    expect(JSON.parse(params[0]).at(-1).content).toBe("DB 跟进");
    expect(params[1]).toBe("new"); // 未指定 nextStatus 保持原状态
    expect(params[2]).toBe("apt-1");
  });

  it("returns 404 when lead not found anywhere", async () => {
    const pool = createRoutingPool(() => []);
    const app = buildLeadsApp(pool, []);
    const res = await request(app).post("/api/leads/log").send({ leadId: "ghost", content: "x" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Lead not found");
  });
});

// ─── GET /api/suppliers ─────────────────────────────────────────────────────
const supplierRow = {
  id: 1,
  company: "苏州测试机械有限公司",
  country: "中国",
  country_code: "CN",
  province: "江苏",
  city: "苏州",
  contact: "张三",
  phone: "13800000000",
  email: "zhang@test.com",
  products: "机床, 加工中心",
  industry: "机械",
  type: "domestic",
};

describe("GET /api/suppliers", () => {
  it("maps rows to DTO with masked contact info (zh)", async () => {
    const pool = createRoutingPool(() => [supplierRow]);
    const app = buildSuppliersApp(pool, []);
    const res = await request(app).get("/api/suppliers");
    expect(res.status).toBe(200);
    const [dto] = res.body;
    expect(dto.id).toBe("sup-db-1");
    expect(dto.nameZh).toBe("苏州测试机械有限公司");
    expect(dto.nameEn).toBe("苏州测试机械有限公司"); // 公司名不翻译
    expect(dto.industryZh).toBe("机械");
    expect(dto.mainProductsZh).toEqual(["机床", "加工中心"]);
    expect(dto.cityZh).toBe("苏州");
    expect(dto.contactPhone).toBe("138****0000");
    expect(dto.contactEmail).toBe("zh***@test.com");
    expect(dto.status).toBe("approved");
    expect(pool.query).toHaveBeenCalledTimes(1); // zh 无译文查询
  });

  it("applies cached translations for lang=en and backfills missing ones", async () => {
    vi.mocked(translateViaChain).mockResolvedValue({
      translations: ["Machinery EN", "Machine tools EN"],
      provider: "chain-test",
    } as any);
    const supplier2 = { ...supplierRow, id: 2, company: "未翻译公司" };
    const pool = createRoutingPool((sql, params) => {
      if (sql.includes("FROM supplier") && sql.includes("ORDER BY id DESC")) return [supplierRow, supplier2];
      if (sql.includes("FROM crm_supplier_translations")) {
        expect(params[0]).toBe("en");
        return [
          { supplier_id: 1, industry_tr: "Machinery", main_products_tr: "Machine tools, Machining centers", certification_tr: "" },
        ];
      }
      return [];
    });
    const app = buildSuppliersApp(pool, []);
    const res = await request(app).get("/api/suppliers?lang=en");
    expect(res.status).toBe(200);
    expect(res.body[0].industryEn).toBe("Machinery");
    expect(res.body[0].mainProductsEn).toEqual(["Machine tools", "Machining centers"]);
    expect(res.body[1].industryEn).toBe("机械"); // 缺失回退中文原文

    // fire-and-forget 补翻：仅缺失的供应商 2 触发翻译并写缓存表
    await vi.waitFor(() => {
      expect(translateViaChain).toHaveBeenCalledWith(["机械", "机床, 加工中心"], "zh", "en");
      const insertCall = pool.query.mock.calls.find(([sql]) =>
        String(sql).startsWith("INSERT INTO crm_supplier_translations")
      );
      expect(insertCall).toBeTruthy();
      expect(insertCall![1]).toEqual([2, "en", "Machinery EN", "Machine tools EN", "chain-test"]);
    });
  });
});

// ─── GET /api/suppliers/:id/contact ─────────────────────────────────────────
describe("GET /api/suppliers/:id/contact", () => {
  function contactPool(overrides: { user?: any[]; subs?: any[]; supplier?: any[] } = {}) {
    return createRoutingPool((sql) => {
      if (sql.includes("FROM crm_users")) return overrides.user ?? [];
      if (sql.includes("crm_user_subscriptions")) return overrides.subs ?? [];
      if (sql.includes("FROM supplier WHERE id")) return overrides.supplier ?? [];
      return [];
    });
  }

  it("returns 400 for invalid supplier id", async () => {
    const app = buildSuppliersApp(contactPool(), []);
    const res = await request(app).get("/api/suppliers/abc/contact?user_key=u1");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_SUPPLIER");
  });

  it("returns 403 without user_key", async () => {
    const pool = contactPool();
    const app = buildSuppliersApp(pool, []);
    const res = await request(app).get("/api/suppliers/1/contact");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("VIP_REQUIRED");
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("returns 403 when user unknown or not vip", async () => {
    const app1 = buildSuppliersApp(contactPool({ user: [] }), []);
    expect((await request(app1).get("/api/suppliers/1/contact?user_key=ghost")).status).toBe(403);

    const app2 = buildSuppliersApp(contactPool({ user: [{ membership_tier: "free" }], subs: [] }), []);
    expect((await request(app2).get("/api/suppliers/1/contact?user_key=free@x.com")).status).toBe(403);
  });

  it("reveals contact for vip-tier user after stripping sup-db- prefix", async () => {
    const pool = contactPool({
      user: [{ membership_tier: "vip" }],
      supplier: [{ contact: "张三", phone: "13800000000", email: "zhang@test.com" }],
    });
    const app = buildSuppliersApp(pool, []);
    const res = await request(app).get("/api/suppliers/sup-db-7/contact?user_key=VIP@x.com");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      contactPerson: "张三",
      contactPhone: "13800000000", // VIP 可见明文
      contactEmail: "zhang@test.com",
    });
    // 用户查询使用归一化后的 user_key
    expect(pool.query.mock.calls[0][1]).toEqual(["vip@x.com"]);
    expect(pool.query.mock.calls[2][1]).toEqual([7]); // sup-db- 前缀剥离
  });

  it("grants access via active subscription and 404 when supplier missing", async () => {
    const app1 = buildSuppliersApp(
      contactPool({ user: [{ membership_tier: "free" }], subs: [{ id: 1 }], supplier: [] }),
      []
    );
    const res1 = await request(app1).get("/api/suppliers/9/contact?user_key=u2");
    expect(res1.status).toBe(404);
    expect(res1.body.error).toBe("SUPPLIER_NOT_FOUND");
  });
});

// ─── POST /api/suppliers ────────────────────────────────────────────────────
describe("POST /api/suppliers", () => {
  it("returns 400 when name or contact missing", async () => {
    const app = buildSuppliersApp(createRoutingPool(() => []), []);
    const res = await request(app).post("/api/suppliers").send({ nameZh: "A公司" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Missing name or contact data");
  });

  it("returns existing record on duplicate request hash", async () => {
    const existing = {
      id: 3,
      company_name: "已有公司",
      industry: "机械",
      products: "",
      type: "domestic",
    };
    const pool = createRoutingPool((sql) => {
      if (sql.includes("WHERE request_hash")) return [existing];
      return [];
    });
    const leadsDb: Lead[] = [];
    const app = buildSuppliersApp(pool, leadsDb);
    const res = await request(app)
      .post("/api/suppliers")
      .send({ nameZh: "已有公司", contactPerson: "张三", contactEmail: "dup@test.com" });
    expect(res.status).toBe(201);
    expect(res.body.supplier.id).toBe("sup-db-3");
    expect(res.body.companionLead.type).toBe("supplier_register");
    expect(leadsDb[0]).toBe(res.body.companionLead);
    const insertCalls = pool.query.mock.calls.filter(([sql]) => String(sql).startsWith("INSERT INTO crm_suppliers"));
    expect(insertCalls).toHaveLength(0); // 防重命中不重复插入
  });

  it("inserts new supplier and creates companion lead", async () => {
    const crmRow = { id: 5, company_name: "新供应商", industry: "机械", products: "", type: "domestic" };
    const pool = createRoutingPool((sql) => {
      if (sql.includes("WHERE request_hash")) return [];
      if (String(sql).startsWith("INSERT INTO crm_suppliers")) return { insertId: 5 };
      if (sql.includes("FROM crm_suppliers WHERE id")) return [crmRow];
      return [];
    });
    const leadsDb: Lead[] = [];
    const app = buildSuppliersApp(pool, leadsDb);
    const res = await request(app)
      .post("/api/suppliers")
      .send({
        nameZh: " 新供应商 ",
        contactPerson: "李四",
        contactEmail: "NEW@Test.com ",
        contactPhone: "13900001111",
        mainProductsZh: ["数控机床", "加工中心"],
        industryZh: "机械",
        ungmCode: "UNGM-001",
        type: "international",
      });
    expect(res.status).toBe(201);
    expect(res.body.supplier.id).toBe("sup-db-5");
    expect(res.body.companionLead.companyName).toBe(" 新供应商 ");
    expect(res.body.companionLead.has国际公共采购Participation).toBe(true);
    expect(leadsDb).toHaveLength(1);
    const insertCall = pool.query.mock.calls.find(([sql]) => String(sql).startsWith("INSERT INTO crm_suppliers"));
    expect(insertCall).toBeTruthy();
    // nameZh trim、数组 join、邮箱原样入库（hash 才做 lowercase）
    expect(insertCall![1].slice(0, 5)).toEqual(["新供应商", "李四", "13900001111", "NEW@Test.com ", "数控机床, 加工中心"]);
  });
});

// ─── POST /api/supplier-claims ──────────────────────────────────────────────
describe("POST /api/supplier-claims", () => {
  it("returns 400 when user_key or company_name missing", async () => {
    const app = buildSuppliersApp(createRoutingPool(() => []), []);
    const res = await request(app).post("/api/supplier-claims").send({ user_key: "u1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("请先登录并填写公司名称");
  });

  it("creates claim linked to matched supplier", async () => {
    const pool = createRoutingPool((sql) => {
      if (sql.includes("FROM crm_suppliers WHERE company_name")) return [{ id: 8 }];
      return [];
    });
    pool.execute.mockResolvedValue([{ insertId: 42 }]);
    const app = buildSuppliersApp(pool, []);
    const res = await request(app)
      .post("/api/supplier-claims")
      .send({ user_key: "Claim@X.com ", company_name: "认领公司", supplier_type: "international", contact_name: "王五" });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, id: 42, status: "pending" });
    const params = pool.execute.mock.calls[0][1];
    expect(params).toEqual(["claim@x.com", "claim@x.com", 8, "认领公司", "international", "王五", "", "claim@x.com", ""]);
  });
});
