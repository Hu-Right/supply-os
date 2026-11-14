/**
 * 授权书核验回调（applyAuthorizationVerification）单测
 *
 * @module tests/unit/lib/services/procurement/authorization-verify
 * @description 2026-11：授权核验从"后台直写库"收口为 HMAC 回调，结论同时进通知模块。
 *              这里钉住：幂等（同键/同状态）、驳回必须给理由、状态与核验人落库、
 *              通知的类型/深链/幂等键。
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
// authorization.ts 经 file-upload 拉起 server-only，单测内 mock 掉上传落库
vi.mock("@/lib/services/file-upload", () => ({
  saveProcurementScan: vi.fn(async (p: { filename: string }) => ({
    url: `/api/procurement/authorization-files/${p.filename}`,
    filename: p.filename,
  })),
}));
import { applyAuthorizationVerification } from "@/lib/services/procurement/authorization";

const NOW = 1_777_593_600;

const AUTH_ROW = {
  id: 41,
  project_id: 7,
  version_no: 2,
  letter_template_version: "v1",
  letter_hash: "h",
  method: "upload_scan",
  scan_file_key: "scan_1",
  scan_file_hash: "sh",
  signer_name: "张三",
  signer_uid: 42,
  signed_at: NOW - 600,
  confirm_ip: null,
  status: "pending",
  verified_by: null,
  verified_at: null,
  reject_reason: null,
};

interface Handlers {
  [sqlFragment: string]: (sql: string) => unknown;
}

function fakeDb(handlers: Handlers) {
  const calls: Array<[string, unknown[] | undefined]> = [];
  const conn = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      for (const key of Object.keys(handlers)) if (sql.includes(key)) return handlers[key](sql);
      return [[], []];
    }),
  };
  const pool = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      for (const key of Object.keys(handlers)) if (sql.includes(key)) return handlers[key](sql);
      return [[], []];
    }),
    getConnection: vi.fn().mockResolvedValue(conn),
  } as unknown as Pool;
  return { pool, conn, calls };
}

function baseHandlers(over: { row?: typeof AUTH_ROW | null; dup?: unknown[] } = {}): Handlers {
  const row = over.row === undefined ? AUTH_ROW : over.row;
  return {
    "SELECT * FROM procurement_authorizations": () => (row ? [[row], []] : [[], []]),
    "SELECT id FROM procurement_authorizations": () => [over.dup ?? [], []],
    "UPDATE procurement_authorizations": () => [{ affectedRows: 1 }, []],
    "SELECT p.reference, b.user_id": () => [[{ reference: "OSPR-2026-000007", user_id: 42 }], []],
    "INSERT INTO notifications": () => [{ insertId: 900 }, []],
  };
}

describe("applyAuthorizationVerification", () => {
  it("驳回理由不足 10 字 → reason_required，且不触库", async () => {
    const { pool, conn } = fakeDb(baseHandlers());
    const r = await applyAuthorizationVerification(pool, {
      projectId: 7, versionNo: 2, decision: "rejected", rejectReason: "不合格", callbackId: "cb-1", at: NOW,
    });
    expect(r).toEqual({ ok: false, reason: "reason_required" });
    expect(conn.beginTransaction).not.toHaveBeenCalled();
  });

  it("没有该版本的授权记录 → not_found", async () => {
    const { pool, conn } = fakeDb(baseHandlers({ row: null }));
    const r = await applyAuthorizationVerification(pool, {
      projectId: 7, versionNo: 2, decision: "verified", callbackId: "cb-2", at: NOW,
    });
    expect(r).toEqual({ ok: false, reason: "not_found" });
    expect(conn.rollback).toHaveBeenCalled();
  });

  it("核验通过 → 状态 verified 落库 + 发授权核验通过通知", async () => {
    const { pool, calls, conn } = fakeDb(baseHandlers());
    const r = await applyAuthorizationVerification(pool, {
      projectId: 7, versionNo: 2, decision: "verified", reviewerRef: "RV-9", callbackId: "cb-3", at: NOW,
    });
    expect(r).toEqual({ ok: true, status: "verified" });
    expect(conn.commit).toHaveBeenCalled();

    const upd = calls.find(([sql]) => sql.includes("UPDATE procurement_authorizations"));
    expect(upd![1]).toEqual(["verified", "RV-9", NOW, null, "cb-3", NOW, 41]);

    const notif = calls.find(([sql]) => sql.includes("INSERT INTO notifications"));
    expect(notif).toBeDefined();
    const params = notif![1] as unknown[];
    expect(params[1]).toBe("procurement.authorization_verified");
    expect(params[4]).toBe("/rfq/7/publish");
    expect(params[7]).toBe("procurement.authorization.verified:7:v2:cb-3");
  });

  it("驳回 → reject_reason 落库 + 通知带原因", async () => {
    const { pool, calls } = fakeDb(baseHandlers());
    const reason = "扫描件签字页缺失，请补签后重新上传";
    const r = await applyAuthorizationVerification(pool, {
      projectId: 7, versionNo: 2, decision: "rejected", rejectReason: reason, callbackId: "cb-4", at: NOW,
    });
    expect(r).toEqual({ ok: true, status: "rejected" });
    const upd = calls.find(([sql]) => sql.includes("UPDATE procurement_authorizations"));
    expect(upd![1]![3]).toBe(reason);

    const notif = calls.find(([sql]) => sql.includes("INSERT INTO notifications"));
    const params = notif![1] as unknown[];
    expect(params[1]).toBe("procurement.authorization_rejected");
    expect(String(params[6])).toContain(reason);
  });

  it("同一回调键重复投递 → duplicate，不改状态、不重复发通知", async () => {
    const { pool, calls, conn } = fakeDb(baseHandlers({ dup: [{ id: 41 }] }));
    const r = await applyAuthorizationVerification(pool, {
      projectId: 7, versionNo: 2, decision: "verified", callbackId: "cb-3", at: NOW,
    });
    expect(r).toEqual({ ok: true, status: "pending", duplicate: true });
    expect(conn.rollback).toHaveBeenCalled();
    expect(calls.find(([sql]) => sql.includes("UPDATE procurement_authorizations"))).toBeUndefined();
    expect(calls.find(([sql]) => sql.includes("INSERT INTO notifications"))).toBeUndefined();
  });

  it("状态已等于目标结论 → 视为重复，幂等返回", async () => {
    const { pool } = fakeDb(baseHandlers({ row: { ...AUTH_ROW, status: "verified" } }));
    const r = await applyAuthorizationVerification(pool, {
      projectId: 7, versionNo: 2, decision: "verified", callbackId: "cb-5", at: NOW,
    });
    expect(r).toEqual({ ok: true, status: "verified", duplicate: true });
  });
});
