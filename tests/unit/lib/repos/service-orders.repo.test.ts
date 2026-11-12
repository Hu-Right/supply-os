import { describe, it, expect, vi } from "vitest";
import { ServiceOrdersRepo } from "@/lib/repos/service-orders.repo";
import type { Pool } from "mysql2/promise";

function makePool(query: (sql: string, params?: unknown[]) => Promise<unknown>) {
  return { query } as unknown as Pool;
}

describe("ServiceOrdersRepo", () => {
  it("createOrder 写 pending 单，字段快照来自入参", async () => {
    const query = vi.fn().mockResolvedValue([{ insertId: 7 }]);
    const repo = new ServiceOrdersRepo(makePool(query));
    const id = await repo.createOrder({
      orderNo: "SV20260923A1", userId: 5, serviceCode: "svc_manual_bid_match",
      unitPrice: "199.00", amountTotal: "199.00", currency: "CNY", saleMode: "self",
      provider: "alipay",
    });
    expect(id).toBe(7);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    // 009 定位收口：本 repo 只承载 self 在线单，provider 走占位符落真实渠道（哨兵 'service' 退役）
    expect(sql).toContain("INSERT INTO orders");
    expect(sql).toContain("'pending'");
    expect(sql).toContain("provider");
    expect(params).toContain("SV20260923A1");
    expect(params).toContain("alipay");
    // sale_mode 不再是独立列，进 items_snapshot 快照
    expect(params).toContain(JSON.stringify({ saleMode: "self" }));
  });

  it("markPaid 仅更新 pending → paid", async () => {
    const query = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
    await new ServiceOrdersRepo(makePool(query)).markPaid("SV1");
    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toContain("SET status = 'paid'");
    expect(sql).toContain("status = 'pending'");
  });

  it("queryStatus 返回 status/amount/paid_at", async () => {
    const query = vi.fn().mockResolvedValue([[{ status: "paid", amount_total: "199.00", paid_at: null }]]);
    const st = await new ServiceOrdersRepo(makePool(query)).queryStatus("SV1");
    expect(st?.status).toBe("paid");
  });

  it("findOrderAmount 返回金额，无单返回 null", async () => {
    const query = vi.fn().mockResolvedValue([[{ amount: "199.00" }]]);
    const r = await new ServiceOrdersRepo(makePool(query)).findOrderAmount("SV1");
    expect(Number(r?.amount)).toBe(199);
  });
});
