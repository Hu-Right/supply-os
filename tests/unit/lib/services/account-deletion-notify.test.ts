/**
 * 注销结果通知：邮箱发送成功写水位；纯手机号标记 skipped；发送失败不写水位（下轮重试）。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  listUnnotified: vi.fn(),
  markNotified: vi.fn(),
  send: vi.fn(),
  emailConfigured: vi.fn(),
}));

vi.mock("@/lib/repos/account-deletion.repo", () => ({
  AccountDeletionRepo: function (this: Record<string, unknown>) {
    Object.assign(this, { listUnnotified: mocks.listUnnotified, markNotified: mocks.markNotified });
  },
}));

vi.mock("@/lib/services/email", () => ({
  isEmailConfigured: mocks.emailConfigured,
  sendNotificationEmail: mocks.send,
}));

import { notifyAccountDeletionResults } from "@/lib/services/account-deletion";

const row = (over: Record<string, unknown>) => ({
  id: 1, user_id: 7, identifier: "a@b.com", reason: null, contact: null,
  status: "done", handled_by: "客服A", handled_note: null,
  notified_at: null, notified_channel: null, created_at: "", updated_at: "", ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.emailConfigured.mockReturnValue(true);
  mocks.send.mockResolvedValue(undefined);
});

describe("notifyAccountDeletionResults", () => {
  it("邮箱标识 → 发送并写 email 水位", async () => {
    mocks.listUnnotified.mockResolvedValue([row({})]);
    const r = await notifyAccountDeletionResults({} as never);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.markNotified).toHaveBeenCalledWith(1, "email");
    expect(r).toEqual({ sent: 1, skipped: 0, failed: 0 });
  });

  it("纯手机号 → 不发信，标记 skipped", async () => {
    mocks.listUnnotified.mockResolvedValue([row({ identifier: "13800000000" })]);
    const r = await notifyAccountDeletionResults({} as never);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.markNotified).toHaveBeenCalledWith(1, "skipped");
    expect(r).toEqual({ sent: 0, skipped: 1, failed: 0 });
  });

  it("发送失败 → 不写水位，计 failed（下轮重试）", async () => {
    mocks.listUnnotified.mockResolvedValue([row({})]);
    mocks.send.mockRejectedValue(new Error("smtp down"));
    const r = await notifyAccountDeletionResults({} as never);
    expect(mocks.markNotified).not.toHaveBeenCalled();
    expect(r).toEqual({ sent: 0, skipped: 0, failed: 1 });
  });

  it("SMTP 未配置 → 保持待通知（不写水位）", async () => {
    mocks.listUnnotified.mockResolvedValue([row({})]);
    mocks.emailConfigured.mockReturnValue(false);
    const r = await notifyAccountDeletionResults({} as never);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.markNotified).not.toHaveBeenCalled();
    expect(r.failed).toBe(0);
  });
});
