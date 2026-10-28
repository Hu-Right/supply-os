/**
 * 品目归类队列生产者 — SQL 契约测试
 *
 * 钉住三件事（桥表退役后这是新公告获得 UGT 归属的唯一登记口）：
 * 1. INSERT 形制对齐消费端（notice-attribution-content-ai）：uk_src 幂等键 =
 *    (source_table='bid_notices', source_pk=内部 id)，notice_id 存外部编号，
 *    code=''（队列不承载码），status='pending'；
 * 2. 候选谓词与 AI 管道同一条口径：活跃 + 无有效落点(L2+) + NOT EXISTS 已登记
 *    （「无有效落点」的写法来自 attribution-contract.withoutValidLandingWhere，
 *     钉码长下限而不是只钉表名：退回「任何落点行都算已覆盖」就是本测试该拦的事）；
 * 3. 单轮上限截断：deferred 留给下一轮爬虫同步，不一次性堆爆队列。
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";

vi.mock("server-only", () => ({}));

import { enqueueUnattributedNotices } from "@/lib/services/commodity/taxonomy-intake";

function fakePool(candidateRows: Array<{ id: number; notice_id: string }>) {
  const calls: Array<{ sql: string; args: unknown[] }> = [];
  const pool = {
    query: vi.fn(async (sql: string, args: unknown[] = []) => {
      calls.push({ sql: String(sql), args });
      if (String(sql).includes("FROM bid_notices")) return [candidateRows];
      // INSERT：affectedRows 按实际绑定行数回（每行 3 个绑定参数），cap 截断才有意义
      return [{ affectedRows: args.length / 3 }];
    }),
  };
  return { pool: pool as unknown as Pool, calls };
}

describe("enqueueUnattributedNotices", () => {
  it("空入参一条 SQL 都不发", async () => {
    const { pool, calls } = fakePool([]);
    const r = await enqueueUnattributedNotices(pool, []);
    expect(r).toEqual({ enqueued: 0, skipped: 0, deferred: 0 });
    expect(calls).toHaveLength(0);
  });

  it("INSERT 形制：uk_src 键 + 外部编号 + code 空 + pending，IGNORE 幂等", async () => {
    const { pool, calls } = fakePool([{ id: 11, notice_id: "EXT-11" }]);
    const r = await enqueueUnattributedNotices(pool, [11]);
    expect(r).toEqual({ enqueued: 1, skipped: 0, deferred: 0 });
    const insert = calls.find((c) => c.sql.includes("INSERT IGNORE INTO taxonomy_intake"));
    expect(insert).toBeTruthy();
    expect(insert!.sql).toContain("source_table, source_pk, notice_id, code, reason, status");
    // 每行 3 个绑定参数：source_pk / notice_id / reason；表名与 pending 是字面量
    expect(insert!.args).toEqual(["11", "EXT-11", "公告无 UGT 归属（桥表退役后由 AI 管道归类）"]);
    expect(insert!.sql).toContain("'bid_notices'");
    expect(insert!.sql).toContain("'pending'");
  });

  it("候选谓词带齐三道闸：活跃 + 无有效落点(L2+) + 未登记（与 AI 管道同口径）", async () => {
    const { pool, calls } = fakePool([]);
    await enqueueUnattributedNotices(pool, [11, 12]);
    const select = calls.find((c) => c.sql.includes("FROM bid_notices"))!;
    expect(select.sql).toContain("deadline_sec"); // 活跃闸（ACTIVE_NOTICE_WHERE 展开形态）
    // 下限必须是码长 ≥8（L2 起）：少了这段，谓词就退化成「有任意落点行即算已归属」，
    // 而只挂到 L1 大类的 14 万条公告会被永久关在队列外。
    expect(select.sql).toContain(
      "NOT EXISTS (SELECT 1 FROM `notice_attribution_nodes` a WHERE a.notice_pk = n.id AND LENGTH(a.node_code) >= 8)",
    );
    expect(select.sql).toContain("NOT EXISTS (SELECT 1 FROM taxonomy_intake i WHERE i.source_table = 'bid_notices'");
  });

  it("单轮上限截断：deferred 留给下一轮", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, notice_id: `EXT-${i + 1}` }));
    const { pool } = fakePool(rows);
    const r = await enqueueUnattributedNotices(pool, [1, 2, 3, 4, 5], 3);
    expect(r.enqueued).toBe(3);
    expect(r.deferred).toBe(2);
  });

  it("skipped = 入参数 - 候选数（有归属/非活跃在 SQL 侧被滤掉）", async () => {
    const { pool } = fakePool([{ id: 11, notice_id: "EXT-11" }]);
    const r = await enqueueUnattributedNotices(pool, [11, 12, 13]);
    expect(r.skipped).toBe(2);
  });
});
