/**
 * 供应商侧两个字典/统计端点的 wire 键集合取证（命名红线② B 组收敛·第五批）。
 *
 * 两条登记项都停在 B「实测无 snake 键，但整块透出静态面看不见」，收口手法不同：
 *   - /api/certifications 是 `json(rows)`——repo 行直接上网。现抽出约定名
 *     `certificationViewOf`，静态面能认出已收视图 → 登记删除。
 *     这一条还顺手拆了前端的幻影字段：`CertificationRefItem` 里挂着 `title_zh`/`title_en`，
 *     而 `supplier_certifications` 表根本没这两列（端点只 SELECT id, name）。
 *   - /api/suppliers/stats 成功分支是 `json({ ...stats, registered })`。现改为显式列举六个计数键，
 *     与降级分支硬编的那六个对齐（以前两路形状只靠肉眼对齐）。
 * 全程假仓储，不连库。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  listActiveCertifications: vi.fn(),
  getStats: vi.fn(),
  countApproved: vi.fn(),
}));

vi.mock("@/lib/db/context", () => ({
  getContext: () => ({
    catalogRepo: { listActiveCertifications: mocks.listActiveCertifications },
    supplier: { directoryRepo: { getStats: mocks.getStats, countApproved: mocks.countApproved } },
  }),
}));

import { GET as certificationsGET } from "@/app/api/certifications/route";
import { GET as statsGET } from "@/app/api/suppliers/stats/route";

const SNAKE_KEY = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;
const req = (path: string) => new NextRequest(`http://localhost:3000${path}`);
const run = async (get: (r: NextRequest, c?: never) => Promise<Response>, path: string) =>
  await (await get(req(path), {} as never)).json();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/certifications", () => {
  it("行→视图只出 id + name；SELECT 之外的列（sort_order/created_at）与表列名一律不上网", async () => {
    mocks.listActiveCertifications.mockResolvedValue([
      { id: 3, name: "ISO 9001", sort_order: 1, is_active: 1, created_at: "2026-01-02 03:04:05" },
      // 脏值也要归一：id 可能是字符串、name 可能为 NULL
      { id: "7", name: null, sort_order: 9, is_active: 1 },
    ]);

    const body = await run(certificationsGET, "/api/certifications");

    expect(body).toEqual([
      { id: 3, name: "ISO 9001" },
      { id: 7, name: "" },
    ]);
    for (const item of body) {
      expect([...Object.keys(item)].sort()).toEqual(["id", "name"]);
      expect(Object.keys(item).filter((k) => SNAKE_KEY.test(k))).toEqual([]);
    }
  });

  it("空字典返回空数组，不返回 null、也不换成 {items:[…]} 另一种形状", async () => {
    mocks.listActiveCertifications.mockResolvedValue([]);
    const body = await run(certificationsGET, "/api/certifications");
    expect(Array.isArray(body)).toBe(true);
    expect(body).toEqual([]);
  });
});

describe("GET /api/suppliers/stats", () => {
  it("成功分支显式列举六个计数键；仓储返回值里的内部字段不随 spread 上网", async () => {
    mocks.getStats.mockResolvedValue({
      searchable: 100,
      verified: 60,
      withCertification: 20,
      international: 35,
      commodityMatched: 42,
      // getStats 哪天加内部诊断字段（COUNT 别名、耗时）都不该变成对外契约
      total_raw: 100,
      queryMs: 7,
    });
    mocks.countApproved.mockResolvedValue(11);

    const body = await run(statsGET, "/api/suppliers/stats");

    expect(body).toEqual({
      searchable: 100,
      verified: 60,
      withCertification: 20,
      international: 35,
      commodityMatched: 42,
      registered: 11,
    });
    expect(Object.keys(body).filter((k) => SNAKE_KEY.test(k))).toEqual([]);
  });

  it("查库异常 → 降级分支的键集合与成功分支完全一致（只是全 0）", async () => {
    mocks.getStats.mockRejectedValue(new Error("db down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const body = await run(statsGET, "/api/suppliers/stats");

    expect([...Object.keys(body)].sort()).toEqual([
      "commodityMatched", "international", "registered", "searchable", "verified", "withCertification",
    ]);
    expect(Object.values(body)).toEqual([0, 0, 0, 0, 0, 0]);
    err.mockRestore();
  });
});
