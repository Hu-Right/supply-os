/**
 * rfq-outreach 服务单测（mock pool + mock 邮件，不连真库、不发真信）
 *
 * @module tests/unit/lib/services/rfq-outreach
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool } from "mysql2/promise";

vi.mock("@/lib/services/email", () => ({
  isEmailConfigured: vi.fn(() => true),
  sendRfqInviteEmail: vi.fn(async () => {}),
  sendRfqQuoteReceivedEmail: vi.fn(async () => {}),
  sendRfqAwardedEmail: vi.fn(async () => {}),
}));

import { isEmailConfigured, sendRfqInviteEmail } from "@/lib/services/email";
import { outreachPublishedRfq } from "@/lib/services/rfq-outreach";

function pool(responses: unknown[][]): Pool {
  const q = vi.fn();
  for (const r of responses) q.mockResolvedValueOnce(r as never);
  return { query: q } as unknown as Pool;
}

const publishedRow = [[{ id: 7, title: "采购 X", deadline_sec: 0, estimated_value: 50, currency: "CNY", rfq_status: "published" }]];

beforeEach(() => {
  vi.mocked(sendRfqInviteEmail).mockClear();
});

describe("outreachPublishedRfq", () => {
  it("非已发布 → published:false（不发不记）", async () => {
    const p = pool([[[]]]);
    const res = await outreachPublishedRfq(p, { rfqId: 9, emails: ["a@b.com"] });
    expect(res).toMatchObject({ published: false, emailed: 0 });
    expect(sendRfqInviteEmail).not.toHaveBeenCalled();
  });

  it("显式收件 → 发送邀约 + 写账本", async () => {
    const p = pool([publishedRow, [[]], [{ insertId: 1 }]]); // rfq / alreadyReached(空) / record
    const res = await outreachPublishedRfq(p, { rfqId: 7, emails: ["sup@x.com"] });
    expect(res).toMatchObject({ published: true, recipients: 1, emailed: 1, skipped: 0 });
    expect(isEmailConfigured).toHaveBeenCalled();
    const [to, opts] = vi.mocked(sendRfqInviteEmail).mock.calls[0];
    expect(to).toBe("sup@x.com");
    expect(opts.rfqTitle).toBe("采购 X");
    expect(String(opts.rfqLink)).toContain("/rfq/7");
  });

  it("已触达过去重 → skipped，不重复发", async () => {
    const p = pool([publishedRow, [[{ 1: 1 }]]]); // rfq / alreadyReached(命中)
    const res = await outreachPublishedRfq(p, { rfqId: 7, emails: ["dup@x.com"] });
    expect(res).toMatchObject({ emailed: 0, skipped: 1 });
    expect(sendRfqInviteEmail).not.toHaveBeenCalled();
  });

  it("dryRun → 只解析收件不发送/不写账本", async () => {
    const p = pool([publishedRow, [[]]]); // 仅 rfq + alreadyReached，无 record
    const res = await outreachPublishedRfq(p, { rfqId: 7, emails: ["t@x.com"], dryRun: true });
    expect(res).toMatchObject({ dryRun: true, recipients: 1, emailed: 1 });
    expect(sendRfqInviteEmail).not.toHaveBeenCalled();
    expect(p.query).toHaveBeenCalledTimes(2);
  });
});
