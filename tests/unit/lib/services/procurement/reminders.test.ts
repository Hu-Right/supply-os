/**
 * 截止前提醒 / 延长截止 单测（mock 连接池）
 * @module tests/unit/lib/services/procurement/reminders
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";
// tender.ts 模块链上的 file-upload 会拉起 server-only（pool 链），单测内 mock 掉
vi.mock("@/lib/services/file-upload", () => ({
  saveProcurementScan: vi.fn(async (p: { filename: string }) => ({
    url: `/api/procurement/authorization-files/${p.filename}`,
    filename: p.filename,
  })),
}));
import { remindDueDeadlines } from "@/lib/services/procurement/reminders";
import { extendProjectDeadline } from "@/lib/services/procurement/tender";
import { renderNotification } from "@/shared/notifications/renderNotification";

const NOW = 1_777_593_600;
const HOUR = 3_600;
const DAY = 86_400;

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
      return [[]];
    }),
  };
  const pool = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      for (const key of Object.keys(handlers)) if (sql.includes(key)) return handlers[key](sql);
      return [[]];
    }),
    getConnection: vi.fn().mockResolvedValue(conn),
  } as unknown as Pool;
  return { pool, conn, calls };
}

function findCall(calls: Array<[string, unknown[] | undefined]>, fragment: string) {
  return calls.filter(([sql]) => sql.includes(fragment));
}

/** 失败分支断言助手：联合类型窄化（仅 ok:false 分支带 reason） */
async function failReason(p: Promise<{ ok: boolean; reason?: string }>): Promise<string | undefined> {
  const r = await p;
  expect(r.ok).toBe(false);
  return (r as { reason?: string }).reason;
}

describe("remindDueDeadlines 截止前提醒", () => {
  const tenderRow = (tenderId: number, deadlineAt: number) => ({
    project_id: 9,
    tender_id: tenderId,
    version_no: 1,
    deadline_at: deadlineAt,
  });

  it("72h/24h 两档窗口互斥，各发一条提醒且 dedupeKey 含截止时刻", async () => {
    // 两条候选分别落在 72h / 24h 窗口；第 3 次扫描查询为空（处理器返回 [rows] 元组）
    const maxQueue: unknown[] = [[[tenderRow(5, NOW + 2 * DAY)]], [[tenderRow(6, NOW + 2 * HOUR)]], [[]]];
    const { pool, calls } = fakeDb({
      "MAX(t2.id)": () => maxQueue.shift() ?? [[]],
      "procurement_responses": () => [[{ c: 3 }]],
      "JOIN procurement_buyers b": () => [[{ user_id: 9, reference: "OSPR-2026-000007" }]],
      "INSERT INTO notifications": () => [{ insertId: 101 }],
    });

    const sent = await remindDueDeadlines(pool, NOW);
    expect(sent).toBe(2);

    // 窗口互斥：72h 档下界=now+24h，24h 档下界=now
    const scans = findCall(calls, "AND t.deadline_at > ?");
    expect(scans).toHaveLength(2);
    expect(scans[0][1]).toEqual([NOW + 24 * HOUR, NOW + 72 * HOUR]);
    expect(scans[1][1]).toEqual([NOW, NOW + 24 * HOUR]);

    const inserts = findCall(calls, "INSERT INTO notifications");
    expect(inserts).toHaveLength(2);
    const keys = inserts.map(([, params]) => String((params as unknown[])[7]));
    expect(keys[0]).toBe(`procurement.deadline_reminder:5:72h:${NOW + 2 * DAY}`);
    expect(keys[1]).toBe(`procurement.deadline_reminder:6:24h:${NOW + 2 * HOUR}`);
    const payload0 = JSON.parse(String((inserts[0][1] as unknown[])[6]));
    expect(payload0).toMatchObject({ hours: 72, responseCount: 3, projectId: 9 });
  });

  it("收件人缺失/已发过（dedupe 返回 0）不计入 sent", async () => {
    const { pool } = fakeDb({
      "MAX(t2.id)": () => [[tenderRow(5, NOW + 2 * DAY)]],
      "procurement_responses": () => [[{ c: 0 }]],
      // 采购方无绑定账号 → 不发
      "JOIN procurement_buyers b": () => [[]],
    });
    const sent = await remindDueDeadlines(pool, NOW);
    expect(sent).toBe(0);
  });
});

describe("extendProjectDeadline 延长截止", () => {
  const publishedRfq = {
    id: 9,
    status: "published",
    method: "rfq",
    notice_pk: 12,
    reference: "OSPR-2026-000009",
    buyer_user_id: 9,
    tender_id: 5,
    tender_deadline: NOW + 3 * DAY,
  };

  it("rfq 已发布：顺延 tender/project/投影并留事件+通知", async () => {
    const { pool, calls } = fakeDb({
      "FOR UPDATE": () => [[publishedRfq]],
      "UPDATE procurement_tenders": () => [{ affectedRows: 1 }],
      "UPDATE bid_notices": () => [{ affectedRows: 1 }],
      "SELECT user_id FROM procurement_buyers": () => [[{ user_id: 9 }]],
    });
    const newDeadline = NOW + 10 * DAY;
    const result = await extendProjectDeadline(pool, {
      projectId: 9,
      buyerUserId: 1,
      newDeadlineAt: newDeadline,
      at: NOW,
    });
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    expect(result).toMatchObject({ tenderId: 5, oldDeadlineAt: NOW + 3 * DAY, newDeadlineAt: newDeadline });

    const tenderUpd = findCall(calls, "UPDATE procurement_tenders")[0];
    expect(tenderUpd[1]).toEqual([newDeadline, 5]);
    const projUpd = findCall(calls, "UPDATE procurement_projects SET quote_deadline_at")[0];
    expect(projUpd[1]).toEqual([newDeadline, NOW, 9]);
    const noticeUpd = findCall(calls, "UPDATE bid_notices")[0];
    // deadline 列=上海日期串、deadline_ts=毫秒、update_time 顶水位、限定平台行
    expect(noticeUpd[1]).toEqual([expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), newDeadline * 1000, NOW, 12]);
    const event = findCall(calls, "INSERT INTO procurement_events")[0];
    // VALUES (?, ?, 'buyer', ?, 'deadline_extended', ?, ?) → payload 位于参数位 3
    const eventPayload = JSON.parse(String((event[1] as unknown[])[3]));
    expect(eventPayload).toMatchObject({ oldDeadlineAt: NOW + 3 * DAY, newDeadlineAt: newDeadline });
    const notif = findCall(calls, "INSERT INTO notifications")[0];
    expect(notif[1]?.[1]).toBe("procurement.deadline_extended");
    expect(String(notif[1]?.[7])).toBe(`procurement.deadline_extended:5:${newDeadline}`);
  });

  it("itb/rfp 拒绝：延期须走补遗通道", async () => {
    const { pool, calls } = fakeDb({
      "FOR UPDATE": () => [[{ ...publishedRfq, method: "itb" }]],
    });
    const result = await extendProjectDeadline(pool, {
      projectId: 9,
      buyerUserId: 1,
      newDeadlineAt: NOW + 10 * DAY,
      at: NOW,
    });
    expect(result).toEqual({ ok: false, reason: "method_not_allowed" });
    expect(findCall(calls, "UPDATE procurement_tenders")).toHaveLength(0);
  });

  it("非法目标时间：过去时刻/不晚于现截止/超过一年上限", async () => {
    const { pool } = fakeDb({ "FOR UPDATE": () => [[publishedRfq]] });
    expect(
      await failReason(extendProjectDeadline(pool, { projectId: 9, buyerUserId: 1, newDeadlineAt: NOW - 1, at: NOW })),
    ).toBe("invalid_deadline");
    expect(
      await failReason(
        extendProjectDeadline(pool, {
          projectId: 9,
          buyerUserId: 1,
          newDeadlineAt: NOW + 2 * DAY, // 早于现截止 NOW+3d
          at: NOW,
        }),
      ),
    ).toBe("invalid_deadline");
    expect(
      await failReason(
        extendProjectDeadline(pool, { projectId: 9, buyerUserId: 1, newDeadlineAt: NOW + 400 * DAY, at: NOW }),
      ),
    ).toBe("invalid_deadline");
  });

  it("非 published 项目 / 开标竞态（affectedRows=0）→ not_published", async () => {
    const draft = fakeDb({ "FOR UPDATE": () => [[{ ...publishedRfq, status: "under_review" }]] });
    expect(
      await failReason(
        extendProjectDeadline(draft.pool, { projectId: 9, buyerUserId: 1, newDeadlineAt: NOW + 10 * DAY, at: NOW }),
      ),
    ).toBe("not_published");

    // 开标器已把 tender 置 closed → UPDATE 条件不命中
    const raced = fakeDb({
      "FOR UPDATE": () => [[publishedRfq]],
      "UPDATE procurement_tenders": () => [{ affectedRows: 0 }],
    });
    expect(
      await failReason(
        extendProjectDeadline(raced.pool, { projectId: 9, buyerUserId: 1, newDeadlineAt: NOW + 10 * DAY, at: NOW }),
      ),
    ).toBe("not_published");
    expect(findCall(raced.calls, "UPDATE bid_notices")).toHaveLength(0);
  });

  it("归属并入 not_found（404 掩护）", async () => {
    const { pool } = fakeDb({ "FOR UPDATE": () => [[]] });
    const result = await extendProjectDeadline(pool, {
      projectId: 9,
      buyerUserId: 999,
      newDeadlineAt: NOW + 10 * DAY,
      at: NOW,
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("renderNotification 新类型登记", () => {
  const t = (key: string, params?: Record<string, string | number>) =>
    params ? `${key}?${JSON.stringify(params)}` : key;

  it("deadline_reminder / opened / eoi_closed / deadline_extended 均映射文案键", () => {
    const r1 = renderNotification(t, {
      type: "procurement.deadline_reminder",
      title: "",
      body: "",
      payload: { reference: "OSPR-2026-000007", hours: 72, responseCount: 3 },
    });
    expect(r1.title).toBe("notifTDeadlineReminder");
    expect(r1.body).toContain("notifBDeadlineReminder");
    // p() 把 payload 值统一转字符串（t() 占位不能是 undefined）
    expect(r1.body).toContain('"hours":"72"');

    const r2 = renderNotification(t, {
      type: "procurement.opened",
      title: "",
      body: "",
      payload: { reference: "OSPR-2026-000007", responseCount: 5 },
    });
    expect(r2.title).toBe("notifTProcurementOpened");
    // responseCount 缺失回退 "0"（占位符不能是 undefined）
    const r2n = renderNotification(t, { type: "procurement.opened", title: "", body: "", payload: { reference: "X" } });
    expect(r2n.body).toContain('"count":"0"');

    const r3 = renderNotification(t, {
      type: "procurement.eoi_closed",
      title: "",
      body: "",
      payload: { reference: "OSPR-2026-000007", responseCount: 8 },
    });
    expect(r3.title).toBe("notifTProcurementEoiClosed");

    const r4 = renderNotification(t, {
      type: "procurement.deadline_extended",
      title: "",
      body: "",
      payload: { reference: "OSPR-2026-000007", oldDeadlineDate: "2026-12-01", newDeadlineDate: "2026-12-15" },
    });
    expect(r4.title).toBe("notifTDeadlineExtended");
    expect(r4.body).toContain("2026-12-15");
  });
});
