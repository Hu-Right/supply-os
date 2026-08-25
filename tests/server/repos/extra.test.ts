/**
 * server/repos/ 扩展数据层测试
 * 覆盖 AuthRepo, UsersRepo, LeadsRepo, AdminRepo
 * 使用 mock pool 验证 SQL 调用与返回值映射
 */
import { describe, it, expect, vi } from "vitest";

// ── AuthRepo ──
import { AuthRepo } from "../../../server/repos/auth.repo";

describe("AuthRepo", () => {
  function makePool(queryResult?: any[], executeResult?: any) {
    return {
      query: vi.fn().mockResolvedValue([queryResult ?? []]),
      execute: vi.fn().mockResolvedValue([executeResult ?? {}]),
    } as any;
  }

  it("invalidateUnusedCodes 调用 execute 作废旧码", async () => {
    const pool = makePool();
    const repo = new AuthRepo(pool);
    await repo.invalidateUnusedCodes("user-1", "reset");
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE crm_password_resets SET used = 1"),
      ["user-1", "reset"],
    );
  });

  it("createResetCode 返回 insertId", async () => {
    const pool = makePool([], { insertId: 42 });
    const repo = new AuthRepo(pool);
    const id = await repo.createResetCode({
      userKey: "user-1", codeHash: "hash123", codeType: "reset",
      expiresAt: new Date(), ip: "127.0.0.1",
    });
    expect(id).toBe(42);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO crm_password_resets"),
      expect.arrayContaining(["user-1", "hash123", "reset", "127.0.0.1"]),
    );
  });

  it("findLatestActiveCode 返回首行或 null", async () => {
    const row = { id: 1, code: "abc", expires_at: new Date(), attempts: 0 };
    const pool = makePool([row]);
    const repo = new AuthRepo(pool);
    const result = await repo.findLatestActiveCode("user-1", "reset");
    expect(result).toEqual(row);
  });

  it("findLatestActiveCode 无记录返回 null", async () => {
    const pool = makePool([]);
    const repo = new AuthRepo(pool);
    const result = await repo.findLatestActiveCode("user-1", "reset");
    expect(result).toBeNull();
  });

  it("findLatestActiveCode 含 phone 参数时附加手机号条件", async () => {
    const pool = makePool([]);
    const repo = new AuthRepo(pool);
    await repo.findLatestActiveCode("user-1", "reset", "13800138000");
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("phone = ?"),
      ["user-1", "13800138000", "reset"],
    );
  });

  it("findCodePhone 返回手机号或 null", async () => {
    const pool = makePool([{ phone: "13800138000" }]);
    const repo = new AuthRepo(pool);
    const result = await repo.findCodePhone(1);
    expect(result).toBe("13800138000");
  });

  it("findCodePhone 无记录返回 null", async () => {
    const pool = makePool([]);
    const repo = new AuthRepo(pool);
    const result = await repo.findCodePhone(999);
    expect(result).toBeNull();
  });

  it("incrementCodeAttempts 调用 execute", async () => {
    const pool = makePool();
    const repo = new AuthRepo(pool);
    await repo.incrementCodeAttempts(1);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining("attempts = attempts + 1"),
      [1],
    );
  });
});

// ── UsersRepo ──
import { UsersRepo } from "../../../server/repos/users.repo";

describe("UsersRepo", () => {
  function makePool(queryResult?: any[], executeResult?: any) {
    return {
      query: vi.fn().mockResolvedValue([queryResult ?? []]),
      execute: vi.fn().mockResolvedValue([executeResult ?? { affectedRows: 1 }]),
    } as any;
  }

  it("findByKey 返回用户或 null", async () => {
    const user = { user_key: "u1", email: "a@b.com" };
    const pool = makePool([user]);
    const repo = new UsersRepo(pool);
    expect(await repo.findByKey("u1")).toEqual(user);
  });

  it("findByKey 不存在返回 null", async () => {
    const pool = makePool([]);
    const repo = new UsersRepo(pool);
    expect(await repo.findByKey("none")).toBeNull();
  });

  it("findProfileByKey 查询指定列", async () => {
    const pool = makePool([{ user_key: "u1", email: "a@b.com" }]);
    const repo = new UsersRepo(pool);
    await repo.findProfileByKey("u1");
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("user_key, email, phone"),
      ["u1"],
    );
  });

  it("findAuthByKey 查询含 password_hash", async () => {
    const pool = makePool([{ user_key: "u1", password_hash: "hash" }]);
    const repo = new UsersRepo(pool);
    await repo.findAuthByKey("u1");
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("password_hash"),
      ["u1"],
    );
  });

  it("create 传入正确参数", async () => {
    const pool = makePool([], { affectedRows: 1 });
    const repo = new UsersRepo(pool);
    const result = await repo.create({
      user_key: "u1", email: "a@b.com", display_name: "Test",
      password_hash: "hash123",
    });
    expect(result).toBe(true);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO crm_users"),
      expect.arrayContaining(["u1", "a@b.com", "Test", "hash123", "bcrypt"]),
    );
  });

  it("updatePassword 调用 execute", async () => {
    const pool = makePool();
    const repo = new UsersRepo(pool);
    await repo.updatePassword("u1", "newhash", "bcrypt");
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE crm_users SET password_hash"),
      ["newhash", "bcrypt", "u1"],
    );
  });

  it("markEmailVerified 调用 execute", async () => {
    const pool = makePool();
    const repo = new UsersRepo(pool);
    await repo.markEmailVerified("u1");
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining("email_verified = 1"),
      ["u1"],
    );
  });
});

// ── LeadsRepo ──
import { LeadsRepo } from "../../../server/repos/leads.repo";

describe("LeadsRepo", () => {
  function makePool(queryResult?: any[], executeResult?: any) {
    return {
      query: vi.fn().mockResolvedValue([queryResult ?? []]),
      execute: vi.fn().mockResolvedValue([executeResult ?? {}]),
    } as any;
  }

  it("listAppointments 返回数组", async () => {
    const appointments = [
      { appointment_key: "apt-1", company_name: "Company A", status: "new" },
      { appointment_key: "apt-2", company_name: "Company B", status: "contacted" },
    ];
    const pool = makePool(appointments);
    const repo = new LeadsRepo(pool);
    const result = await repo.listAppointments();
    expect(result).toEqual(appointments);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("ungm_1v1_appointments"));
  });

  it("findByKey 返回单条或 null", async () => {
    const apt = { appointment_key: "apt-1", company_name: "Company A" };
    const pool = makePool([apt]);
    const repo = new LeadsRepo(pool);
    const result = await repo.findByKey("apt-1");
    expect(result).toEqual(apt);
  });

  it("findByKey 不存在返回 null", async () => {
    const pool = makePool([]);
    const repo = new LeadsRepo(pool);
    const result = await repo.findByKey("none");
    expect(result).toBeNull();
  });

  it("updateFollowUpLogs 调用 execute", async () => {
    const pool = makePool();
    const repo = new LeadsRepo(pool);
    await repo.updateFollowUpLogs("apt-1", "follow up log", "contacted");
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE ungm_1v1_appointments"),
      ["follow up log", "contacted", "apt-1"],
    );
  });
});

// ── AdminRepo ──
import { AdminRepo } from "../../../server/repos/admin.repo";

describe("AdminRepo", () => {
  function makePool(queryResult?: any[]) {
    return {
      query: vi.fn().mockResolvedValue([queryResult ?? []]),
      execute: vi.fn().mockResolvedValue([{}]),
    } as any;
  }

  it("listQualitySnapshots 返回行数组", async () => {
    const snapshots = [{ snapshot_date: "2026-08-25", total_notices: 1000 }];
    const pool = makePool(snapshots);
    const repo = new AdminRepo(pool);
    const result = await repo.listQualitySnapshots(7);
    expect(result).toEqual(snapshots);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("crm_data_quality_snapshot"), [7]);
  });

  it("countAmountBackfillRemaining 返回数值", async () => {
    const pool = makePool([{ remaining: 42 }]);
    const repo = new AdminRepo(pool);
    const result = await repo.countAmountBackfillRemaining(1);
    expect(result).toBe(42);
  });

  it("getViewRollupStats 返回统计对象", async () => {
    const pool = makePool([{ rows_total: 100, latest_day: "2026-08-25" }]);
    const repo = new AdminRepo(pool);
    const result = await repo.getViewRollupStats();
    expect(result).toEqual({ rows_total: 100, latest_day: "2026-08-25" });
  });

  it("countTableRows 表名含非法字符时抛错", async () => {
    const pool = makePool();
    const repo = new AdminRepo(pool);
    await expect(repo.countTableRows("bad; DROP TABLE")).rejects.toThrow("INVALID_TABLE_NAME");
  });

  it("countTableRows 合法表名正常查询", async () => {
    const pool = makePool([{ total: 999 }]);
    const repo = new AdminRepo(pool);
    const result = await repo.countTableRows("crm_users");
    expect(result).toBe(999);
  });

  it("listExistingTables 返回 Set", async () => {
    const pool = makePool([{ table_name: "crm_users" }, { table_name: "crm_bid_notices" }]);
    const repo = new AdminRepo(pool);
    const result = await repo.listExistingTables(["crm_users", "crm_bid_notices"]);
    expect(result).toBeInstanceOf(Set);
    expect(result.has("crm_users")).toBe(true);
  });
});
