/**
 * 供应商资源库两个只读端点的行→视图取证（命名红线②·「字面量包 opaque 值」盲区）。
 *
 * 这两条不在整块透出登记集里，因为它们的出口写成 `json({ list: rows })` / `json({ candidates: rows })`：
 * 字面量里的键是 camel，规则一只看得见最外层键；数组元素的键对静态面完全不可见（门禁已声明的已知限制）。
 * 所以这里不是「登记后补断言」，而是**盲区里的真实违规**：GET 直透 `pool_id` / `supplier_id` /
 * `has_qualification` / `created_at`（含 `SELECT p.id AS pool_id` 这类 SQL 别名），search 直透 `in_pool`。
 * 修法按 supplier 族老路子：service 出口建视图 + 前端读取点同批改 + 键集合断言。
 * 全程假仓储，不连库。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  listByUser: vi.fn(),
  searchVerifiedByCompany: vi.fn(),
  requireUserKeyOrThrow: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/repos/user-supplier-pool.repo", () => ({
  UserSupplierPoolRepo: function (this: Record<string, unknown>) {
    Object.assign(this, {
      listByUser: mocks.listByUser,
      searchVerifiedByCompany: mocks.searchVerifiedByCompany,
    });
  },
}));
vi.mock("@/lib/db/context", () => ({ getContext: () => ({ dbPool: {} }) }));
vi.mock("@/lib/middleware/auth", () => ({ requireUserKeyOrThrow: mocks.requireUserKeyOrThrow }));
vi.mock("@/lib/middleware/rateLimiter", () => ({ checkRateLimit: mocks.checkRateLimit }));

import { GET as poolGET } from "@/app/api/user/supplier-pool/route";
import { GET as searchGET } from "@/app/api/user/supplier-pool/search/route";
import { poolSupplierViewOf } from "@/lib/services/supplier-pool";

const SNAKE_KEY = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;
const req = (path: string) => new NextRequest(`http://localhost:3000${path}`);

/** 仓储 listByUser 的真实行口径（列名 + SQL 别名） */
const poolRow = {
  pool_id: 7,
  supplier_id: 42,
  company: "工厂A",
  industry: "",
  has_qualification: 1,
  notes: "备注",
  source: "platform",
  created_at: "2026-10-01 08:00:00",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserKeyOrThrow.mockResolvedValue({ userId: 7, authViaJwt: true });
  mocks.checkRateLimit.mockReturnValue(null);
});

describe("poolSupplierViewOf：列名 → 契约键", () => {
  it("八个键全部 camel 且值原样（0/1 不布尔化、null 不造空串）", () => {
    const view = poolSupplierViewOf(poolRow);

    expect(view).toEqual({
      poolId: 7, supplierId: 42, company: "工厂A", industry: "",
      hasQualification: 1, notes: "备注", source: "platform", createdAt: "2026-10-01 08:00:00",
    });
    expect([...Object.keys(view)].sort()).toEqual([
      "company", "createdAt", "hasQualification", "industry", "notes", "poolId", "source", "supplierId",
    ]);
    expect(Object.keys(view).filter((k) => SNAKE_KEY.test(k))).toEqual([]);
  });

  it("手工添加未关联目录的行：supplierId 保持 null、notes 保持 null（不改值口径）", () => {
    const view = poolSupplierViewOf({ ...poolRow, supplier_id: null, notes: null, has_qualification: 0 });
    expect(view.supplierId).toBeNull();
    expect(view.notes).toBeNull();
    expect(view.hasQualification).toBe(0);
  });
});

describe("GET /api/user/supplier-pool", () => {
  it("wire 上只有 { list }，元素键是视图口径；列名一个都不上网", async () => {
    mocks.listByUser.mockResolvedValue([poolRow, { ...poolRow, pool_id: 8, supplier_id: null }]);

    const body = await (await poolGET(req("/api/user/supplier-pool"), {} as never)).json();

    expect([...Object.keys(body)]).toEqual(["list"]);
    expect(body.list).toHaveLength(2);
    for (const item of body.list) {
      expect(Object.keys(item).filter((k: string) => SNAKE_KEY.test(k))).toEqual([]);
    }
    expect(body.list[1].supplierId).toBeNull();
    expect(mocks.listByUser).toHaveBeenCalledWith(7);
  });
});

describe("GET /api/user/supplier-pool/search", () => {
  it("候选项的 in_pool（SQL 别名）换成 inPool，其余键原样", async () => {
    mocks.searchVerifiedByCompany.mockResolvedValue([
      { id: 11, company: "工厂B", industry: "", in_pool: 1 },
      { id: 12, company: "工厂C", industry: "", in_pool: 0 },
    ]);

    const body = await (await searchGET(req("/api/user/supplier-pool/search?q=%E5%B7%A5%E5%8E%82"), {} as never)).json();

    expect([...Object.keys(body)]).toEqual(["candidates"]);
    expect(body.candidates).toEqual([
      { id: 11, company: "工厂B", industry: "", inPool: 1 },
      { id: 12, company: "工厂C", industry: "", inPool: 0 },
    ]);
    expect(Object.keys(body.candidates[0]).filter((k: string) => SNAKE_KEY.test(k))).toEqual([]);
    // “已在库”标记靠 userId 做 LEFT JOIN：关键词、limit、userId 三个入参都得传下去
    expect(mocks.searchVerifiedByCompany).toHaveBeenCalledWith("工厂", 8, 7);
  });

  it("关键词超 100 字 → 400，不查库", async () => {
    const long = "a".repeat(101);
    const res = await searchGET(req(`/api/user/supplier-pool/search?q=${long}`), {} as never);

    expect(res.status).toBe(400);
    expect(mocks.searchVerifiedByCompany).not.toHaveBeenCalled();
  });
});
