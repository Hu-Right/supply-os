/**
 * GET /api/user/enterprise 集成测试 — 响应键命名红线（红线②【丙】组第①处收口）
 *
 * @description 出口写的是 `json({ …, enterprise: row, … })`，row 来自
 *              `findFullById` = `SELECT <PORTAL_COLUMNS> FROM supplier WHERE id=?`。
 *              真库探针实测 31 个键，其中 15 个带下划线（country_code/registered_address/
 *              registered_phone/registered_email/legal_rep/established_at/registered_capital/
 *              credit_code/business_type/verify_status/claim_status/coop_status/check_note/
 *              data_quality_score/license_url）。
 *              前端 `EnterpriseInfo` 当时是 `Record<string, unknown>`——类型被抹平，
 *              tsc/门禁/探针三路都看不见这些键（本批顺带把它升级成具名类型当编译期闸门）。
 *
 *              期望键集合直接从 PORTAL_COLUMNS 推导，不手抄：手抄会漏，漏了就等于没钉。
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { SupplierDirectoryRepo } from "@/lib/repos/suppliers/supplier-directory.repo";
import { toCamelKey } from "@/shared/utils/case-keys";

vi.mock("server-only", () => ({}));

/** 可变身份：同一个 mock 工厂驱动「已绑定 / 未绑定」两个分支，避免 resetModules 互相污染 */
const state = vi.hoisted(() => ({ supplierId: 42 as number | null }));

vi.mock("@/lib/middleware/auth", () => ({
  requireUserKeyOrThrow: vi.fn().mockResolvedValue({ userId: 7, authViaJwt: true }),
}));

/** 与 PORTAL_COLUMNS 同形的列名行（值只用于证明"原样透传"，不测业务） */
const PORTAL_ROW: Record<string, unknown> = {
  id: 42,
  company: "某某科技有限公司",
  country: "中国",
  country_code: "CN",
  province: "陕西",
  city: "咸阳",
  address: "某路 1 号",
  registered_address: "某路 1 号（注册）",
  contact: "张三",
  position: "采购经理",
  phone: "13800000000",
  email: "a@b.com",
  registered_phone: "029-00000000",
  registered_email: "reg@b.com",
  website: "https://example.com",
  legal_rep: "李四",
  established_at: "2015-06-01",
  registered_capital: "1000万元人民币",
  credit_code: "91610400MA0000000X",
  business_type: "生产商",
  certification: "ISO9001,CE",
  products: "阀门、泵",
  intro: "简介",
  remark: "备注",
  verify_status: "done",
  claim_status: "verified",
  coop_status: 0,
  check_note: "",
  data_quality_score: 88,
  addtime: 1730000000,
  license_url: "https://cdn/license.png",
};

vi.mock("@/lib/db/context", () => ({
  getContext: () => ({
    dbPool: {},
    user: {
      usersRepo: {
        findProfileById: async () => ({
          supplier_id: state.supplierId,
          supplier_link_status: state.supplierId ? "bound" : "none",
        }),
      },
    },
    supplier: { directoryRepo: { findFullById: async () => (state.supplierId ? PORTAL_ROW : null) } },
  }),
}));

vi.mock("@/lib/services/license-change", () => ({
  latestLicenseChangeForSupplier: vi.fn(async () => null),
  upsertPendingLicenseChange: vi.fn(async () => null),
  licenseFilenameFromUrl: vi.fn(() => ""),
}));

vi.mock("@/lib/services/commodity/supplier-self-report", () => ({
  listSupplierSelfReport: vi.fn(async () => []),
  replaceSupplierSelfReport: vi.fn(async () => {}),
}));

const snakeKeys = (obj: unknown): string[] =>
  Object.keys(obj as object).filter((k) => /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(k));

/** 改名规则直接复用 case-keys（与视图同一个实现），避免测试自己写一份而慢慢分叉 */
const EXPECTED_KEYS = SupplierDirectoryRepo.PORTAL_COLUMNS.map(toCamelKey);

function getReq(): NextRequest {
  return new NextRequest("http://localhost:3000/api/user/enterprise", { method: "GET" });
}

describe("GET /api/user/enterprise", () => {
  it("enterprise 键集合 = PORTAL_COLUMNS 的 camel 形态，逐一对得上", async () => {
    const { GET } = await import("@/app/api/user/enterprise/route");
    const body = await (await GET(getReq())).json();

    expect(Object.keys(body.enterprise).sort()).toEqual([...EXPECTED_KEYS].sort());
    expect(EXPECTED_KEYS).toHaveLength(31); // 白名单加/减列时这里先响，逼着同步看契约
  });

  it("响应里任何一层出现带下划线的键都算违规（顶层 + enterprise）", async () => {
    const { GET } = await import("@/app/api/user/enterprise/route");
    const body = await (await GET(getReq())).json();

    expect(snakeKeys(body)).toEqual([]);
    expect(snakeKeys(body.enterprise)).toEqual([]);
  });

  it("值原样透传，命名迁移不改数据形态", async () => {
    const { GET } = await import("@/app/api/user/enterprise/route");
    const body = await (await GET(getReq())).json();

    expect(body.enterprise.creditCode).toBe("91610400MA0000000X");
    expect(body.enterprise.verifyStatus).toBe("done");
    expect(body.enterprise.licenseUrl).toBe("https://cdn/license.png");
    expect(body.enterprise.certification).toBe("ISO9001,CE"); // varchar 不是 JSON，不得改成数组
  });

  it("未绑定：enterprise 恒为 null，顶层仍无 snake 键", async () => {
    state.supplierId = null;
    const { GET } = await import("@/app/api/user/enterprise/route");
    const body = await (await GET(getReq())).json();

    expect(body).toEqual({ bound: false, linkStatus: "none", enterprise: null });
    expect(snakeKeys(body)).toEqual([]);
  });
});
