/**
 * 迁移 090 membership-plans-v2 结构契约测试
 *
 * @description 用 mock Pool 断言 090 的 SQL 编排符合 V2 全量作废切换设计（2026-09-21 用户裁决：
 *              旧权益不做到期过渡、一律作废）：新增 benefit_rank 列、旧 code 订阅/权益关闭、
 *              失去订阅的用户降级 free、旧套餐行物理删除（无条件，含悬挂 code）、
 *              free 行改造、新 4 档上架；并验证 up() 可重复执行（幂等）。
 */
import { describe, it, expect, vi } from "vitest";
import { migration, LEGACY_PLAN_CODES } from "@/lib/db/migrations/090-membership-plans-v2";

function makePool() {
  const executed: Array<{ sql: string; params?: unknown[] }> = [];
  const queried: string[] = [];
  const pool = {
    // ensureColumn 的存在性探测：total=0 → 触发一次 ALTER ADD COLUMN
    query: vi.fn(async (sql: string) => {
      queried.push(sql);
      if (/INFORMATION_SCHEMA\.COLUMNS/i.test(sql)) return [[{ total: 0 }], []];
      return [[], []];
    }),
    execute: vi.fn(async (sql: string, params?: unknown[]) => {
      executed.push({ sql, params });
      return [{}, []];
    }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { pool: pool as any, executed, queried };
}

/** 按片段匹配已执行语句（占位符 SQL 无法按 code 匹配，改按表+动作定位） */
function findExec(executed: Array<{ sql: string; params?: unknown[] }>, re: RegExp) {
  return executed.find((e) => re.test(e.sql));
}

describe("migration 090 · membership-plans-v2", () => {
  it("元数据正确", () => {
    expect(migration.version).toBe(90);
    expect(migration.name).toBe("membership-plans-v2");
  });

  it("新增 benefit_rank 档位列", async () => {
    const { pool, queried } = makePool();
    await migration.up(pool);
    expect(queried.some((s) => /ADD COLUMN benefit_rank/i.test(s))).toBe(true);
  });

  it("旧 code 的活跃订阅与权益全部关闭（closed，参数含全部旧 code 含悬挂）", async () => {
    const { pool, executed } = makePool();
    await migration.up(pool);
    const subClose = findExec(executed, /UPDATE crm_user_subscriptions SET status = 'closed'/i);
    const entClose = findExec(executed, /UPDATE crm_user_entitlements SET status = 'closed'/i);
    expect(subClose).toBeDefined();
    expect(entClose).toBeDefined();
    for (const e of [subClose!, entClose!]) {
      expect(e.sql).toContain("status = 'active'");
      // 占位符数量与参数一一对应，参数即全量旧 code
      expect((e.sql.match(/\?/g) || []).length).toBe(LEGACY_PLAN_CODES.length);
      expect(e.params).toEqual(LEGACY_PLAN_CODES);
    }
  });

  it("失去活跃订阅的 VIP 用户降级 free（与每日兜底任务同口径）", async () => {
    const { pool, executed } = makePool();
    await migration.up(pool);
    const demote = findExec(executed, /UPDATE crm_users/i);
    expect(demote).toBeDefined();
    expect(demote!.sql).toMatch(/membership_tier = 'free'/i);
    expect(demote!.sql).toContain("NOT EXISTS");
    expect(demote!.sql).toContain("crm_user_subscriptions");
    expect(demote!.sql).toContain("expires_at > NOW()");
  });

  it("旧套餐行无条件物理删除（全量作废，无引用守卫，参数含悬挂 code）", async () => {
    const { pool, executed } = makePool();
    await migration.up(pool);
    const del = findExec(executed, /DELETE FROM crm_membership_plans/i);
    expect(del).toBeDefined();
    expect(del!.sql).not.toContain("NOT EXISTS");
    expect((del!.sql.match(/\?/g) || []).length).toBe(LEGACY_PLAN_CODES.length);
    expect(del!.params).toEqual(LEGACY_PLAN_CODES);
  });

  it("free 行改造为免费注册体验档", async () => {
    const { pool, executed } = makePool();
    await migration.up(pool);
    const free = findExec(executed, /免费注册体验/);
    expect(free).toBeDefined();
    expect(free!.sql).toContain("WHERE plan_code = 'free'");
    expect(free!.sql).toContain("benefit_rank = 0");
  });

  it("新 4 档上架 INSERT IGNORE", async () => {
    const { pool, executed } = makePool();
    await migration.up(pool);
    const ins = findExec(executed, /INSERT IGNORE INTO crm_membership_plans/);
    expect(ins).toBeDefined();
    expect(ins!.sql).toContain("personal_pro_1299");
    expect(ins!.sql).toContain("enterprise_8800");
    for (const code of ["personal_trial_129", "personal_std_999", "personal_pro_1299", "enterprise_8800"]) {
      expect(ins!.sql).toContain(code);
    }
  });

  it("幂等：up() 可重复执行，不抛错且发送相同语句集", async () => {
    const { pool, executed } = makePool();
    await expect(migration.up(pool)).resolves.not.toThrow();
    const firstRun = [...executed];
    await expect(migration.up(pool)).resolves.not.toThrow();
    // 第二次应再发送同样数量（每步翻倍），证明无一次性/破坏性前置状态依赖
    expect(executed.length).toBe(firstRun.length * 2);
  });
});
