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
});
