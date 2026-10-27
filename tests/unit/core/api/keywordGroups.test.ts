/**
 * 产品关键词组 API client 测试
 * @module tests/unit/core/api/keywordGroups.test
 * @description 钉住「我的词组」下拉的加载路径契约（性能根因所在）：
 *              ① 读走 apiCached —— 重复打开/并发打开只发一次请求；
 *              ② 端点返回裸载荷，client 直接透传本体（2026-10 迁移：去 {code:0,message,data} 信封）；
 *              ③ 任何写操作（建/改/删）后必须失效 —— 管理页与搜索面板共用同一份缓存；
 *              ④ 换账号可主动失效 —— 缓存键只有 URL，词组却是用户私有数据。
 *              t/lodash 无关：本文件不触碰 DOM，只 stub fetch。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchKeywordGroups,
  fetchOfficialKeywordGroups,
  createKeywordGroup,
  updateKeywordGroup,
  deleteKeywordGroup,
  invalidateKeywordGroups,
} from "@/core/api/keywordGroups";
import { clearApiCache } from "@/core/http";

vi.mock("@/core/perf", () => ({ recordApiMetric: vi.fn() }));

const fetchMock = vi.fn<typeof fetch>();

const listResp = (n: number) =>
  Response.json({
    entitled: true,
    groups: [{ id: n, name: `词组${n}`, terms: ["光伏", "逆变器"] }],
  });

beforeEach(() => {
  clearApiCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  clearApiCache();
  vi.unstubAllGlobals();
});

/** 统计命中「读」端点的 fetch 次数（写操作是不同 method，单独数） */
const readCalls = () =>
  fetchMock.mock.calls.filter(
    ([, init]) => !init?.method || init.method === "GET",
  ).length;

/** 官方端点 GET 次数：验证与用户私有词组缓存完全分离 */
const officialCalls = () =>
  fetchMock.mock.calls.filter(([u]) => String(u).includes("/api/keyword-groups/official")).length;

const officialResp = () =>
  Response.json({ groups: [{ id: 1, name: "官方A", terms: ["x"], categoryCode: "energy", sortOrder: 0 }] });

describe("fetchOfficialKeywordGroups（公开数据独立缓存）", () => {
  it("读取 { groups }（camelCase）；写我的词组不失效官方缓存", async () => {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input);
      if (url.includes("/api/keyword-groups/official")) return Promise.resolve(officialResp());
      return Promise.resolve(listResp(1));
    });
    const r = await fetchOfficialKeywordGroups();
    expect(r.groups[0].name).toBe("官方A");
    expect(r.groups[0].categoryCode).toBe("energy");
    expect(officialCalls()).toBe(1);
    // 写我的词组→仅失效用户前缀缓存，官方缓存不动 → 再读仍命中，不再发请求
    fetchMock.mockResolvedValueOnce(Response.json({ id: 2 }));
    await createKeywordGroup("新词组", ["a"]);
    await fetchOfficialKeywordGroups();
    expect(officialCalls()).toBe(1);
  });
});

describe("fetchKeywordGroups 加载路径", () => {
  it("连续两次读取只发一次请求（命中 TTL 缓存，下拉二次打开零延迟）", async () => {
    fetchMock.mockResolvedValue(listResp(1));
    await fetchKeywordGroups();
    await fetchKeywordGroups();
    expect(readCalls()).toBe(1);
  });

  it("并发读取只发一次请求（飞行中去重，快速反复点开不叠加请求）", async () => {
    fetchMock.mockResolvedValue(listResp(1));
    const [a, b] = await Promise.all([fetchKeywordGroups(), fetchKeywordGroups()]);
    expect(readCalls()).toBe(1);
    expect(a).toEqual(b);
  });

  it("读取裸载荷：返回 { entitled, groups } 本体（服务端已不包信封）", async () => {
    fetchMock.mockResolvedValue(listResp(7));
    const r = await fetchKeywordGroups();
    expect(r.entitled).toBe(true);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].terms).toEqual(["光伏", "逆变器"]);
    // 回归钉子：漏读 .data 时 groups 会变 undefined，下拉恒空
    expect(Array.isArray((r as { groups?: unknown }).groups)).toBe(true);
  });

  it("force=true 跳过缓存重取（管理页 reload 用）", async () => {
    fetchMock.mockResolvedValueOnce(listResp(1)).mockResolvedValueOnce(listResp(2));
    await fetchKeywordGroups();
    const r = await fetchKeywordGroups(true);
    expect(readCalls()).toBe(2);
    expect(r.groups[0].name).toBe("词组2");
  });
});

describe("写操作后缓存失效", () => {
  it("新建后读取必须重新发请求，且拿到新数据", async () => {
    fetchMock.mockResolvedValueOnce(listResp(1));
    await fetchKeywordGroups();
    expect(readCalls()).toBe(1);

    fetchMock.mockResolvedValueOnce(Response.json({ id: 2 }));
    await createKeywordGroup("新词组", ["风机"]);

    fetchMock.mockResolvedValueOnce(listResp(2));
    const after = await fetchKeywordGroups();
    expect(readCalls()).toBe(2);
    expect(after.groups[0].name).toBe("词组2");
  });

  it("改名后读取重新发请求", async () => {
    fetchMock.mockResolvedValueOnce(listResp(1));
    await fetchKeywordGroups();
    fetchMock.mockResolvedValueOnce(Response.json({ ok: true }));
    await updateKeywordGroup(1, { name: "改名后" });
    fetchMock.mockResolvedValueOnce(listResp(3));
    await fetchKeywordGroups();
    expect(readCalls()).toBe(2);
  });

  it("删除后读取重新发请求", async () => {
    fetchMock.mockResolvedValueOnce(listResp(1));
    await fetchKeywordGroups();
    fetchMock.mockResolvedValueOnce(Response.json({ ok: true }));
    await deleteKeywordGroup(1);
    fetchMock.mockResolvedValueOnce(listResp(4));
    await fetchKeywordGroups();
    expect(readCalls()).toBe(2);
  });

  it("写失败不得清空缓存（失败仍是旧数据，下次打开照常命中）", async () => {
    fetchMock.mockResolvedValueOnce(listResp(1));
    await fetchKeywordGroups();
    fetchMock.mockResolvedValueOnce(
      Response.json({ code: 40001, message: "已存在同名词组" }, { status: 400 }),
    );
    await expect(createKeywordGroup("重名", ["x"])).rejects.toThrow();
    await fetchKeywordGroups();
    expect(readCalls()).toBe(1);
  });

  it("invalidateKeywordGroups 供调用方主动失效（换账号场景）", async () => {
    fetchMock.mockResolvedValueOnce(listResp(1)).mockResolvedValueOnce(listResp(2));
    await fetchKeywordGroups();
    invalidateKeywordGroups();
    const r = await fetchKeywordGroups();
    expect(readCalls()).toBe(2);
    expect(r.groups[0].name).toBe("词组2");
  });
});

/**
 * 跨标签页一致性：apiCached 的 Map 是**每标签页各一份**的模块级缓存，
 * 在 A 页写完词组，B 页的缓存不会自动作废（旧行为：最长脏到 TTL 自然过期）。
 */
describe("跨标签页失效广播", () => {
  const CROSS_TAB_KEY = "supply-os:kw-groups:invalidated-at";
  /** 模拟其他标签页发出的 storage 事件（浏览器不会在源标签页自触，故需手工扮对端） */
  const fireStorageEvent = (key: string | null = CROSS_TAB_KEY) =>
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: String(Date.now()) }));

  beforeEach(() => {
    window.localStorage.removeItem(CROSS_TAB_KEY);
  });

  it("写成功时敲下 localStorage 水位键，供其他标签页监听", async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 5 }));
    await createKeywordGroup("新词组", ["a"]);
    expect(window.localStorage.getItem(CROSS_TAB_KEY)).toBeTruthy();
  });

  it("其他标签页写入后，本标签页下一次读重新发请求", async () => {
    fetchMock.mockResolvedValueOnce(listResp(1)).mockResolvedValueOnce(listResp(2));
    await fetchKeywordGroups();
    expect(readCalls()).toBe(1);

    // 对端标签页写了词组：本标签页缓存必须作废，不能继续脏读
    fireStorageEvent();
    const r = await fetchKeywordGroups();
    expect(readCalls()).toBe(2);
    expect(r.groups[0].name).toBe("词组2");
  });

  it("无关 key 的 storage 事件不误伤词组缓存", async () => {
    fetchMock.mockResolvedValue(listResp(1));
    await fetchKeywordGroups();
    expect(readCalls()).toBe(1);

    fireStorageEvent("some-other-feature-key");
    await fetchKeywordGroups();
    expect(readCalls()).toBe(1);
  });

  it("写失败不得广播（未落库的变更不该让对端重拉）", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ code: 40001, message: "词组数量已达上限" }, { status: 400 }),
    );
    await expect(createKeywordGroup("超限", ["a"])).rejects.toThrow();
    expect(window.localStorage.getItem(CROSS_TAB_KEY)).toBeNull();
  });
});
