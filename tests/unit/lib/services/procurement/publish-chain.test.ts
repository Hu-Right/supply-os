/**
 * F01/F02 主链修复单测（mock 连接池，不连库）
 *
 * 覆盖三类回归：
 *  - 创建草稿必须显式写 title_zh（严格 sql_mode 下 NOT NULL 无默认值会 1364）
 *  - 项目 PATCH 的 camelCase 入参必须归一到列名（否则静默 changed:0）
 *  - 公开详情必须给非 owner 返回脱敏明细（供应商只能看"买什么"，看不到附件/核验记录）
 *
 * @module tests/unit/lib/services/procurement/publish-chain
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import { createProject, normalizeProjectFields, updateProject } from "@/lib/services/procurement/projects";
import { projectDetailViewOf } from "@/lib/services/procurement/views";
import type { ProjectDetailBundle } from "@/lib/services/procurement/projects";

const NOW = 1_777_593_600;

function fakeConn() {
  const calls: Array<[string, unknown[] | undefined]> = [];
  const conn = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      if (sql.includes("INSERT INTO procurement_projects")) return [{ insertId: 7 }];
      return [{ affectedRows: 1 }];
    }),
  };
  return { conn, calls };
}

describe("createProject — 严格 sql_mode 下的草稿创建", () => {
  it("INSERT 显式写 title_zh（NOT NULL 无默认值），不再依赖库的宽松模式", async () => {
    const { conn, calls } = fakeConn();
    const pool = { getConnection: vi.fn().mockResolvedValue(conn) } as unknown as Pool;

    const r = await createProject(pool, { buyerId: 1, at: NOW });
    expect(r.projectId).toBe(7);
    expect(r.reference).toBe("OSPR-2026-000007");

    const insert = calls.find(([sql]) => sql.includes("INSERT INTO procurement_projects"));
    expect(insert).toBeDefined();
    expect(insert![0]).toContain("title_zh");
    expect(insert![1]).toEqual([1, NOW, NOW]);
  });
});

describe("normalizeProjectFields — camel/snake 双入口", () => {
  it("camelCase 键归一到列名，多选数组 join，未知键丢弃", () => {
    const out = normalizeProjectFields({
      titleZh: "采购光伏组件",
      budgetAmount: 1200,
      budgetPublic: 1,
      objectTypes: ["goods", "service"],
      installNeeds: ["training"],
      deliveryAddress: "内罗毕",
      status: "published", // 状态列不可编辑，必须丢弃
      unknownKey: "x",
    });
    expect(out).toEqual({
      title_zh: "采购光伏组件",
      budget_amount: 1200,
      budget_public: 1,
      object_types: "goods,service",
      install_needs: "training",
      delivery_address: "内罗毕",
    });
    expect(out).not.toHaveProperty("status");
    expect(out).not.toHaveProperty("unknown_key");
  });

  it("snake_case 入参保持原样（服务契约不破坏）", () => {
    const out = normalizeProjectFields({ title_zh: "旧调用方", quote_deadline_at: 123 });
    expect(out).toEqual({ title_zh: "旧调用方", quote_deadline_at: 123 });
  });
});

describe("updateProject — camelCase 入参不再静默丢字段", () => {
  it("按列名生成 UPDATE，changed 等于命中字段数", async () => {
    const row = {
      id: 7,
      status: "draft",
      reference: "OSPR-2026-000007",
      buyer_id: 1,
      version_no: 0,
    };
    const queries: Array<[string, unknown[] | undefined]> = [];
    const db = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push([sql, params]);
        if (sql.includes("SELECT * FROM procurement_projects")) return [[row]];
        return [{ affectedRows: 1 }];
      }),
    } as unknown as Pool;

    const r = await updateProject(db, {
      projectId: 7,
      at: NOW,
      fields: { titleZh: "采购光伏组件 10MW", budgetAmount: 500000, budgetPublic: 0 },
    });

    expect(r).toEqual({ ok: true, changed: 3 });
    const update = queries.find(([sql]) => sql.includes("UPDATE procurement_projects SET"));
    expect(update).toBeDefined();
    expect(update![0]).toContain("`title_zh` = ?");
    expect(update![0]).toContain("`budget_amount` = ?");
    expect(update![0]).toContain("`budget_public` = ?");
    expect(update![1]).toContain("采购光伏组件 10MW");
  });

  it("非草稿态拒绝编辑", async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("SELECT * FROM procurement_projects")) {
          return [[{ id: 7, status: "published", version_no: 2 }]];
        }
        return [{ affectedRows: 1 }];
      }),
    } as unknown as Pool;
    const r = await updateProject(db, { projectId: 7, fields: { titleZh: "x" } });
    expect(r).toEqual({ ok: false, reason: "not_editable" });
  });
});

describe("projectDetailViewOf — 公开详情给供应商脱敏明细", () => {
  const project = {
    id: 7,
    reference: "OSPR-2026-000007",
    version_no: 2,
    status: "published",
    close_reason: null,
    title_zh: "采购学生课桌椅",
    title_en: null,
    background: "背景",
    purpose: "real",
    internal_project_no: "INT-1",
    object_types: "goods",
    budget_amount: "120000.00",
    budget_currency: "USD",
    budget_public: 0,
    budget_approved: "approved",
    delivery_country: "肯尼亚",
    delivery_city: "内罗毕",
    delivery_address: "某学校",
    deadline_date: "2026-12-31",
    install_needs: "installation",
    logistics_note: "特殊包装",
    incoterm: "CIF",
    payment_terms: "30% 预付",
    guarantees: "performance_bond",
    supplier_country_limit: null,
    manufacturer_only: 0,
    supplier_quals: "ISO9001",
    quote_deadline_at: 1_780_000_000,
    compliance: null,
    contact_disclosure: "none",
    procurement_mode: "rfq",
    requirement_verify: "pass",
    fund_verify: "unverified",
    submitted_at: 1_777_000_000,
    published_at: 1_777_500_000,
    created_at: 1_776_000_000,
  };

  const bundle = {
    project: project as never,
    buyerOrgName: "某教育局",
    lots: [{ lot_no: "LOT-01", title: "课桌", scope_note: null }],
    items: [
      {
        id: 1,
        lot_id: null,
        line_no: 1,
        name_zh: "学生课桌",
        name_en: null,
        spec: "双人钢木",
        quantity: "2000.0000",
        qty_unit: "套",
        qty_type: "fixed",
        ugt_code: "UGT-0101",
        attributes: null,
        alternatives_allowed: 1,
      },
    ],
    attachments: [{ id: 1, version_no: 2, kind: "requirement", filename: "a.pdf", file_key: "attach_1", file_hash: "h", size_bytes: 1, uploaded_at: 1 }],
    reviews: [{ id: 1, version_no: 2, stage: "auto", result: "pass", reviewer: "system", note: null, created_at: 1 }],
    authorization: { status: "verified" as const, signerName: "张三", signedAt: 2 },
  } as unknown as ProjectDetailBundle;

  it("非 owner：能看明细与标包，但看不到附件/核验记录/内部编号/准确地址", () => {
    const view = projectDetailViewOf(bundle, { isOwner: false }) as Record<string, unknown>;
    expect(view.items).toHaveLength(1);
    expect((view.items as Array<Record<string, unknown>>)[0]).toMatchObject({ nameZh: "学生课桌", quantity: 2000 });
    expect(view.itemCount).toBe(1);
    expect(view.lots).toHaveLength(1);
    expect(view).not.toHaveProperty("attachments");
    expect(view).not.toHaveProperty("reviews");
    expect(view.internalProjectNo).toBe("");
    expect(view.deliveryAddress).toBe("");
    expect(view.budgetAmount).toBeNull();
  });

  it("owner：拿到 budgetPublic 原值与全量明细", () => {
    const view = projectDetailViewOf(bundle, { isOwner: true }) as Record<string, unknown>;
    expect(view.budgetPublic).toBe(false);
    expect(view.attachments).toHaveLength(1);
    expect(view.reviews).toHaveLength(1);
    expect(view.internalProjectNo).toBe("INT-1");
  });
});
