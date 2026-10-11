/**
 * 节点码倒排表唯一写入方（search-sync/notice-nodes）
 *
 * 守的是三件事：
 * 1) 与 MySQL CRC32() 同值 —— 整套「集合没变就别写」的判断都压在这条上。
 *    用例里的数不是算出来的，是从生产库 SELECT CRC32(...) 实测抄回来的（temp/probe116.out.json，
 *    2026-10-11），并把 300 条真实公告的 COUNT+SUM 与 SQL JSON_TABLE 侧对拍过（差异 0）。
 * 2) 表不存在时只降级、不报错 —— 建表是人工闸口，代码不能先于它坏掉宽表同步。
 * 3) 写只发生在集合真的变了的时候；列值清空 ⇒ 桥表必须归零（读侧不许从倒排表捞出没码的公告）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { crc32 as zlibCrc32 } from "node:zlib";
import type { Pool } from "mysql2/promise";
import {
  NOTICE_NODES_TABLE,
  crc32,
  nodesFingerprint,
  noticeNodesTableReady,
  upsertNoticeNodes,
  deleteNoticeNodes,
  detectNoticeNodesMismatchIds,
  __resetNoticeNodesCache,
} from "@/lib/services/search-sync/notice-nodes";

/** 生产库实测值：SELECT CRC32('abc') → 891568578 */
const DB_CRC32: Array<[string, number]> = [
  ["abc", 891568578],
  ["", 0],
  ["UGT-B-10", 3054156403],
  ["UGT-B-10101500", 901938897],
  ["10101500", 2039086006],
  ["hello world", 222957957],
];

interface FakeCall { sql: string; params: unknown[] }

/**
 * 假 pool：按 SQL 关键字路由预置结果，并把每次调用原样记下来。
 * 路由而不是「按顺序 shift」：本模块一次 upsert 会发 1 次存在性 + 1 次指纹 + N 次写，
 * 顺序断言会把人绑死在实现细节上，而「有没有发 DELETE/INSERT」才是要守的东西。
 */
function makePool(spec: {
  tableExists?: boolean;
  fingerprints?: Array<{ notice_id: number; c: number; s: number }>;
  mismatches?: Array<{ id: number; want: number; got: number }>;
  affected?: number;
}) {
  const calls: FakeCall[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql: String(sql), params: params as unknown[] });
    const s = String(sql);
    if (s.includes("INFORMATION_SCHEMA.TABLES")) return [[{ n: spec.tableExists === false ? 0 : 1 }]];
    if (s.includes("IFNULL(SUM(CRC32(node))")) return [spec.fingerprints ?? []];
    if (s.includes(") want,")) return [spec.mismatches ?? []];
    if (/^\s*DELETE/i.test(s.trim())) return [{ affectedRows: spec.affected ?? 0 }];
    if (/^\s*INSERT/i.test(s.trim())) return [{ affectedRows: spec.affected ?? 0 }];
    return [[]];
  });
  return { pool: { query } as unknown as Pool, calls };
}

beforeEach(() => {
  __resetNoticeNodesCache();
  vi.restoreAllMocks();
});

describe("crc32 与 MySQL 同值", () => {
  it.each(DB_CRC32)("CRC32(%j) = %i", (input, expected) => {
    expect(crc32(input)).toBe(expected);
  });

  it("与 Node 自带 zlib.crc32 逐串相等（含非 ASCII）", () => {
    // 上面那组钉的是「与 MySQL 同值」（数值从生产库 SELECT CRC32(...) 实测定住），本组钉的是「本地实现不出版本」：
    // 本模块不用 zlib.crc32 本身，是因为那个函数 Node 20.15/22.2 以后才有，
    // 而生产运行时的 Node 版本本仓库没钉（只有 CI 是 24）。
    for (const s of ["abc", "", "UGT-B-10", "UGT-B-10101500", "联合国", "a→b", "🏭"] as string[]) {
      expect(crc32(s)).toBe(zlibCrc32(Buffer.from(s, "utf8")) as number);
    }
  });
});

describe("nodesFingerprint", () => {
  it("空集合 = {0,0}（与 SQL 侧无行时 IFNULL(SUM(...),0) 对齐）", () => {
    expect(nodesFingerprint([])).toEqual({ count: 0, sum: 0 });
  });

  it("顺序无关（可交换求和）", () => {
    const a = nodesFingerprint(["UGT-B-10", "UGT-B-10101500"]);
    const b = nodesFingerprint(["UGT-B-10101500", "UGT-B-10"]);
    expect(a).toEqual(b);
  });

  it("集合变了就一定变（数量相同、内容不同也要看得见）", () => {
    const a = nodesFingerprint(["UGT-B-10101500"]);
    const b = nodesFingerprint(["UGT-B-10101600"]);
    expect(a.count).toBe(b.count);
    expect(a.sum).not.toBe(b.sum);
  });
});

describe("noticeNodesTableReady", () => {
  it("表缺失 → false，并且只警告一次", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { pool, calls } = makePool({ tableExists: false });
    expect(await noticeNodesTableReady(pool)).toBe(false);
    expect(await noticeNodesTableReady(pool)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    // 结果被缓存：第二次调用不再发探测 SQL
    expect(calls.filter((c) => c.sql.includes("INFORMATION_SCHEMA.TABLES"))).toHaveLength(1);
  });

  it("探测失败（权限/网络抖动）按缺失处理，不抛出", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const query = vi.fn(async () => { throw new Error("boom"); });
    expect(await noticeNodesTableReady({ query } as unknown as Pool)).toBe(false);
  });
});

describe("upsertNoticeNodes", () => {
  it("表不存在 → 一条写 SQL 都不发", async () => {
    const { pool, calls } = makePool({ tableExists: false });
    const r = await upsertNoticeNodes(pool, [{ id: 1, backbone_path: "UGT-B-10,UGT-B-10101500" }]);
    expect(r).toEqual({ written: 0, skipped: 0, deleted: 0, badTokens: 0 });
    expect(calls.filter((c) => /^\s*(INSERT|DELETE)/i.test(c.sql.trim()))).toHaveLength(0);
  });

  it("集合没变 → 跳过，不发 DELETE/INSERT", async () => {
    const nodes = ["UGT-B-10", "UGT-B-10101500"];
    const fp = nodesFingerprint(nodes);
    const { pool, calls } = makePool({
      fingerprints: [{ notice_id: 7, c: fp.count, s: fp.sum }],
    });
    const r = await upsertNoticeNodes(pool, [{ id: 7, backbone_path: nodes.join(",") }]);
    expect(r).toMatchObject({ written: 0, skipped: 1, deleted: 0 });
    expect(calls.filter((c) => /^\s*(INSERT|DELETE)/i.test(c.sql.trim()))).toHaveLength(0);
  });

  it("集合变了 → 先删该 id 再插当前集合，且只插合法节点码", async () => {
    const { pool, calls } = makePool({ fingerprints: [{ notice_id: 8, c: 1, s: 123 }] });
    const r = await upsertNoticeNodes(pool, [{ id: 8, backbone_path: "UGT-B-10,UGT-B-10101500" }]);
    expect(r.written).toBe(1);
    const del = calls.find((c) => /^\s*DELETE/i.test(c.sql.trim()));
    const ins = calls.find((c) => /^\s*INSERT/i.test(c.sql.trim()));
    expect(del?.sql).toContain(NOTICE_NODES_TABLE);
    expect(del?.params).toEqual([8]);
    expect(ins?.params).toEqual([8, "UGT-B-10", 8, "UGT-B-10101500"]);
    expect(ins?.sql).toContain("ON DUPLICATE KEY UPDATE");
  });

  it("列值清空 → 只删不插（残行必须归零）", async () => {
    const { pool, calls } = makePool({ fingerprints: [{ notice_id: 9, c: 2, s: 999 }], affected: 2 });
    const r = await upsertNoticeNodes(pool, [{ id: 9, backbone_path: null }]);
    expect(r).toMatchObject({ written: 1, deleted: 2 });
    expect(calls.some((c) => /^\s*INSERT/i.test(c.sql.trim()))).toBe(false);
    expect(calls.some((c) => /^\s*DELETE/i.test(c.sql.trim()))).toBe(true);
  });

  it("非法 token → 不入表、不静默，点名到 console.error", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { pool, calls } = makePool({});
    const r = await upsertNoticeNodes(pool, [{ id: 10, backbone_path: "UGT-B-10,XX-BAD-1,UGT-C-99" }]);
    expect(r.badTokens).toBe(2);
    expect(err).toHaveBeenCalledTimes(1);
    const ins = calls.find((c) => /^\s*INSERT/i.test(c.sql.trim()));
    expect(ins?.params).toEqual([10, "UGT-B-10"]);
  });

  it("id 非法（0/NaN/负数）整批不进任何查询", async () => {
    const { pool, calls } = makePool({});
    const r = await upsertNoticeNodes(pool, [{ id: 0 }, { id: NaN }, { id: -3 }]);
    expect(r.written).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("重复 id 只算一条待写行（集合以最后一次拆分为准，不双写）", async () => {
    const { pool, calls } = makePool({});
    const r = await upsertNoticeNodes(pool, [
      { id: 11, backbone_path: "UGT-B-10" },
      { id: 11, backbone_path: "UGT-B-20" },
    ]);
    expect(r.written).toBeLessThanOrEqual(1);
    const ins = calls.find((c) => /^\s*INSERT/i.test(c.sql.trim()));
    expect(ins?.params).toEqual([11, "UGT-B-20"]);
  });
});

describe("deleteNoticeNodes", () => {
  it("去重后按批删，返回受影响行数合计", async () => {
    const { pool, calls } = makePool({ affected: 3 });
    const n = await deleteNoticeNodes(pool, [1, 1, 2, 0, NaN]);
    expect(n).toBe(3);
    const del = calls.find((c) => /^\s*DELETE/i.test(c.sql.trim()));
    expect(del?.params).toEqual([1, 2]);
  });

  it("表不存在 → 直接 0，不发 DELETE", async () => {
    const { pool, calls } = makePool({ tableExists: false });
    expect(await deleteNoticeNodes(pool, [1, 2])).toBe(0);
    expect(calls.some((c) => /^\s*DELETE/i.test(c.sql.trim()))).toBe(false);
  });
});

describe("detectNoticeNodesMismatchIds", () => {
  it("数量不等的那个 id 被抓出来", async () => {
    const { pool } = makePool({
      mismatches: [
        { id: 1, want: 2, got: 2 },
        { id: 2, want: 3, got: 1 },
      ],
    });
    expect(await detectNoticeNodesMismatchIds(pool, [1, 2])).toEqual([2]);
  });

  it("空列值 want=0（SQL 已把 NULL/空串归零，不该误报）", async () => {
    const { pool, calls } = makePool({ mismatches: [{ id: 5, want: 0, got: 0 }] });
    expect(await detectNoticeNodesMismatchIds(pool, [5])).toEqual([]);
    const sql = calls.find((c) => c.sql.includes("want"))?.sql ?? "";
    expect(sql).toContain("ns.backbone_path = '', 0");
  });
});
