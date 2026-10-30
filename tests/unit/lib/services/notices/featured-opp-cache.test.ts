/**
 * 合格机会查询（findQualifiedOpportunityForNotice）缓存键与候选路测试
 *
 * @description 2026-10-30 详情首屏修复回归：
 *  - /detail 传入的是 notice_public 宽表行（主键列名 notice_pk，没有 id），
 *    旧实现只认 id ⇒ 缓存键恒为空串、10 分钟缓存形同虚设；
 *  - 三条候选路改为并发发出，命中优先级必须仍是 converted → notice_id → reference，
 *    reference 路仍须按标题相似度过撞号。
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { findQualifiedOpportunityForNotice } from "@/lib/services/notices/featured";

vi.mock("server-only", () => ({}));

type QueryFn = (sql: string, params?: unknown[]) => Promise<[RowDataPacket[], unknown]>;

/** 按 SQL 片段分派候选路结果的 mock pool；未命中的路返回空数组 */
function makePool(rows: {
  converted?: RowDataPacket[];
  bySource?: RowDataPacket[];
  byReference?: RowDataPacket[];
}) {
  const queries: string[] = [];
  const query: QueryFn = async (sql: string) => {
    queries.push(sql);
    if (sql.includes("WHERE id = ?")) return [rows.converted ?? [], []];
    if (sql.includes("source_notice_id = ?")) return [rows.bySource ?? [], []];
    if (sql.includes("reference = ?")) return [rows.byReference ?? [], []];
    return [[], []];
  };
  return { pool: { query } as unknown as Pool, queries };
}

const TITLE = "Supply of medical equipment for the regional hospital";

describe("findQualifiedOpportunityForNotice 缓存键", () => {
  it("notice_pk 参与缓存键：同一公告第二次调用命中缓存、不落库", async () => {
    const { pool, queries } = makePool({ bySource: [] });
    const identity = { notice_pk: 9100001, notice_id: "CACHE-PK-1", reference: "R-1", title: TITLE };
    await findQualifiedOpportunityForNotice(pool, identity);
    const afterFirst = queries.length;
    expect(afterFirst).toBeGreaterThan(0);
    await findQualifiedOpportunityForNotice(pool, identity);
    expect(queries.length).toBe(afterFirst);
  });

  it("id 仍参与缓存键（既有调用方回归）", async () => {
    const { pool, queries } = makePool({ bySource: [] });
    const identity = { id: 9100002, notice_id: "CACHE-ID-1", reference: "R-2", title: TITLE };
    await findQualifiedOpportunityForNotice(pool, identity);
    const afterFirst = queries.length;
    await findQualifiedOpportunityForNotice(pool, identity);
    expect(queries.length).toBe(afterFirst);
  });

  it("无主键的空壳载荷不缓存（无法稳定标识公告）", async () => {
    const { pool, queries } = makePool({ bySource: [] });
    // 只有业务编号没有内部主键：无法稳定标识公告 → 跳过缓存，两次调用都要落库
    await findQualifiedOpportunityForNotice(pool, { notice_id: "NO-PK-1" } as never);
    const afterFirst = queries.length;
    expect(afterFirst).toBeGreaterThan(0);
    await findQualifiedOpportunityForNotice(pool, { notice_id: "NO-PK-1" } as never);
    expect(queries.length).toBeGreaterThan(afterFirst);
  });
});

describe("findQualifiedOpportunityForNotice 候选路优先级", () => {
  it("converted 命中时优先于 notice_id", async () => {
    const { pool } = makePool({
      converted: [{ id: 1, title: TITLE } as unknown as RowDataPacket],
      bySource: [{ id: 2, title: TITLE } as unknown as RowDataPacket],
    });
    const row = await findQualifiedOpportunityForNotice(pool, {
      notice_pk: 9100101, converted_opp_id: 1, notice_id: "PRIO-1", reference: "R-PRIO-1", title: TITLE,
    });
    expect(row?.id).toBe(1);
  });

  it("notice_id 命中时优先于 reference", async () => {
    const { pool } = makePool({
      bySource: [{ id: 2, title: TITLE } as unknown as RowDataPacket],
      byReference: [{ id: 3, title: TITLE } as unknown as RowDataPacket],
    });
    const row = await findQualifiedOpportunityForNotice(pool, {
      notice_pk: 9100102, notice_id: "PRIO-2", reference: "R-PRIO-2", title: TITLE,
    });
    expect(row?.id).toBe(2);
  });

  it("notice_id 未命中时回落 reference，并按标题相似度过滤撞号", async () => {
    const { pool } = makePool({
      bySource: [],
      byReference: [
        { id: 4, title: "Construction of a bridge in another country" } as unknown as RowDataPacket,
        { id: 5, title: TITLE } as unknown as RowDataPacket,
      ],
    });
    const row = await findQualifiedOpportunityForNotice(pool, {
      notice_pk: 9100103, notice_id: "PRIO-3", reference: "R-PRIO-3", title: TITLE,
    });
    expect(row?.id).toBe(5);
  });

  it("reference 候选全部撞号时返回 null", async () => {
    const { pool } = makePool({
      bySource: [],
      byReference: [{ id: 6, title: "Unrelated catering services for schools" } as unknown as RowDataPacket],
    });
    const row = await findQualifiedOpportunityForNotice(pool, {
      notice_pk: 9100104, notice_id: "PRIO-4", reference: "R-PRIO-4", title: TITLE,
    });
    expect(row).toBeNull();
  });
});
