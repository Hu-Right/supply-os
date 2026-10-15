/**
 * 供应商品目自报落点服务单测（fake pool，无库）
 *
 * 钉住的口径：
 * - 形制过滤：L1 大类与脏码在归一层就被剔除，根本不进「点查树」那一条 SQL；
 * - 存在性丢弃：形制合法但树里查无（status≠1 或无此码）的码进 dropped，绝不落库；
 * - 空集清空：保留集为空时只发「清空 self_report」一条 DELETE，不发 NOT IN / INSERT；
 * - 来源隔离：所有读写 SQL 都限定 source='self_report'，不误伤行为/历史来源；
 * - 幂等：非空集合走「NOT IN 删除 + ODKU upsert」两步；name 取树的权威值而非入参；
 * - supplierId 非法（非正整数）零查库零写。
 */
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "mysql2/promise";

interface Call {
  sql: string;
  params: unknown[];
}

/** 造一棵够小的树：只提供声明为「存在」的码；其余码点查查不到 → 走 dropped */
function makePool(existing: Record<string, { name_zh: string; level: number }>) {
  const calls: Call[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params: params as unknown[] });
    if (/FROM crm_commodity_backbone/.test(sql)) {
      const codes = params as string[];
      const rows = codes
        .filter((c) => existing[c])
        .map((c) => ({ code: c, name_zh: existing[c].name_zh, level: existing[c].level }));
      return [rows];
    }
    if (/SELECT code, name FROM crm_supplier_backbone_interests/.test(sql)) {
      return [[]];
    }
    return [{ affectedRows: 0 }];
  });
  return { pool: { query } as unknown as Pool, calls };
}

describe("replaceSupplierSelfReport", () => {
  it("L1 与脏码在归一层剔除：不进点查树 SQL、不入库、不记 dropped", async () => {
    const { pool, calls } = makePool({ "UGT-0101": { name_zh: "电力、热力", level: 2 } });
    const { replaceSupplierSelfReport } = await import(
      "@/lib/services/commodity/supplier-self-report"
    );

    const r = await replaceSupplierSelfReport(pool, 7, [
      "UGT-01", // L1 大类 → 拒
      "UGT-XY", // 脏形制 → 拒
      "", // 空 → 拒
      "UGT-0101", // 合法且存在 → 落
      "  UGT-0101  ", // 去重
      12345, // 非字符串 → 拒
    ]);

    expect(r.stored).toEqual(["UGT-0101"]);
    expect(r.dropped).toEqual([]);

    const treeCall = calls.find((c) => /FROM crm_commodity_backbone/.test(c.sql))!;
    // 只有合法且去重后的 UGT-0101 进了存在性点查，L1/脏码根本没被拿去问树
    expect(treeCall.params).toEqual(["UGT-0101"]);
  });

  it("形制合法但树里换不出 → dropped 点名，且 INSERT 只带存得的码", async () => {
    const { pool, calls } = makePool({ "UGT-0101": { name_zh: "电力、热力", level: 2 } });
    const { replaceSupplierSelfReport } = await import(
      "@/lib/services/commodity/supplier-self-report"
    );

    const r = await replaceSupplierSelfReport(pool, 7, ["UGT-0101", "UGT-999999"]);

    expect(r.stored).toEqual(["UGT-0101"]);
    expect(r.dropped).toEqual(["UGT-999999"]);

    const insert = calls.find((c) => /INSERT INTO crm_supplier_backbone_interests/.test(c.sql))!;
    expect(insert.sql).toContain("ON DUPLICATE KEY UPDATE");
    // params 结构：[sid, code, name, level, source, weight, confidence] × 1 行
    expect(insert.params).toEqual([7, "UGT-0101", "电力、热力", 2, "self_report", 3.0, 1.0]);
    // 脏码不得混进写侧参数
    expect(insert.params).not.toContain("UGT-999999");
  });

  it("保留集为空：只发一条清空 self_report 的 DELETE，无 NOT IN、无 INSERT", async () => {
    const { pool, calls } = makePool({});
    const { replaceSupplierSelfReport } = await import(
      "@/lib/services/commodity/supplier-self-report"
    );

    const r = await replaceSupplierSelfReport(pool, 7, ["UGT-0101"]); // 树里全查不到

    expect(r.stored).toEqual([]);
    expect(r.dropped).toEqual(["UGT-0101"]);

    const dels = calls.filter((c) => /DELETE FROM crm_supplier_backbone_interests/.test(c.sql));
    expect(dels).toHaveLength(1);
    expect(dels[0].sql).not.toContain("NOT IN");
    expect(dels[0].params).toEqual([7, "self_report"]);
    expect(calls.some((c) => /INSERT INTO/.test(c.sql))).toBe(false);
  });

  it("空入参：同样只发清空 DELETE（提交空集合即清空全部自报）", async () => {
    const { pool, calls } = makePool({});
    const { replaceSupplierSelfReport } = await import(
      "@/lib/services/commodity/supplier-self-report"
    );

    const r = await replaceSupplierSelfReport(pool, 7, []);

    expect(r).toEqual({ stored: [], dropped: [] });
    const dels = calls.filter((c) => /DELETE FROM crm_supplier_backbone_interests/.test(c.sql));
    expect(dels).toHaveLength(1);
    expect(dels[0].params).toEqual([7, "self_report"]);
  });

  it("非空集合两步：NOT IN 删除保留集 + ODKU，删除与写入都锁 self_report 来源", async () => {
    const { pool, calls } = makePool({
      "UGT-0101": { name_zh: "电力、热力", level: 2 },
      "UGT-010101": { name_zh: "电力生产", level: 3 },
    });
    const { replaceSupplierSelfReport } = await import(
      "@/lib/services/commodity/supplier-self-report"
    );

    const r = await replaceSupplierSelfReport(pool, 7, ["UGT-0101", "UGT-010101"]);
    expect(r.stored.sort()).toEqual(["UGT-0101", "UGT-010101"]);

    const del = calls.find((c) => /DELETE FROM crm_supplier_backbone_interests/.test(c.sql))!;
    expect(del.sql).toContain("NOT IN");
    expect(del.sql).toContain("source = ?");
    expect(del.params).toEqual([7, "self_report", "UGT-0101", "UGT-010101"]);

    const insert = calls.find((c) => /INSERT INTO crm_supplier_backbone_interests/.test(c.sql))!;
    expect(insert.sql).toContain("source");
    // 两行 × 7 列
    expect(insert.params).toHaveLength(14);
    expect(insert.params.filter((p) => p === "self_report")).toHaveLength(2);
  });

  it("supplierId 非法：零查库零写，返回空结果", async () => {
    const { pool, calls } = makePool({ "UGT-0101": { name_zh: "x", level: 2 } });
    const { replaceSupplierSelfReport } = await import(
      "@/lib/services/commodity/supplier-self-report"
    );

    const r = await replaceSupplierSelfReport(pool, 0, ["UGT-0101"]);
    expect(r).toEqual({ stored: [], dropped: [] });
    expect(calls).toHaveLength(0);
  });
});

describe("listSupplierSelfReport", () => {
  it("按 source=self_report 读回并映射 name→nameZh", async () => {
    const calls: Call[] = [];
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return [[{ code: "UGT-0101", name: "电力、热力" }, { code: "UGT-0102", name: "煤炭开采" }]];
    });
    const pool = { query } as unknown as Pool;
    const { listSupplierSelfReport } = await import(
      "@/lib/services/commodity/supplier-self-report"
    );

    const nodes = await listSupplierSelfReport(pool, 7);
    expect(nodes).toEqual([
      { code: "UGT-0101", nameZh: "电力、热力" },
      { code: "UGT-0102", nameZh: "煤炭开采" },
    ]);
    expect(calls[0].sql).toContain("source = ?");
    expect(calls[0].params).toEqual([7, "self_report"]);
  });

  it("supplierId 非法：空数组、不查库", async () => {
    const query = vi.fn();
    const pool = { query } as unknown as Pool;
    const { listSupplierSelfReport } = await import(
      "@/lib/services/commodity/supplier-self-report"
    );

    expect(await listSupplierSelfReport(pool, -1)).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
