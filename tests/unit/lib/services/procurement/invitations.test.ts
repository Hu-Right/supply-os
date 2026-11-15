/**
 * 邀约编排单测：分流、频控、幂等、失败隔离
 *
 * 依赖注入用 vi.mock 拦在服务边界（matching / email / notifications），
 * DB 用按 SQL 关键字路由的假连接池——只验证"编排决策"，不验证 SQL 语义。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const listMatchCandidates = vi.fn();
const sendProcurementInviteEmail = vi.fn();
const isEmailConfigured = vi.fn(() => true);
const pushNotificationSafe = vi.fn();

vi.mock("@/lib/services/procurement/matching", () => ({ listMatchCandidates: (...a: unknown[]) => listMatchCandidates(...a) }));
vi.mock("@/lib/services/email", () => ({
  isEmailConfigured: () => isEmailConfigured(),
  sendProcurementInviteEmail: (...a: unknown[]) => sendProcurementInviteEmail(...a),
}));
vi.mock("@/lib/services/notifications", () => ({
  pushNotificationSafe: (...a: unknown[]) => pushNotificationSafe(...a),
}));

import { dispatchInvitations, buildInviteToken } from "@/lib/services/procurement/invitations";

const PROJECT = {
  id: 41,
  reference: "OSPR-2026-000041",
  title_zh: "光伏组件采购",
  status: "published",
  version_no: 2,
  quote_deadline_at: 1797350399,
  budget_amount: "1200000.00",
  budget_public: 1,
  primary_ugt_code: "UGT-010101",
  delivery_province: "广东",
};

function candidates(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    supplierId: i + 1,
    company: `供应商${i + 1}`,
    province: "广东",
    city: "深圳",
    email: `s${i + 1}@example.com`,
    hasAccount: false,
    score: 90 - i,
    reasons: "品类L3;省份",
  }));
}

function fakePool(opts: {
  project?: typeof PROJECT | null;
  cooldown?: Record<number, number>;
  accounts?: Record<number, number>;
  duplicate?: boolean;
  insertResult?: number;
} = {}) {
  const insertedRows: unknown[][] = [];
  const statusUpdates: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      const s = String(sql);
      if (s.includes("FROM procurement_projects")) return [[opts.project === null ? undefined : opts.project ?? PROJECT], []];
      if (s.includes("COUNT(*)") && s.includes("procurement_invitations")) {
        const sid = Number((params ?? [])[0]);
        return [[{ n: opts.cooldown?.[sid] ?? 0 }], []];
      }
      if (s.includes("FROM supplier_claims")) {
        const ids = ((params ?? [])[0] as number[]) ?? [];
        const accounts = opts.accounts ?? {};
        return [ids.filter((id) => accounts[id]).map((id) => ({ supplier_id: id, user_id: accounts[id] })), []];
      }
      if (s.includes("INSERT") && s.includes("procurement_invitations")) {
        if (opts.duplicate) return [{ affectedRows: 0, insertId: 0 }, []];
        insertedRows.push((params ?? []) as unknown[]);
        return [{ affectedRows: opts.insertResult ?? 1, insertId: insertedRows.length }, []];
      }
      if (s.includes("UPDATE procurement_invitations")) {
        statusUpdates.push({ sql: s, params: (params ?? []) as unknown[] });
        return [{ affectedRows: 1 }, []];
      }
      if (s.includes("UPDATE procurement_matches")) return [{ affectedRows: 1 }, []];
      return [[], []];
    }),
  };
  return { db: db as never, insertedRows, statusUpdates };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  isEmailConfigured.mockReturnValue(true);
  sendProcurementInviteEmail.mockResolvedValue(undefined);
  pushNotificationSafe.mockResolvedValue(undefined);
});

describe("dispatchInvitations — 总开关（默认关闭，fail-closed）", () => {
  it("未显式开启时不读候选、不写邀约行、不发任何消息", async () => {
    listMatchCandidates.mockResolvedValue(candidates(3));
    const { db, insertedRows } = fakePool({ accounts: { 1: 9001 } });

    const r = await dispatchInvitations(db, PROJECT.id, { limit: 10 });

    expect(r).toEqual({
      invited: 0,
      emailed: 0,
      inapp: 0,
      skippedCooldown: 0,
      skippedDuplicate: 0,
      skippedNoChannel: 0,
      failed: 0,
    });
    expect(listMatchCandidates).not.toHaveBeenCalled();
    expect(insertedRows).toHaveLength(0);
    expect(sendProcurementInviteEmail).not.toHaveBeenCalled();
    expect(pushNotificationSafe).not.toHaveBeenCalled();
  });

  it("PROCUREMENT_INVITE_ENABLED=on 时才放行（仍只发站内信，邮件需另开）", async () => {
    vi.stubEnv("PROCUREMENT_INVITE_ENABLED", "on");
    listMatchCandidates.mockResolvedValue(candidates(2));
    const { db, insertedRows } = fakePool({ accounts: { 1: 9001 } });

    const r = await dispatchInvitations(db, PROJECT.id, { limit: 10 });

    expect(r.invited).toBe(1);
    expect(r.inapp).toBe(1);
    expect(r.emailed).toBe(0);
    expect(r.skippedNoChannel).toBe(1);
    expect(insertedRows).toHaveLength(1);
    vi.unstubAllEnvs();
  });
});

describe("dispatchInvitations — 分流", () => {
  it("有账号走站内信、无账号走邮件，合计等于候选数", async () => {
    listMatchCandidates.mockResolvedValue(candidates(3));
    const { db, insertedRows } = fakePool({ accounts: { 2: 9001 } });

    const r = await dispatchInvitations(db, PROJECT.id, { limit: 10, enabled: true, emailEnabled: true });

    expect(r.invited).toBe(3);
    expect(r.inapp).toBe(1);
    expect(r.emailed).toBe(2);
    expect(insertedRows).toHaveLength(3);
    expect(pushNotificationSafe).toHaveBeenCalledTimes(1);
    expect(sendProcurementInviteEmail).toHaveBeenCalledTimes(2);
  });

  it("邮件开关需显式 on 且 SMTP 可用：未配置 SMTP 时有账号走站内信、无账号跳过", async () => {
    vi.stubEnv("PROCUREMENT_INVITE_EMAIL", "on");
    isEmailConfigured.mockReturnValue(false);
    listMatchCandidates.mockResolvedValue(candidates(2));
    const { db } = fakePool({ accounts: { 1: 9001 } });

    const r = await dispatchInvitations(db, PROJECT.id, { limit: 10, enabled: true });

    expect(r.emailed).toBe(0);
    expect(r.inapp).toBe(1);
    expect(r.skippedNoChannel).toBe(1);
    expect(sendProcurementInviteEmail).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("显式关闭邮件通道（emailEnabled=false）且无账号时：跳过而非硬发站内信", async () => {
    listMatchCandidates.mockResolvedValue(candidates(2));
    const { db, insertedRows } = fakePool({});

    const r = await dispatchInvitations(db, PROJECT.id, { limit: 10, enabled: true, emailEnabled: false });

    expect(r.emailed).toBe(0);
    expect(r.invited).toBe(0);
    expect(r.skippedNoChannel).toBe(2);
    expect(insertedRows).toHaveLength(0);
    expect(sendProcurementInviteEmail).not.toHaveBeenCalled();
  });
});

describe("dispatchInvitations — 频控与幂等", () => {
  it("冷却期内已达上限的供应商被跳过，且不写邀约行", async () => {
    listMatchCandidates.mockResolvedValue(candidates(2));
    const { db, insertedRows } = fakePool({ cooldown: { 1: 3 } });

    const r = await dispatchInvitations(db, PROJECT.id, { limit: 10, enabled: true, emailEnabled: true, cooldownDays: 7, cooldownMax: 3 });

    expect(r.skippedCooldown).toBe(1);
    expect(r.invited).toBe(1);
    expect(insertedRows).toHaveLength(1);
  });

  it("同一版本重复调用 → 唯一键冲突，计 skippedDuplicate 且不重复发信", async () => {
    listMatchCandidates.mockResolvedValue(candidates(2));
    const { db } = fakePool({ duplicate: true });

    const r = await dispatchInvitations(db, PROJECT.id, { limit: 10, enabled: true, emailEnabled: true });

    expect(r.invited).toBe(0);
    expect(r.skippedDuplicate).toBe(2);
    expect(sendProcurementInviteEmail).not.toHaveBeenCalled();
    expect(pushNotificationSafe).not.toHaveBeenCalled();
  });

  it("limit 截断候选：只处理 top N", async () => {
    listMatchCandidates.mockResolvedValue(candidates(5));
    const { db, insertedRows } = fakePool({});

    await dispatchInvitations(db, PROJECT.id, { limit: 2, enabled: true, emailEnabled: true });

    expect(insertedRows).toHaveLength(2);
  });
});

describe("dispatchInvitations — 失败隔离", () => {
  it("单条邮件失败只标该条 failed，其余继续", async () => {
    listMatchCandidates.mockResolvedValue(candidates(2));
    sendProcurementInviteEmail
      .mockRejectedValueOnce(new Error("SMTP_TIMEOUT"))
      .mockResolvedValueOnce(undefined);
    const { db, statusUpdates } = fakePool({});

    const r = await dispatchInvitations(db, PROJECT.id, { limit: 10, enabled: true, emailEnabled: true });

    expect(r.failed).toBe(1);
    expect(r.emailed).toBe(1);
    expect(statusUpdates.some((u) => u.sql.includes("status") && String(u.params[0]).includes("SMTP_TIMEOUT"))).toBe(true);
  });

  it("需求不存在或未发布 → 全 0，不做任何写", async () => {
    listMatchCandidates.mockResolvedValue(candidates(3));
    const { db, insertedRows } = fakePool({ project: { ...PROJECT, status: "draft" } });

    const r = await dispatchInvitations(db, PROJECT.id, { limit: 10, enabled: true });

    expect(r).toEqual({
      invited: 0,
      emailed: 0,
      inapp: 0,
      skippedCooldown: 0,
      skippedDuplicate: 0,
      skippedNoChannel: 0,
      failed: 0,
    });
    expect(insertedRows).toHaveLength(0);
  });
});

describe("buildInviteToken", () => {
  it("32 位 hex，两次不重复", () => {
    const a = buildInviteToken();
    const b = buildInviteToken();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });
});
