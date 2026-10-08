/**
 * 认领服务单元测试（创建编排 + 到期释放）
 *
 * @module tests/unit/lib/services/supplier-claim-expiry
 * @description 钉住认领服务两组契约：
 *              A. createClaimWithBinding（双时钟创建端）：执照可选、有则随认领落库，
 *                 被替换的旧执照文件 best-effort 清理；
 *              B. releaseExpiredClaims（到期释放）：
 *              1. 没有到期认领时只数不写（省掉一次跨三表的 UPDATE）；
 *              2. 计数与更新的 WHERE 完全一致——两处各写一份时，改守卫很容易只改一处，
 *                 导致日志报的条数和实际释放的行数对不上；
 *              3. 返回值区分「认领条数」与「多表 UPDATE 改动行数」；
 *              4. 三重守卫（已换绑不动用户、已有 approved 不踢人、claim_status 只在 pending 时清）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// 服务模块顶层引了 db/pool 与 file-upload（含 server-only），到期测试只用注入的 dbPool，
// 创建测试则走全局 getPool：两者都提前打桩成可监视的 mock
const { poolExecute, deleteFileMock } = vi.hoisted(() => ({
  poolExecute: vi.fn(),
  deleteFileMock: vi.fn(),
}));
vi.mock("@/lib/db/pool", () => ({ getPool: () => ({ execute: poolExecute }) }));
vi.mock("@/lib/services/file-upload", () => ({ deleteFile: deleteFileMock }));

import { releaseExpiredClaims, createClaimWithBinding } from "@/lib/services/supplier-claim";

/** 假连接：SELECT 回 countRows，UPDATE 回 affectedRows，并记录全部 SQL */
function fakeDb(countRows: number, affectedRows: number) {
  const sqls: string[] = [];
  const dbPool = {
    query: vi.fn(async (sql: string) => {
      sqls.push(sql);
      if (sql.trimStart().toUpperCase().startsWith("SELECT")) return [[{ n: countRows }]];
      return [{ affectedRows }];
    }),
  };
  return { dbPool: dbPool as never, sqls };
}

const tailWhere = (sql: string) => sql.slice(sql.lastIndexOf("WHERE")).replace(/\s+/g, " ").trim();

describe("releaseExpiredClaims", () => {
  it("无到期认领：只发一条 COUNT，不发 UPDATE，返回全零", async () => {
    const { dbPool, sqls } = fakeDb(0, 0);
    await expect(releaseExpiredClaims(dbPool)).resolves.toEqual({ claims: 0, changedRows: 0 });
    expect(sqls).toHaveLength(1);
    expect(sqls[0].trimStart().toUpperCase().startsWith("SELECT")).toBe(true);
    expect(sqls.some((s) => s.trimStart().toUpperCase().startsWith("UPDATE"))).toBe(false);
  });

  it("有到期认领：先数后写，返回认领条数与跨表改动行数（两者不是一回事）", async () => {
    const { dbPool, sqls } = fakeDb(3, 7);
    await expect(releaseExpiredClaims(dbPool)).resolves.toEqual({ claims: 3, changedRows: 7 });
    expect(sqls).toHaveLength(2);
    expect(sqls[1].trimStart().toUpperCase()).toMatch(/^UPDATE/);
  });

  it("计数与更新的 WHERE 必须逐字一致（同一套片段拼出来）", async () => {
    const { dbPool, sqls } = fakeDb(2, 5);
    await releaseExpiredClaims(dbPool);
    expect(tailWhere(sqls[0])).toBe(tailWhere(sqls[1]));
    expect(tailWhere(sqls[0])).toContain("c.status = 'pending' AND c.expires_at < NOW() AND ok.user_id IS NULL");
  });

  it("三重守卫都在 UPDATE 里：已换绑不动用户、已有 approved 不踢人、claim_status 只清 pending", async () => {
    const { dbPool, sqls } = fakeDb(1, 3);
    await releaseExpiredClaims(dbPool);
    const update = sqls[1];
    // ① 用户只按「仍绑定在该主体上」关联
    expect(update).toContain("ON u.id = c.user_id AND u.supplier_id = c.supplier_id");
    // ② 同用户同主体已有 approved 认领的行被排除
    expect(update).toContain("FROM crm_supplier_claims WHERE status = 'approved') ok");
    // ③ 主体归属标记只在 pending 时重置，不抹掉后台写出的 verified
    expect(update).toContain("s.claim_status = IF(s.claim_status = 'pending', NULL, s.claim_status)");
    // 认领记录原地留痕为 expired（客服查表即可，不依赖日志）
    expect(update).toContain("c.status = 'expired'");
  });

  it("释放动作把账号回到未绑定态：supplier_id=NULL 且 supplier_link_status='none'", async () => {
    const { dbPool, sqls } = fakeDb(1, 2);
    await releaseExpiredClaims(dbPool);
    expect(sqls[1]).toContain("SET u.supplier_id = NULL, u.supplier_link_status = 'none'");
  });
});

/** 创建编排：记录 insertClaim / bindSupplier，pool.execute 按 SQL 关键字回包 */
function makeCtx() {
  const insertClaim = vi.fn().mockResolvedValue(9001);
  const bindSupplier = vi.fn().mockResolvedValue(undefined);
  return {
    ctx: { supplier: { claimRepo: { insertClaim } }, user: { usersRepo: { bindSupplier } } } as never,
    insertClaim,
    bindSupplier,
  };
}

describe("createClaimWithBinding", () => {
  beforeEach(() => {
    poolExecute.mockReset();
    deleteFileMock.mockReset();
    // 默认当成成功：否则 deleteFile 回 undefined，服务里的 .catch() 会直接抛错
    deleteFileMock.mockResolvedValue(undefined);
  });

  it("不带执照（弹窗流程）：只标 claim_status=pending，不读旧执照也不删文件", async () => {
    const { ctx, insertClaim, bindSupplier } = makeCtx();
    poolExecute.mockResolvedValue([{ affectedRows: 1 }]);

    await createClaimWithBinding(ctx, { userId: 7, supplierId: 100, expiresAt: "2026-10-08 12:00:00" });

    expect(insertClaim).toHaveBeenCalledWith({ userId: 7, supplierId: 100, expiresAt: "2026-10-08 12:00:00" });
    expect(bindSupplier).toHaveBeenCalledWith(7, 100, "verified");
    expect(poolExecute).toHaveBeenCalledTimes(1);
    const [sql, params] = poolExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("SET claim_status = 'pending'");
    expect(sql).not.toContain("license_url");
    expect(params).toEqual([100]);
    expect(deleteFileMock).not.toHaveBeenCalled();
  });

  it("带执照（企业信息页新建后首存）：先读旧照、写入新照，旧照不同则清理", async () => {
    const { ctx } = makeCtx();
    poolExecute
      .mockResolvedValueOnce([[{ license_url: "/api/user/enterprise/license/old.jpg" }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await createClaimWithBinding(ctx, {
      userId: 7,
      supplierId: 100,
      licenseUrl: "/api/user/enterprise/license/new.jpg",
      expiresAt: "2026-10-08 12:00:00",
    });

    expect(poolExecute).toHaveBeenCalledTimes(2);
    const [readSql] = poolExecute.mock.calls[0] as [string];
    expect(readSql).toContain("SELECT license_url FROM supplier WHERE id = ?");
    const [writeSql, writeParams] = poolExecute.mock.calls[1] as [string, unknown[]];
    expect(writeSql).toContain("SET claim_status = 'pending', license_url = ?");
    expect(writeParams).toEqual(["/api/user/enterprise/license/new.jpg", 100]);
    expect(deleteFileMock).toHaveBeenCalledWith("/api/user/enterprise/license/old.jpg");
  });

  it("新旧执照同一张 → 不删文件；旧执照为空 → 也不删", async () => {
    const cases: Array<[string | null, number]> = [["/api/user/enterprise/license/same.jpg", 0], [null, 0]];
    for (const [oldUrl, expectDeletes] of cases) {
      poolExecute.mockReset();
      deleteFileMock.mockReset();
      poolExecute
        .mockResolvedValueOnce([[{ license_url: oldUrl }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      const { ctx } = makeCtx();
      await createClaimWithBinding(ctx, {
        userId: 7,
        supplierId: 100,
        licenseUrl: "/api/user/enterprise/license/same.jpg",
        expiresAt: "2026-10-08 12:00:00",
      });
      expect(deleteFileMock).toHaveBeenCalledTimes(expectDeletes);
    }
  });

  it("旧执照文件删失败 → 不影响认领主流程（best-effort）", async () => {
    const { ctx, insertClaim } = makeCtx();
    poolExecute
      .mockResolvedValueOnce([[{ license_url: "/api/user/enterprise/license/old.jpg" }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    deleteFileMock.mockRejectedValue(new Error("存储不可达"));

    await expect(
      createClaimWithBinding(ctx, {
        userId: 7,
        supplierId: 100,
        licenseUrl: "/api/user/enterprise/license/new.jpg",
        expiresAt: "2026-10-08 12:00:00",
      }),
    ).resolves.toEqual({ claimId: 9001, expiresAt: "2026-10-08 12:00:00" });
    expect(insertClaim).toHaveBeenCalledTimes(1);
  });
});
