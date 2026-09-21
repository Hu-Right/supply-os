/**
 * 迁移 089 行为契约（官方收录国际标杆 AOI SP4130189）：
 * - 法语正文含撇号，必须走参数化占位符，一旦拼进 SQL 字面量即语法错误（实施时真实踩过）
 * - 公告行不写 deadline_sec（STORED 生成列）也不写 estimated_value（宽表 parseDecimalValue
 *   会抠数字，保函/融资额进该列即污染金额排序）
 * - is_active=1 为活跃权威标识；entry_source='crawl'（官方收录与爬虫同源，非平台用户行）
 * - 机会行先删同 source_notice_id 旧行再插（该列无唯一键，多合格行会让宽表 JOIN 不确定）
 * - 17 个国际采购列全部落值；桥接表写字典 id 链而非 code
 */
import { describe, it, expect, vi } from "vitest";
import type { Pool } from "mysql2/promise";

import { migration } from "@/lib/db/migrations/089-ingest-intl-tender-el-menzel";

function makePool(opts: { existingNoticeId?: number } = {}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    const s = String(sql);
    calls.push({ sql: s, params: (params as unknown[]) || [] });
    if (/SELECT id FROM crm_bid_notices/i.test(s)) {
      return [[{ id: opts.existingNoticeId ?? 0 }]];
    }
    if (/^INSERT/i.test(s.trim())) return [{ insertId: 555001 }];
    return [{}];
  });
  return { pool: { query } as unknown as Pool, calls };
}

const findInsert = (calls: ReturnType<typeof makePool>["calls"], table: string) =>
  calls.find((c) => new RegExp(`INSERT INTO ${table}`, "i").test(c.sql));

describe("migration 089 · 收录 AOI SP4130189", () => {
  it("版本号与名称", () => {
    expect(migration.version).toBe(89);
    expect(migration.name).toBe("ingest-intl-tender-el-menzel");
  });

  it("全部业务文本走参数化，SQL 字面量里不出现含撇号的正文", async () => {
    const { pool, calls } = makePool();
    await migration.up(pool);
    const joined = calls.map((c) => c.sql).join("\n");
    expect(joined).not.toMatch(/Appel d/);
    expect(joined).not.toMatch(/l'offre/i);
    // 参数里必须能找回这些文本（确认真的传进去了，而不是被丢掉）
    const allParams = calls.flatMap((c) => c.params).map(String).join("\n");
    expect(allParams).toMatch(/Appel d'Offres International n SP4130189/);
  });

  it("公告行按 (notice_id, source_channel) 定位，缺失才插", async () => {
    const { pool, calls } = makePool();
    await migration.up(pool);
    const probe = calls.find((c) => /SELECT id FROM crm_bid_notices/i.test(c.sql));
    expect(probe?.sql).toMatch(/notice_id = \? AND source_channel = \?/i);
    expect(probe?.params).toEqual(["SP4130189", "onee"]);
  });

  it("已存在时改走 UPDATE，不再发公告 INSERT（重复执行零重复行）", async () => {
    const { pool, calls } = makePool({ existingNoticeId: 1786999999 });
    await migration.up(pool);
    expect(calls.some((c) => /INSERT INTO crm_bid_notices/i.test(c.sql))).toBe(false);
    const upd = calls.find((c) => /UPDATE crm_bid_notices/i.test(c.sql));
    expect(upd?.sql).toMatch(/is_active = 1/i);
    expect(upd?.params).toContain(1786999999);
  });

  it("公告行不写生成列 deadline_sec，也不写 estimated_value", async () => {
    const { pool, calls } = makePool();
    await migration.up(pool);
    const ins = findInsert(calls, "crm_bid_notices");
    expect(ins).toBeTruthy();
    expect(ins!.sql).not.toMatch(/deadline_sec/);
    expect(ins!.sql).not.toMatch(/estimated_value/);
    expect(ins!.sql).toMatch(/is_active/);
    expect(ins!.params).toContain("crawl");
    // 截止时刻：2026-10-28 09:30 Africa/Casablanca = 08:30 UTC
    expect(ins!.sql).toMatch(/deadline_ts/);
    expect(ins!.params).toContain(1793176200);
    expect(ins!.params).toContain("2026-10-28 09:30:00");
  });

  it("机会行先删同键旧行，再插入且 17 个国际采购列齐备", async () => {
    const { pool, calls } = makePool();
    await migration.up(pool);
    const delIdx = calls.findIndex((c) => /DELETE FROM crm_bid_opportunities/i.test(c.sql));
    const insIdx = calls.findIndex((c) => /INSERT INTO crm_bid_opportunities/i.test(c.sql));
    expect(delIdx).toBeGreaterThanOrEqual(0);
    expect(insIdx).toBeGreaterThan(delIdx);
    expect(calls[delIdx].params).toEqual(["SP4130189"]);

    const ins = calls[insIdx];
    for (const col of [
      "procurement_procedure", "prequalification_required", "lot_structure", "contract_form",
      "consortium_rule", "bid_validity_days", "submission_mode", "submission_requirement",
      "submission_address", "funding_agency", "evaluation_method", "language_requirement",
      "execution_period", "local_content", "eshs_requirements", "eligible_countries", "key_dates",
    ]) {
      expect(ins.sql).toContain(col);
    }
    // 审核态必须满足 qualifiedOppWhere，否则详情页与宽表都不会取用这条机会
    expect(ins.params).toContain("approved");
    expect(ins.params).toContain(1);
    // 时区与合格国等关键值真的落进去了
    expect(ins.params).toContain("Africa/Casablanca");
    expect(ins.params).toContain("paper");
    expect(ins.params).toContain(182);
    // 融资额与保函文本不得进 estimated_value
    expect(ins.sql).not.toMatch(/estimated_value/);
  });

  it("桥接表写 levelN_id 字典 id 链（不是 code），4 条码各一次 ODKU", async () => {
    const { pool, calls } = makePool();
    await migration.up(pool);
    const bridge = calls.filter((c) => /INSERT INTO crm_bid_notice_unspsc_codes/i.test(c.sql));
    expect(bridge).toHaveLength(4);
    for (const b of bridge) {
      expect(b.sql).toMatch(/ON DUPLICATE KEY UPDATE/i);
      expect(b.sql).toMatch(/level1_id/);
      // 参数为 [notice_id, codeId, code, level, l1..l5]：id 均为数字，code 为字符串
      expect(typeof b.params[1]).toBe("number");
      expect(b.params.slice(4, 9).every((v) => typeof v === "number")).toBe(true);
    }
    const codes = bridge.map((b) => String(b.params[2]));
    expect(codes).toEqual(expect.arrayContaining(["26101511", "40151510", "72140000", "83101805"]));
  });
});
