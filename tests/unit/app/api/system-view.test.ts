/**
 * /api/system/links 与 /api/system/icp 的 wire 契约取证（命名红线② B 组收敛）。
 *
 * 这两个端点都是模块级缓存 + 整块透出，静态面看不见键；探针只能证「现在没 snake」，
 * 钉不住「以后别漏」。本文件同时钉两类事：
 *   ① 列名/多余字段穿不出视图（links 显式列 4 键；icp 不再把内部缓存时间戳 ts 送上网）；
 *   ② 缓存命中分支与首次分支给出同一个形状（两条出口容易只测一条）。
 * 全程假 repo，不连库。
 */
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const { listFooterLinks, getIcpBah } = vi.hoisted(() => ({
  listFooterLinks: vi.fn(),
  getIcpBah: vi.fn(),
}));

vi.mock("@/lib/db/context", () => ({
  getContext: () => ({ systemRepo: { listFooterLinks, getIcpBah } }),
}));

const SNAKE_KEY = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;
const req = (path: string) => new NextRequest(`http://localhost:3000${path}`);

/** 路由带模块级缓存：每个用例重新装载模块，免得用例之间互相污染缓存态 */
async function loadLinksRoute() {
  vi.resetModules();
  return (await import("@/app/api/system/links/route")).GET;
}
async function loadIcpRoute() {
  vi.resetModules();
  return (await import("@/app/api/system/icp/route")).GET;
}

describe("GET /api/system/links", () => {
  it("行→视图只出 4 个契约键；SELECT 里多出来的列不会自动上网", async () => {
    listFooterLinks.mockResolvedValue([
      // 脏值 + 额外列：视图必须归一并把它挡住
      { id: 1, name: "微信", url: "https://weixin.qq.com", icon: "wechat", sort_order: 3, status: 1 },
      { id: "2", name: null, url: undefined, icon: 7, sort_order: 9, status: 1 },
    ]);
    const GET = await loadLinksRoute();
    const body = await (await GET(req("/api/system/links"), {} as never)).json();

    expect(body).toEqual([
      { id: 1, name: "微信", url: "https://weixin.qq.com", icon: "wechat" },
      { id: 2, name: "", url: "", icon: "7" },
    ]);
    for (const item of body) {
      expect([...Object.keys(item)].sort()).toEqual(["icon", "id", "name", "url"]);
      expect(Object.keys(item).filter((k) => SNAKE_KEY.test(k))).toEqual([]);
    }
  });

  it("TTL 内第二次请求走缓存分支，形状与首次一致（缓存对象本体不外泄）", async () => {
    listFooterLinks.mockResolvedValue([{ id: 5, name: "LinkedIn", url: "https://li", icon: "linkedin" }]);
    const GET = await loadLinksRoute();

    const first = await (await GET(req("/api/system/links"), {} as never)).json();
    const callsAfterFirst = listFooterLinks.mock.calls.length;
    const second = await (await GET(req("/api/system/links"), {} as never)).json();
    expect(second).toEqual(first);
    expect([...Object.keys(second[0])].sort()).toEqual(["icon", "id", "name", "url"]);
    // 命中缓存时不该再查库（用增量而不是绝对值：同一个 hoisted mock 跨用例累计）
    expect(listFooterLinks.mock.calls.length).toBe(callsAfterFirst);
  });

  it("查库异常 → 降级空数组（不是 null、不是错误信封之外的形状）", async () => {
    listFooterLinks.mockRejectedValue(new Error("db down"));
    const GET = await loadLinksRoute();
    const body = await (await GET(req("/api/system/links"), {} as never)).json();
    expect(body).toEqual([]);
  });
});

describe("GET /api/system/icp", () => {
  it("首次查询只出 bah；内部缓存时间戳 ts 不上网", async () => {
    getIcpBah.mockResolvedValue("京ICP备2026-test号");
    const GET = await loadIcpRoute();
    const body = await (await GET(req("/api/system/icp"), {} as never)).json();

    expect(body).toEqual({ bah: "京ICP备2026-test号" });
    expect("ts" in body).toBe(false);
  });

  it("缓存命中分支同样只出 bah（上一版这里 json(icpCache) 会把 ts 一起送出）", async () => {
    getIcpBah.mockResolvedValue("京ICP备2026-test号");
    const GET = await loadIcpRoute();
    await GET(req("/api/system/icp"), {} as never);

    // 第二次命中缓存：即便库里查不到也必须给出同一个形状
    getIcpBah.mockRejectedValue(new Error("db down"));
    const body = await (await GET(req("/api/system/icp"), {} as never)).json();
    expect(body).toEqual({ bah: "京ICP备2026-test号" });
    expect([...Object.keys(body)]).toEqual(["bah"]);
  });

  it("查库异常 → 降级空备案号，仍只有 bah 一个键", async () => {
    getIcpBah.mockRejectedValue(new Error("db down"));
    const GET = await loadIcpRoute();
    const body = await (await GET(req("/api/system/icp"), {} as never)).json();
    expect(body).toEqual({ bah: "" });
  });
});
