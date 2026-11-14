/**
 * 采购需求发布域核心单测（mock 连接池，不连库）
 * @module tests/unit/lib/services/procurement/core
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import { createProject, submitProject } from "@/lib/services/procurement/projects";
import { formatProjectReference, formatTenderNo, isProjectReference } from "@/lib/services/procurement/reference";
import { isBuyerPublishable, upsertBuyer } from "@/lib/services/procurement/buyers";

const NOW = 1_777_593_600;

describe("reference — 编号器", () => {
  it("OSPR-{年}-{6位id}", () => {
    expect(formatProjectReference(7, NOW)).toBe("OSPR-2026-000007");
    expect(isProjectReference("OSPR-2026-000007")).toBe(true);
    expect(isProjectReference("OSRFQ-2026-000007")).toBe(false);
  });
  it("OSPT 同构", () => {
    expect(formatTenderNo(3, NOW)).toBe("OSPT-2026-000003");
  });
  it("非法 id 抛错", () => {
    expect(() => formatProjectReference(0, NOW)).toThrow();
  });
});

describe("buyers — 主体 upsert 与发布闸", () => {
  function poolWith(rowsByLike: Array<[string, unknown[]]>) {
    const db = {
      query: vi.fn(async (sql: string) => {
        for (const [needle, rows] of rowsByLike) if (sql.includes(needle)) return [rows];
        return [[]];
      }),
      execute: vi.fn(async () => [{ affectedRows: 1 }]),
    } as unknown as Pool;
    return db;
  }

  it("未认证主体不可发布", () => {
    expect(isBuyerPublishable({ status: "pending" })).toBe(false);
    expect(isBuyerPublishable({ status: "verified" })).toBe(true);
  });

  it("首次保存：INSERT pending，再 PATCH 补齐资料", async () => {
    const db = poolWith([["SELECT * FROM procurement_buyers", []]]);
    const r1 = await upsertBuyer(db, { userId: 42, fields: { org_name: "西安某新能源有限公司" } });
    expect(r1.status).toBe("pending");

    const r2 = await upsertBuyer(db, {
      userId: 42,
      fields: { org_name: "西安某新能源有限公司", country: "中国" },
    });
    expect(r2.ok).toBe(true);
  });

  it("已核验主体改注册号 → 状态回落 pending（防先核验后改名绕过）", async () => {
    const db = poolWith([
      [
        "SELECT * FROM procurement_buyers",
        [
          {
            id: 1,
            user_id: 42,
            org_name: "旧名称",
            reg_no: "91610100OLD",
            status: "verified",
            created_at: NOW,
            updated_at: NOW,
          },
        ],
      ],
    ]);
    const r = await upsertBuyer(db, { userId: 42, fields: { reg_no: "91610100NEW" } });
    expect(r.status).toBe("pending");
  });

  // ── 重提语义（迁移 017）：need_info 补件重提 / 换证据重核 / 队列位置不被打乱 ──
  function capturePool(row: Record<string, unknown> | null) {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const db = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        if (sql.includes("SELECT * FROM procurement_buyers")) return [row ? [row] : []];
        return [{ affectedRows: 1 }];
      }),
      execute: vi.fn(async () => [{ affectedRows: 1 }]),
    } as unknown as Pool;
    const update = () => calls.find((c) => c.sql.startsWith("UPDATE procurement_buyers SET"));
    return { db, calls, update };
  }

  const buyerRow = (over: Record<string, unknown>) => ({
    id: 1,
    user_id: 42,
    org_name: "西安某新能源有限公司",
    reg_no: "91610100OLD",
    official_email: "buy@a.com",
    license_file_hash: "hash-old",
    status: "pending",
    submitted_at: 1_000,
    created_at: NOW,
    updated_at: NOW,
    ...over,
  });

  it("首次保存：INSERT 一并落 submitted_at（进队列时间）", async () => {
    const { db, calls } = capturePool(null);
    await upsertBuyer(db, { userId: 42, at: NOW, fields: { org_name: "西安某新能源有限公司" } });
    const insert = calls.find((c) => c.sql.startsWith("INSERT INTO procurement_buyers"));
    expect(insert?.sql).toContain("submitted_at");
    expect(insert?.params).toEqual([42, "西安某新能源有限公司", NOW, NOW, NOW]);
  });

  it("need_info 补件再保存 → 回到 pending 并刷新 submitted_at（否则被打回的人永远卡住）", async () => {
    const { db, update } = capturePool(buyerRow({ status: "need_info" }));
    const r = await upsertBuyer(db, { userId: 42, at: NOW, fields: { license_file_hash: "hash-new" } });
    expect(r.status).toBe("pending");
    const u = update();
    expect(u?.sql).toContain("submitted_at = ?");
    expect(u?.params).toContain("pending");
    expect(u?.params?.at(-1)).toBe(1);
  });

  it("已核验主体换执照 → 回落 pending（核验证据不能悄悄换掉）", async () => {
    const { db, update } = capturePool(buyerRow({ status: "verified" }));
    const r = await upsertBuyer(db, { userId: 42, at: NOW, fields: { license_file_hash: "hash-another-company" } });
    expect(r.status).toBe("pending");
    expect(update()?.sql).toContain("submitted_at = ?");
  });

  it("已核验主体只改地址 → 保持 verified，不刷新 submitted_at", async () => {
    const { db, update } = capturePool(buyerRow({ status: "verified" }));
    const r = await upsertBuyer(db, { userId: 42, at: NOW, fields: { address: "西安市高新区" } });
    expect(r.status).toBe("verified");
    expect(update()?.sql).not.toContain("submitted_at = ?");
  });

  it("pending 重复保存 → 不刷新 submitted_at（避免把队尾刷成队首）", async () => {
    const { db, update } = capturePool(buyerRow({ status: "pending", submitted_at: 1_000 }));
    const r = await upsertBuyer(db, { userId: 42, at: NOW, fields: { address: "西安市高新区" } });
    expect(r.status).toBe("pending");
    expect(update()?.sql).not.toContain("submitted_at = ?");
  });

  it("restricted 不自动放开（人工判定的不予使用，须走申诉）", async () => {
    const { db } = capturePool(buyerRow({ status: "restricted" }));
    const r = await upsertBuyer(db, { userId: 42, at: NOW, fields: { org_name: "换个名字试试" } });
    expect(r.status).toBe("restricted");
  });
});

describe("projects — 创建与提交（确认最终版本）", () => {
  function fakeConn(handlers: Array<[string, (sql: string) => unknown]>) {
    const calls: Array<[string, unknown[] | undefined]> = [];
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        calls.push([sql, params]);
        if (sql.includes("INSERT INTO procurement_projects")) return [{ insertId: 7 }];
        for (const [needle, ret] of handlers) if (sql.includes(needle)) return ret(sql);
        return [{ affectedRows: 1 }];
      }),
    };
    const pool = { getConnection: vi.fn().mockResolvedValue(conn) } as unknown as Pool;
    return { pool, conn, calls };
  }

  it("创建：PENDING 占位 → OSPR 编号同事务回填", async () => {
    const { pool, calls } = fakeConn([]);
    const r = await createProject(pool, { buyerId: 1, at: NOW });
    expect(r.projectId).toBe(7);
    expect(r.reference).toBe("OSPR-2026-000007");
    expect(calls.some(([sql]) => sql.includes("UPDATE procurement_projects SET reference"))).toBe(true);
  });

  it("提交：冻结快照 + version_no+1 + 附件挂版本 + 主品类快照", async () => {
    const projectRow = {
      id: 7,
      reference: "OSPR-2026-000007",
      buyer_id: 1,
      version_no: 1,
      status: "draft",
      title_zh: "采购光伏组件 10MW",
      created_at: NOW,
    };
    const { pool, calls, conn } = fakeConn([
      ["SELECT * FROM procurement_projects", () => [[projectRow]]],
      [
        "SELECT id, status, version_no, buyer_id FROM procurement_projects",
        () => [[{ id: 7, status: "draft", version_no: 1, buyer_id: 1 }]],
      ],
      [
        "FROM procurement_items",
        () => [[{ id: 1, ugt_code: "UGT-0301", line_no: 1, name_zh: "组件" }]],
      ],
      ["FROM procurement_attachments", () => [[{ file_key: "attach_7_1_1.pdf" }]]],
      ["FROM procurement_lots", () => [[{ lot_no: "LOT-01", title: "光伏组件" }]]],
      ["SELECT status FROM procurement_buyers", () => [[{ status: "verified" }]]],
    ]);

    const r = await submitProject(pool, { projectId: 7, confirmedBy: 42, at: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.versionNo).toBe(2);

    const rev = calls.find(([sql]) => sql.includes("INSERT INTO procurement_revisions"));
    expect(rev).toBeDefined();
    const snapshot = JSON.parse(String(rev![1]?.[2]));
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.attachments).toHaveLength(1);

    const attachMove = calls.find(([sql]) => sql.includes("UPDATE procurement_attachments SET version_no"));
    expect(attachMove).toBeDefined();

    const transition = calls.find(([sql]) => sql.includes("UPDATE procurement_projects") && sql.includes("status = ?"));
    expect(transition).toBeDefined();
    expect(transition![1]).toContain("UGT-0301");
    expect(conn.commit).toHaveBeenCalledOnce();
  });

  it("无明细不可提交（可招标性的最低要求）", async () => {
    const projectRow = { id: 7, reference: "OSPR-2026-000007", buyer_id: 1, version_no: 0, status: "draft" };
    const { pool } = fakeConn([
      ["SELECT * FROM procurement_projects", () => [[projectRow]]],
      ["FROM procurement_items", () => [[]]],
    ]);
    const r = await submitProject(pool, { projectId: 7, confirmedBy: 42, at: NOW });
    expect(r).toEqual({ ok: false, reason: "empty_items" });
  });

  it("主体未认证不可提交（资格前置，不再等审核通过才打回）", async () => {
    const projectRow = { id: 7, reference: "OSPR-2026-000007", buyer_id: 1, version_no: 4, status: "draft" };
    const { pool, calls, conn } = fakeConn([
      ["SELECT * FROM procurement_projects", () => [[projectRow]]],
      ["FROM procurement_items", () => [[{ id: 1, ugt_code: "UGT-0301", line_no: 1, name_zh: "组件" }]]],
      ["SELECT status FROM procurement_buyers", () => [[{ status: "pending" }]]],
    ]);
    const r = await submitProject(pool, { projectId: 7, confirmedBy: 42, at: NOW });
    expect(r).toEqual({ ok: false, reason: "buyer_not_verified" });
    // 未认证时不落任何写入：快照、附件挂版本、状态转移都不该发生
    expect(calls.some(([sql]) => sql.includes("INSERT INTO procurement_revisions"))).toBe(false);
    expect(calls.some(([sql]) => sql.includes("UPDATE procurement_projects"))).toBe(false);
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it("主体 restricted 同样拦在提交（与发布闸同一口径）", async () => {
    const projectRow = { id: 7, reference: "OSPR-2026-000007", buyer_id: 1, version_no: 4, status: "need_info" };
    const { pool } = fakeConn([
      ["SELECT * FROM procurement_projects", () => [[projectRow]]],
      ["FROM procurement_items", () => [[{ id: 1, ugt_code: "UGT-0301", line_no: 1, name_zh: "组件" }]]],
      ["SELECT status FROM procurement_buyers", () => [[{ status: "restricted" }]]],
    ]);
    const r = await submitProject(pool, { projectId: 7, confirmedBy: 42, at: NOW });
    expect(r).toEqual({ ok: false, reason: "buyer_not_verified" });
  });
});
