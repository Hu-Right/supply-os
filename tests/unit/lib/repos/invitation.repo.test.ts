/**
 * InvitationRepo 前缀分流与渠道台账单测
 *
 * 钉住四类不变式：
 * 1. 命名空间隔离：CH- 只查渠道表、其余一律走原员工表逻辑，**不做双向 fallback**
 *    （一个码只可能属于一个命名空间，杜绝「两处都合法」的歧义归属）；
 * 2. 停用连坐：渠道码有效性的判定必须同时看 code.is_active 与 partner.is_active，
 *    漏掉后者会让停用的渠道商继续带量；
 * 3. 文案分流：渠道码无效的原因不能复用员工码那句「邀请码不存在」，
 *    渠道商要靠这句话自查自己的推广链接；
 * 4. 台账一人一行：写入必须走 ON DUPLICATE KEY UPDATE user_id = user_id（幂等），
 *    且 partner_id 由调用方从码行带出、不在 SQL 里反查（写账瞬间的主体快照才是事实）。
 */
import { describe, it, expect } from "vitest";
import { InvitationRepo, type PoolLike } from "@/lib/repos/invitation.repo";

const norm = (s: unknown) => String(s).replace(/\s+/g, " ").trim();

function makePool(rows: unknown[] = []) {
  const calls: { kind: "query" | "execute"; sql: string; params: unknown[] }[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ kind: "query", sql: norm(sql), params });
      return [rows, []];
    },
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ kind: "execute", sql: norm(sql), params });
      return [{ insertId: 77, affectedRows: 1 }, []];
    },
  };
  return { pool: pool as unknown as PoolLike, calls };
}

/** 渠道码行（JOIN partners 带出的形状） */
const channelRow = { code: "CH-AB2345CD", partner_id: 5, partner_name: "渠道A" };

describe("validateCode · 命名空间隔离", () => {
  it("CH- 码只查渠道两张表，绝不碰 crm_employees", async () => {
    const { pool, calls } = makePool([channelRow]);
    const res = await new InvitationRepo(pool).validateCode("CH-AB2345CD");

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain("crm_channel_codes");
    expect(calls[0].sql).toContain("crm_channel_partners");
    expect(calls[0].sql).not.toContain("crm_employees");
    expect(res.valid).toBe(true);
    expect(res.owner).toEqual({ namespace: "channel", code: "CH-AB2345CD", partnerId: 5 });
  });

  it("渠道码有效性必须同时要求码与主体都未停用（漏一个=停用连坐失效）", async () => {
    const { pool, calls } = makePool([channelRow]);
    await new InvitationRepo(pool).validateCode("CH-AB2345CD");

    const sql = calls[0].sql;
    expect(sql).toMatch(/c\.is_active = 1/);
    expect(sql).toMatch(/p\.is_active = 1/);
  });

  it("EMP- 码走原员工表逻辑，一字不动、不查渠道表", async () => {
    const { pool, calls } = makePool([{ employee_id: 7, name: "张三", department: null, invitation_code: "EMP-XCAO26A1" }]);
    const res = await new InvitationRepo(pool).validateCode("EMP-XCAO26A1");

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain("FROM crm_employees");
    expect(calls[0].sql).not.toContain("crm_channel");
    expect(res.owner).toEqual({ namespace: "employee", employeeId: 7 });
  });

  it("无前缀的裸码仍按员工码处理（不能因为不认识前缀就拒掉存量码）", async () => {
    const { pool, calls } = makePool([{ employee_id: 8, name: "李四", department: null, invitation_code: "XCAO26A1" }]);
    const res = await new InvitationRepo(pool).validateCode("XCAO26A1");

    expect(calls[0].sql).toContain("FROM crm_employees");
    expect(res.valid).toBe(true);
  });

  it("小写输入归一后仍按前缀分流（Cookie 里的码可能被浏览器改过大小写）", async () => {
    const { pool, calls } = makePool([channelRow]);
    await new InvitationRepo(pool).validateCode("ch-ab2345cd");

    expect(calls[0].sql).toContain("crm_channel_codes");
    expect(calls[0].params).toEqual(["CH-AB2345CD"]);
  });

  it("查无此码 → 无效，且渠道码文案与员工码分开（渠道商据此自查链接）", async () => {
    const channel = await new InvitationRepo(makePool([]).pool).validateCode("CH-NOSUCH11");
    const employee = await new InvitationRepo(makePool([]).pool).validateCode("EMP-NOSUCH");

    expect(channel.valid).toBe(false);
    expect(employee.valid).toBe(false);
    expect(channel.reason).not.toBe(employee.reason);
    expect(channel.reason).toContain("渠道");
  });
});

describe("recordChannelRegistration · 一人一行", () => {
  const input = { userId: 99, code: "CH-AB2345CD", partnerId: 5 };

  it("写入走 ON DUPLICATE KEY UPDATE user_id = user_id，重复调用不会多出一行", async () => {
    const { pool, calls } = makePool();
    await new InvitationRepo(pool).recordChannelRegistration(input);

    const { sql, params } = calls[0];
    expect(calls[0].kind).toBe("execute");
    expect(sql).toContain("INSERT INTO crm_channel_registrations");
    expect(sql).toContain("ON DUPLICATE KEY UPDATE user_id = user_id");
    // partner_id 由码行带出（写账瞬间的快照），不在 SQL 里反查
    expect(params).toEqual([99, "CH-AB2345CD", 5]);
  });

  it("起步一律 personal，注册时间交给库的 NOW()", async () => {
    const { pool, calls } = makePool();
    await new InvitationRepo(pool).recordChannelRegistration(input);

    expect(calls[0].sql).toContain("'personal'");
    expect(calls[0].sql).toContain("NOW()");
    // 时间不给参数位：账上时间必须由库定，否则客户端时钟漂移会写进对账凭据
    expect(calls[0].sql).not.toMatch(/registered_at\s*(=)?\s*\?/);
  });

  it("userId 非法（建号未成功）时不发任何 SQL", async () => {
    const { pool, calls } = makePool();
    await expect(new InvitationRepo(pool).recordChannelRegistration({ ...input, userId: 0 })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});
