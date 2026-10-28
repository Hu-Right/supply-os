/**
 * 三个「服务给具名类型、路由整块透出」端点的信封键集合钉（命名红线② B 组收敛·第六批）。
 *
 * 这一批的形态和前几批不同：不是列名上网，而是 **路由把服务出口结构直接当响应体**——
 * 服务类型加一个字段，wire 就多一个对外键，静态面与探针都只能事后发现。
 * 三种处理各按各的分层：
 *   - catalog/country-name-map、learning/materials/[id]/content：路由原本就在「透出一个
 *     固定形状的对象」，改成显式列举不搬动任何映射 → 盲区不成立，登记删除。
 *   - user/keyword-groups：映射本就在仓储出口（`listByUser` 把 created_at/updated_at
 *     换成 camel 并解析 JSON terms），路由要列举就得给数组元素再写一遍 mapper，
 *     那是把映射搬回路由（违反分层）→ 所以只升 A，不删行。
 * 全程假仓储 / 假服务，不连库。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  buildCountryNameMaps: vi.fn(),
  getMaterialContent: vi.fn(),
  requireUserKeyOrThrow: vi.fn(),
  isEntitled: vi.fn(),
  listByUser: vi.fn(),
  countByUser: vi.fn(),
  create: vi.fn(),
  isOfficialName: vi.fn(),
}));

vi.mock("@/lib/db/context", () => ({
  getContext: () => ({
    dbPool: {},
    benefitSystemRepo: { isEntitled: mocks.isEntitled },
    user: { keywordGroupsRepo: { listByUser: mocks.listByUser, countByUser: mocks.countByUser, create: mocks.create } },
    officialKeywordGroupsRepo: { isOfficialName: mocks.isOfficialName },
  }),
}));
vi.mock("@/lib/services/country/alias-store", () => ({
  buildCountryNameMaps: mocks.buildCountryNameMaps,
}));
vi.mock("@/lib/services/learning-service", () => ({
  getMaterialContent: mocks.getMaterialContent,
}));
vi.mock("@/lib/middleware/auth", () => ({
  requireUserKeyOrThrow: mocks.requireUserKeyOrThrow,
}));

import { GET as countryMapGET } from "@/app/api/catalog/country-name-map/route";
import { GET as materialContentGET } from "@/app/api/learning/materials/[materialId]/content/route";
import { GET as keywordGroupsGET, POST as keywordGroupsPOST } from "@/app/api/user/keyword-groups/route";

const SNAKE_KEY = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;
const req = (path: string) => new NextRequest(`http://localhost:3000${path}`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserKeyOrThrow.mockResolvedValue({ userId: 7 });
  mocks.isOfficialName.mockResolvedValue(false);
  mocks.countByUser.mockResolvedValue(0);
});

describe("GET /api/catalog/country-name-map", () => {
  it("信封只列举三个映射；buildCountryNameMaps 加字段不会自动上网", async () => {
    mocks.buildCountryNameMaps.mockResolvedValue({
      countries: { Turkey: "土耳其", Türkiye: "土耳其" },
      regions: { Asia: "亚洲" },
      zhToEn: { 土耳其: "Turkey" },
      // 服务哪天在这类型上补内部字段（统计、缓存水位）都不该变成对外契约
      updatedAt: 1700000000,
      rowCount: 12,
    });

    const res = await countryMapGET(req("/api/catalog/country-name-map"), {} as never);
    const body = await res.json();

    expect([...Object.keys(body)].sort()).toEqual(["countries", "regions", "zhToEn"]);
    expect(body.countries).toEqual({ Turkey: "土耳其", Türkiye: "土耳其" });
    // 映射内部的 key 是国家名/区域名（数据键），大小写与重音都得原样留着
    expect(Object.keys(body.countries).filter((k) => SNAKE_KEY.test(k))).toEqual([]);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=86400");
  });
});

describe("GET /api/learning/materials/[materialId]/content", () => {
  it("只发四键；null 仍占位（前端据此判有无附件），服务内部字段不上网", async () => {
    mocks.getMaterialContent.mockResolvedValue({
      contentZh: "正文", contentEn: "Body", fileUrl: null, fileName: null,
      materialId: "M-1", isPremium: 1,
    });

    const res = await materialContentGET(
      req("/api/learning/materials/M1/content"),
      { params: Promise.resolve({ materialId: "M1" }) } as never,
    );
    const body = await res.json();

    expect(body).toEqual({ contentZh: "正文", contentEn: "Body", fileUrl: null, fileName: null });
    // 默认字典序按码点比：大写 N 小于大写 U，所以 fileName 排在 fileUrl 前
    expect([...Object.keys(body)].sort()).toEqual(["contentEn", "contentZh", "fileName", "fileUrl"]);
    expect("fileUrl" in body).toBe(true);
  });

  it("服务抛付费墙（401/403）→ 走标准错误 envelope，不混进裸载荷", async () => {
    mocks.getMaterialContent.mockRejectedValue({ status: 403, code: 40301, message: "请先购买后查看" });

    const res = await materialContentGET(
      req("/api/learning/materials/M1/content"),
      { params: Promise.resolve({ materialId: "M1" }) } as never,
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toEqual({ code: 40301, message: "请先购买后查看" });
  });

  it("materialId 为空 → 400（参数校验在取数之前，不触服务）", async () => {
    const res = await materialContentGET(
      req("/api/learning/materials//content"),
      { params: Promise.resolve({ materialId: "" }) } as never,
    );
    expect(res.status).toBe(400);
    expect(mocks.getMaterialContent).not.toHaveBeenCalled();
  });
});

describe("GET /api/user/keyword-groups", () => {
  it("有权益：{ entitled, groups }，组项五键全 camel（仓储已把 *_at 改名）", async () => {
    mocks.isEntitled.mockResolvedValue(true);
    mocks.listByUser.mockResolvedValue([
      { id: 3, name: "光伏", terms: ["组件", "逆变器"], createdAt: "2026-10-01 08:00:00", updatedAt: "2026-10-02 09:00:00" },
    ]);

    const body = await (await keywordGroupsGET(req("/api/user/keyword-groups"), {} as never)).json();

    expect(body).toEqual({
      entitled: true,
      groups: [{ id: 3, name: "光伏", terms: ["组件", "逆变器"], createdAt: "2026-10-01 08:00:00", updatedAt: "2026-10-02 09:00:00" }],
    });
    expect([...Object.keys(body)].sort()).toEqual(["entitled", "groups"]);
    expect([...Object.keys(body.groups[0])].sort()).toEqual(["createdAt", "id", "name", "terms", "updatedAt"]);
    expect(Object.keys(body.groups[0]).filter((k) => SNAKE_KEY.test(k))).toEqual([]);
  });

  it("无权益：entitled:false + 空数组（锁定态靠这个标志渲染，不能改报 403）", async () => {
    mocks.isEntitled.mockResolvedValue(false);

    const res = await keywordGroupsGET(req("/api/user/keyword-groups"), {} as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ entitled: false, groups: [] });
    expect(mocks.listByUser).not.toHaveBeenCalled();
  });

  it("POST 成功出口只回 id（不把仓储行的其余列拼进响应）", async () => {
    mocks.isEntitled.mockResolvedValue(true);
    mocks.create.mockResolvedValue({ id: 9 });

    const res = await keywordGroupsPOST(
      new NextRequest("http://localhost:3000/api/user/keyword-groups", {
        method: "POST",
        body: JSON.stringify({ name: "储能", terms: ["电池"] }),
      }),
      {} as never,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ id: 9 });
    expect(mocks.isOfficialName).toHaveBeenCalledWith("储能");
  });
});
