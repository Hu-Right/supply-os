/**
 * rfq-outreach 服务单测（mock pool + mock 邮件 + mock 骨架索引，不连真库、不发真信）
 *
 * @module tests/unit/lib/services/rfq-outreach
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool } from "mysql2/promise";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/services/email", () => ({
  isEmailConfigured: vi.fn(() => true),
  sendRfqInviteEmail: vi.fn(async () => {}),
  sendRfqQuoteReceivedEmail: vi.fn(async () => {}),
  sendRfqAwardedEmail: vi.fn(async () => {}),
  sendRfqRejectedEmail: vi.fn(async () => {}),
}));

// 骨架索引：pathOf 用「按 - 分段、去掉根 UGT 的前缀链」模拟祖先节点集
vi.mock("@/lib/services/commodity/backbone-cache", () => ({
  getBackboneIndex: vi.fn(async () => ({
    pathOf: (codes: string[]) => {
      const out: string[] = [];
      for (const code of codes) {
        const t = String(code).split("-");
        for (let i = 1; i < t.length; i++) out.push(t.slice(0, i + 1).join("-"));
      }
      return { codes: out, misses: [] };
    },
  })),
}));

import { isEmailConfigured, sendRfqInviteEmail } from "@/lib/services/email";
import { outreachPublishedRfq, addInvites } from "@/lib/services/rfq-outreach";

function pool(responses: unknown[][]): Pool {
  const q = vi.fn();
  for (const r of responses) q.mockResolvedValueOnce(r as never);
  return { query: q } as unknown as Pool;
}

const rfqPublished = (over: Record<string, unknown> = {}) =>
  [[{ title: "采购X", deadline: "2026-12-31", rfq_status: "published", category_code: null, province_name: "陕西", visibility: "public", ...over }]];

const CAND = [[
  { user_id: 41, email: "a@x.com", supplier_id: 11, company: "A公司", province: "陕西" },
  { user_id: 42, email: "b@x.com", supplier_id: 12, company: "B公司", province: "广东" },
]];

beforeEach(() => {
  vi.mocked(sendRfqInviteEmail).mockClear();
});

describe("outreachPublishedRfq — 显式收件", () => {
  it("非已发布 → published:false（不发不记）", async () => {
    const p = pool([[[]]]);
    const res = await outreachPublishedRfq(p, { rfqId: 9, emails: ["a@b.com"] });
    expect(res).toMatchObject({ published: false, emailed: 0 });
    expect(sendRfqInviteEmail).not.toHaveBeenCalled();
  });

  it("显式收件 → 发送邀约 + 写账本", async () => {
    const p = pool([rfqPublished(), [[]], [{ insertId: 1 }]]); // rfq / alreadyReached(空) / record
    const res = await outreachPublishedRfq(p, { rfqId: 7, emails: ["sup@x.com"] });
    expect(res).toMatchObject({ published: true, recipients: 1, emailed: 1, skipped: 0, strategy: "explicit" });
    expect(isEmailConfigured).toHaveBeenCalled();
    const [to, opts] = vi.mocked(sendRfqInviteEmail).mock.calls[0];
    expect(to).toBe("sup@x.com");
    expect(opts.rfqTitle).toBe("采购X");
    expect(String(opts.rfqLink)).toContain("/rfq/7");
  });

  it("已触达过去重 → skipped，不重复发", async () => {
    const p = pool([rfqPublished(), [[{ 1: 1 }]]]); // rfq / alreadyReached(命中)
    const res = await outreachPublishedRfq(p, { rfqId: 7, emails: ["dup@x.com"] });
    expect(res).toMatchObject({ emailed: 0, skipped: 1 });
    expect(sendRfqInviteEmail).not.toHaveBeenCalled();
  });

  it("dryRun 显式 → 不发送/不写账本/不做去重查询", async () => {
    const p = pool([rfqPublished()]); // 仅 rfq
    const res = await outreachPublishedRfq(p, { rfqId: 7, emails: ["t@x.com"], dryRun: true });
    expect(res).toMatchObject({ dryRun: true, recipients: 1, emailed: 0 });
    expect(sendRfqInviteEmail).not.toHaveBeenCalled();
    expect(p.query).toHaveBeenCalledTimes(1);
  });
});

describe("outreachPublishedRfq — 匹配器", () => {
  it("无品类 → region 回退，按候选池 Top-N 预览（不发）", async () => {
    const p = pool([rfqPublished(), CAND]); // rfq / candidates
    const res = await outreachPublishedRfq(p, { rfqId: 7, dryRun: true });
    expect(res).toMatchObject({ dryRun: true, strategy: "region", recipients: 2, emailed: 0 });
    expect(res.preview?.map((r) => r.email)).toEqual(["a@x.com", "b@x.com"]);
    expect(p.query).toHaveBeenCalledTimes(2);
  });

  it("有品类交集 → category，仅命中者进入预览", async () => {
    const p = pool([rfqPublished({ category_code: "UGT-A" }), CAND, [[{ supplier_id: 11, code: "UGT-A-1" }]]]);
    const res = await outreachPublishedRfq(p, { rfqId: 7, dryRun: true });
    expect(res).toMatchObject({ strategy: "category", recipients: 1 });
    expect(res.preview?.[0]).toMatchObject({ email: "a@x.com", matchCount: 1 });
    expect(p.query).toHaveBeenCalledTimes(3);
  });

  it("有品类交集 + 非 dryRun → 发送 + 写账本（仅命中者）", async () => {
    const p = pool([
      rfqPublished({ category_code: "UGT-A" }),
      CAND,
      [[{ supplier_id: 11, code: "UGT-A-1" }]],
      [{ insertId: 9 }], // recordOutreach
    ]);
    const res = await outreachPublishedRfq(p, { rfqId: 7 });
    expect(res).toMatchObject({ strategy: "category", recipients: 1, emailed: 1, skipped: 0 });
    expect(sendRfqInviteEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendRfqInviteEmail).mock.calls[0][0]).toBe("a@x.com");
  });
});

describe("addInvites", () => {
  it("去重过滤非法 id，INSERT IGNORE 返回受影响行", async () => {
    const q = vi.fn().mockResolvedValue([{ affectedRows: 2 }]);
    const p = { query: q } as unknown as Pool;
    const n = await addInvites(p, 7, 6, [41, 41, 0, NaN, 42]);
    expect(n).toBe(2);
    expect(q).toHaveBeenCalledTimes(1);
    // 去重后应只剩 (rfq=7,supplier=41,invitedBy=6) 与 (7,42,6)
    expect(q.mock.calls[0][1]).toEqual([7, 41, 6, 7, 42, 6]);
  });
});
