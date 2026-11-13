/**
 * GET /api/rfq/demands/[id] 可见性集成测试（mock pool + mock 鉴权）
 * @module tests/integration/api-routes/rfq-demand-detail
 *
 * 覆盖三条可见性规则：owner 全量 / 公开需求 / 定向需求对非受邀者只回摘要。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

const poolQuery = vi.fn();
const requireUserKeyOrThrow = vi.fn();

vi.mock("@/lib/db/pool", () => ({ getPool: () => ({ query: poolQuery }) }));
vi.mock("@/lib/middleware/auth", () => ({
  requireUserKeyOrThrow: (...args: unknown[]) => requireUserKeyOrThrow(...args),
}));

const OWNER_ID = 42;

function demandRow(over: Record<string, unknown> = {}): RowDataPacket {
  return {
    id: 7,
    reference: "OSRFQ-2026-000007",
    buyer_user_id: OWNER_ID,
    status: "published",
    revision_no: 2,
    title: "采购光伏组件 10MW",
    description: "需求描述正文",
    category_code: "UGT-0301",
    province_name: "陕西省",
    purchase_type: "once",
    quantity: "10.000",
    quantity_unit: "MW",
    budget_amount: "12000000.00",
    budget_currency: "CNY",
    budget_confidential: 0,
    incoterm: "FOB",
    delivery_time: "60 天",
    delivery_address: "西安市高新区",
    payment_terms: "T/T",
    supplier_reqs: "有出口经验",
    visibility: "public",
    contact_name: "张三",
    contact_email: "buyer@example.com",
    contact_phone: "13800000000",
    terms_version: "v1",
    agreed_at: 1,
    close_at: 1_780_000_000,
    open_at: 1_770_000_000,
    submitted_at: 1_770_000_000,
    reviewed_at: 1_770_100_000,
    reject_reason: null,
    close_reason: null,
    notice_pk: 9001,
    created_at: 1_769_000_000,
    category_l1_name: "能源",
    category_l2_name: "光伏组件",
    ...over,
  } as unknown as RowDataPacket;
}

async function call() {
  const { GET } = await import("@/app/api/rfq/demands/[id]/route");
  return GET(new NextRequest("http://localhost:3000/api/rfq/demands/7"), {
    params: Promise.resolve({ id: "7" }),
  });
}

describe("GET /api/rfq/demands/[id]", () => {
  beforeEach(() => {
    poolQuery.mockReset();
    requireUserKeyOrThrow.mockReset();
  });

  it("所有者：拿到全量字段（含联系方式与 noticePk）", async () => {
    requireUserKeyOrThrow.mockResolvedValue({ userId: OWNER_ID });
    poolQuery.mockResolvedValueOnce([[demandRow()]]);

    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isOwner).toBe(true);
    expect(body.restricted).toBe(false);
    expect(body.contactEmail).toBe("buyer@example.com");
    expect(body.noticePk).toBe(9001);
    expect(body.budgetAmount).toBe(12_000_000);
  });

  it("匿名 + 公开需求：可见但无联系方式", async () => {
    requireUserKeyOrThrow.mockRejectedValue(new Error("unauthorized"));
    poolQuery.mockResolvedValueOnce([[demandRow()]]);

    const body = await (await call()).json();
    expect(body.restricted).toBe(false);
    expect(body.contactEmail).toBeUndefined();
  });

  it("匿名 + 定向需求：只回摘要（不含描述/预算/条款）", async () => {
    requireUserKeyOrThrow.mockRejectedValue(new Error("unauthorized"));
    poolQuery.mockResolvedValueOnce([[demandRow({ visibility: "targeted" })]]);

    const body = await (await call()).json();
    expect(body.restricted).toBe(true);
    expect(body.title).toBe("采购光伏组件 10MW");
    expect(body.description).toBe("");
    expect(body.budgetAmount).toBeNull();
    expect(body.deliveryAddress).toBe("");
    expect(body.paymentTerms).toEqual([]);
  });

  it("定向 + 受邀供应商：可见全文", async () => {
    requireUserKeyOrThrow.mockResolvedValue({ userId: 88 });
    poolQuery
      .mockResolvedValueOnce([[demandRow({ visibility: "targeted" })]])
      .mockResolvedValueOnce([[{ 1: 1 }]]); // 命中邀约白名单

    const body = await (await call()).json();
    expect(body.restricted).toBe(false);
    expect(body.description).toBe("需求描述正文");
  });

  it("非本人 + 未发布：404", async () => {
    requireUserKeyOrThrow.mockResolvedValue({ userId: 88 });
    poolQuery.mockResolvedValueOnce([[demandRow({ status: "draft" })]]);

    const res = await call();
    expect(res.status).toBe(404);
  });

  it("不存在：404", async () => {
    requireUserKeyOrThrow.mockRejectedValue(new Error("unauthorized"));
    poolQuery.mockResolvedValueOnce([[]]);

    const res = await call();
    expect(res.status).toBe(404);
  });
});
