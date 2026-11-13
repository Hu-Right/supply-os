/**
 * InvitationRepo 前缀分流与渠道归因写入单测
 *
 * 钉住四类不变式：
 * 1. 命名空间隔离：CH- 只查渠道表、其余一律走原员工表逻辑，**不做双向 fallback**
 *    （一个码只可能属于一个命名空间，杜绝「两处都合法」的歧义归属）；
 * 2. 停用连坐：渠道码有效性的判定必须看主体 is_active
 *    （码与主体合一后只有这一个开关，漏看会让停用的渠道商继续带量）；
 * 3. 文案分流：渠道码无效的原因不能复用员工码那句「邀请码不存在」，
 *    渠道商要靠这句话自查自己的推广链接；
 * 4. 归因写入：渠道码落在 users.invite_code 列上（channel_registrations 台账已删），
 *    同一用户重试重复 UPDATE 写回同一值，天然幂等不多算人头。
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

/** 渠道码行（channel_partners 单表投影：码即主体） */
const channelRow = { code: "CH-AB2345CD" };

describe("validateCode · 命名空间隔离", () => {
  it("CH- 码只查 channel_partners 单表（码即主体），绝不碰 employees，也不碰已删的 channel_codes", async () => {
    const { pool, calls } = makePool([channelRow]);
    const res = await new InvitationRepo(pool).validateCode("CH-AB2345CD");

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain("channel_partners");
    expect(calls[0].sql).not.toContain("channel_codes");
    expect(calls[0].sql).not.toContain("employees");
    expect(res.valid).toBe(true);
    expect(res.owner).toEqual({ namespace: "channel", code: "CH-AB2345CD" });
  });

  it("渠道码有效性必须要求主体未停用（码与主体合一后只有这一个开关）", async () => {
    const { pool, calls } = makePool([channelRow]);
    await new InvitationRepo(pool).validateCode("CH-AB2345CD");

    const sql = calls[0].sql;
    expect(sql).toMatch(/is_active = 1/);
    // 单表后不再有 c./p. 双别名的双开关
    expect(sql).not.toContain("c.is_active");
    expect(sql).not.toContain("p.is_active");
  });

  it("EMP- 码走原员工表逻辑，一字不动、不查渠道表", async () => {
    const { pool, calls } = makePool([{ employee_id: 7, name: "张三", department: null, invitation_code: "EMP-XCAO26A1" }]);
    const res = await new InvitationRepo(pool).validateCode("EMP-XCAO26A1");

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain("FROM employees");
    expect(calls[0].sql).not.toContain("crm_channel");
    expect(res.owner).toEqual({ namespace: "employee", employeeId: 7 });
  });

  it("无前缀的裸码仍按员工码处理（不能因为不认识前缀就拒掉存量码）", async () => {
    const { pool, calls } = makePool([{ employee_id: 8, name: "李四", department: null, invitation_code: "XCAO26A1" }]);
    const res = await new InvitationRepo(pool).validateCode("XCAO26A1");

    expect(calls[0].sql).toContain("FROM employees");
    expect(res.valid).toBe(true);
  });

  it("小写输入归一后仍按前缀分流（Cookie 里的码可能被浏览器改过大小写）", async () => {
    const { pool, calls } = makePool([channelRow]);
    await new InvitationRepo(pool).validateCode("ch-ab2345cd");

    expect(calls[0].sql).toContain("channel_partners");
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

describe("setChannelInviteCode · 归因落在用户行", () => {
  const input = { userId: 99, code: "CH-AB2345CD" };

  it("归因写 users.invite_code（UPDATE，不再有任何 channel_registrations 语句）", async () => {
    const { pool, calls } = makePool();
    await new InvitationRepo(pool).setChannelInviteCode(input);

    const { sql, params } = calls[0];
    expect(calls).toHaveLength(1);
    expect(calls[0].kind).toBe("execute");
    expect(sql).toContain("UPDATE users SET invite_code = ?");
    expect(sql).toContain("WHERE id = ?");
    expect(sql).not.toContain("channel_registrations");
    expect(sql).not.toContain("INSERT INTO");
    // 码在前、userId 在后；同一用户重试重复执行写回同一值，天然幂等
    expect(params).toEqual(["CH-AB2345CD", 99]);
  });

  it("userId 非法（建号未成功）时不发任何 SQL", async () => {
    const { pool, calls } = makePool();
    await expect(new InvitationRepo(pool).setChannelInviteCode({ ...input, userId: 0 })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("员工码误入直接拒（员工码的归因走 incrementMonthlyActual，两本账不许串）", async () => {
    const { pool, calls } = makePool();
    await expect(new InvitationRepo(pool).setChannelInviteCode({ userId: 99, code: "EMP-XCAO26A1" })).rejects.toThrow("非渠道码");
    expect(calls).toHaveLength(0);
  });
});
