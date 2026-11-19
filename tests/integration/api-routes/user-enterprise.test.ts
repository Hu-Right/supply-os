/**
 * GET /api/user/enterprise 集成测试 — 响应键命名红线（红线②【丙】组第①处收口）
 *
 * @description 出口写的是 `json({ …, enterprise: row, … })`，row 来自
 *              `findFullById` = `SELECT <PORTAL_COLUMNS> FROM supplier WHERE id=?`。
 *              真库探针实测 25 个列键，其中 9 个带下划线（country_code/legal_rep/
 *              established_at/registered_capital/credit_code/verify_status/
 *              info_review_status/data_quality_score/license_url）。
 *              claim_status 已退役（ADR-0017），其位置由派生键 hasPendingClaim 取代
 *              （来自 supplier_claims，不是 supplier 列）；coop_status / info_checked /
 *              business_type / remark / source_channel / business_type_code /
 *              industry_code_name / check_note 也已随 2026-11 影子表迁移物理删除，
 *              白名单与响应都不得再出现这些键。
 *              前端 `EnterpriseInfo` 当时是 `Record<string, unknown>`——类型被抹平，
 *              tsc/门禁/探针三路都看不见这些键（本批顺带把它升级成具名类型当编译期闸门）。
 *
 *              期望键集合直接从 PORTAL_COLUMNS 推导，不手抄：手抄会漏，漏了就等于没钉；
 *              派生键 hasPendingClaim 单独登记。PORTAL_ROW 这份 mock 也必须与白名单逐列对齐
 *              （下面有断言把关），否则白名单删列后 mock 仍回旧列，接口契约就悄悄失真了。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { SupplierDirectoryRepo } from "@/lib/repos/suppliers/supplier-directory.repo";
import { toCamelKey } from "@/shared/utils/case-keys";

vi.mock("server-only", () => ({}));

/** 可变身份：同一个 mock 工厂驱动「已绑定 / 未绑定」两个分支，避免 resetModules 互相污染 */
const state = vi.hoisted(() => ({ supplierId: 42 as number | null, claimPending: false, claimRepoFails: false }));

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
  contact: "张三",
  position: "采购经理",
  phone: "13800000000",
  email: "a@b.com",
  website: "https://example.com",
  legal_rep: "李四",
  established_at: "2015-06-01",
  registered_capital: "1000万元人民币",
  credit_code: "91610400MA0000000X",
  credit_code_type: "uscc",
  products: "阀门、泵",
  verify_status: "done",
  info_review_status: "reviewed",
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
    supplier: {
      directoryRepo: { findFullById: async () => (state.supplierId ? PORTAL_ROW : null) },
      // 认领处理中改为 supplier_claims 派生（claim_status 已退役，ADR-0017）
      claimRepo: {
        hasPendingClaim: async () => {
          if (state.claimRepoFails) throw new Error("db down");
          return state.claimPending;
        },
      },
    },
  }),
}));

vi.mock("@/lib/services/license-change", () => ({
  latestLicenseChangeForSupplier: vi.fn(async () => null),
  upsertPendingLicenseChange: vi.fn(async () => null),
  licenseFilenameFromUrl: vi.fn(() => ""),
}));

vi.mock("@/lib/repos/certification-text", () => ({
  // 单一事实源=能力档案：这里用重复项与前后空白验证 certificationNamesViewOf 的收敛
  listCertificationNames: vi.fn(async () => ["ISO9001", " CE ", "ISO9001"]),
}));

vi.mock("@/lib/services/commodity/supplier-self-report", () => ({
  listSupplierSelfReport: vi.fn(async () => []),
  replaceSupplierSelfReport: vi.fn(async () => {}),
}));

const snakeKeys = (obj: unknown): string[] =>
  Object.keys(obj as object).filter((k) => /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(k));

/** 改名规则直接复用 case-keys（与视图同一个实现），避免测试自己写一份而慢慢分叉；
 *  派生键 hasPendingClaim 不是 supplier 列，单独追加。 */
const EXPECTED_KEYS = [...SupplierDirectoryRepo.PORTAL_COLUMNS.map(toCamelKey), "hasPendingClaim"];

function getReq(): NextRequest {
  return new NextRequest("http://localhost:3000/api/user/enterprise", { method: "GET" });
}

describe("GET /api/user/enterprise", () => {
  beforeEach(() => {
    state.supplierId = 42;
    state.claimPending = false;
    state.claimRepoFails = false;
  });

  it("enterprise 键集合 = PORTAL_COLUMNS 的 camel 形态 + 派生键 hasPendingClaim，逐一对得上", async () => {
    const { GET } = await import("@/app/api/user/enterprise/route");
    const body = await (await GET(getReq())).json();

    expect(Object.keys(body.enterprise).sort()).toEqual([...EXPECTED_KEYS].sort());
    expect(EXPECTED_KEYS).toHaveLength(24); // 白名单加/减列时这里先响，逼着同步看契约
    // claim_status 已退役：响应里不得再出现 claimStatus（读点清零）
    expect(body.enterprise.claimStatus).toBeUndefined();
  });

  it("mock 行与 PORTAL_COLUMNS 逐列对齐（白名单删列后 mock 不许留在旧结构）", () => {
    expect(Object.keys(PORTAL_ROW).sort()).toEqual([...SupplierDirectoryRepo.PORTAL_COLUMNS].sort());
  });

  it("hasPendingClaim 由认领仓储派生（不是 supplier 列），值随查询结果下发", async () => {
    state.claimPending = true;
    try {
      const { GET } = await import("@/app/api/user/enterprise/route");
      const body = await (await GET(getReq())).json();
      expect(body.enterprise.hasPendingClaim).toBe(true);
    } finally {
      state.claimPending = false;
    }
  });

  it("认领仓储读失败 → hasPendingClaim 兜底 false，不阻断企业页返回", async () => {
    state.claimRepoFails = true;
    try {
      const { GET } = await import("@/app/api/user/enterprise/route");
      const res = await GET(getReq());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.enterprise.hasPendingClaim).toBe(false);
    } finally {
      state.claimRepoFails = false;
    }
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
    // certification 已停写（单一事实源=能力档案）：企业行不再带该键，改由顶层的只读聚合下发
    expect(body.enterprise.certification).toBeUndefined();
    expect(body.certificationNames).toEqual(["ISO9001", "CE"]); // trim + 去重
  });

  it("未绑定：enterprise 恒为 null，顶层仍无 snake 键", async () => {
    state.supplierId = null;
    const { GET } = await import("@/app/api/user/enterprise/route");
    const body = await (await GET(getReq())).json();

    expect(body).toEqual({ bound: false, linkStatus: "none", enterprise: null });
    expect(snakeKeys(body)).toEqual([]);
  });
});
