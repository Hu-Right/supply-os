/**
 * 迁移 090 membership-plans-v2 结构契约测试
 *
 * @description 用 mock Pool 断言 090 的 SQL 编排符合 V2 切换设计：
 *              新增 benefit_rank 列、补插悬挂兼容行、旧套餐下架赋 rank、
 *              带引用守卫的物理删除、free 行改造、新 4 档上架；
 *              并验证 up() 可重复执行（幂等：仅重复发送相同幂等 SQL，不抛错）。
 *              真实库效果已在生产切换窗口实测（在售仅剩 5 档）。
 */
import { describe, it, expect, vi } from "vitest";
import { migration } from "@/lib/db/migrations/090-membership-plans-v2";

function makePool() {
  const executed: string[] = [];
  const queried: string[] = [];
  const pool = {
    // ensureColumn 的存在性探测：total=0 → 触发一次 ALTER ADD COLUMN
    query: vi.fn(async (sql: string) => {
      queried.push(sql);
      if (/INFORMATION_SCHEMA\.COLUMNS/i.test(sql)) return [[{ total: 0 }], []];
      return [[], []];
    }),
    execute: vi.fn(async (sql: string) => {
      executed.push(sql);
      return [{}, []];
    }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { pool: pool as any, executed, queried };
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

  it("补插悬挂历史 code 兼容行（trial_99_3/trial_3/s/manual_full_unlock）", async () => {
    const { pool, executed } = makePool();
    await migration.up(pool);
    const compat = executed.find((s) => /INSERT IGNORE/i.test(s) && /manual_full_unlock/.test(s));
    expect(compat).toBeDefined();
    for (const code of ["trial_99_3", "trial_3", "'s'", "manual_full_unlock"]) {
      expect(compat!).toContain(code);
    }
  });

  it("旧套餐下架并按映射赋 rank（CASE 覆盖 4/2/1 档）", async () => {
    const { pool, executed } = makePool();
    await migration.up(pool);
    const deact = executed.find((s) => /SET is_active = 0/i.test(s));
    expect(deact).toBeDefined();
    expect(deact).toContain("benefit_rank = CASE");
    expect(deact).toContain("THEN 4");
    expect(deact).toContain("THEN 2");
    expect(deact).toContain("THEN 1");
    // 新 4 档被排除在下架之外
    expect(deact).toContain("personal_trial_129");
  });

  it("物理删除带三重引用守卫（订阅/权益/订单任一存在即保留）", async () => {
    const { pool, executed } = makePool();
    await migration.up(pool);
    const del = executed.find((s) => /^\s*DELETE p FROM crm_membership_plans/i.test(s));
    expect(del).toBeDefined();
    expect(del).toContain("NOT EXISTS (SELECT 1 FROM crm_user_subscriptions");
    expect(del).toContain("NOT EXISTS (SELECT 1 FROM crm_user_entitlements");
    expect(del).toContain("NOT EXISTS (SELECT 1 FROM crm_payment_orders");
  });

  it("free 行改造为免费注册体验档", async () => {
    const { pool, executed } = makePool();
    await migration.up(pool);
    const free = executed.find((s) => /免费注册体验/.test(s) && /WHERE plan_code = 'free'/.test(s));
    expect(free).toBeDefined();
    expect(free).toContain("benefit_rank = 0");
  });

  it("新 4 档上架 INSERT IGNORE", async () => {
    const { pool, executed } = makePool();
    await migration.up(pool);
    const ins = executed.find(
      (s) => /INSERT IGNORE/i.test(s) && /personal_pro_1299/.test(s) && /enterprise_8800/.test(s),
    );
    expect(ins).toBeDefined();
    for (const code of ["personal_trial_129", "personal_std_999", "personal_pro_1299", "enterprise_8800"]) {
      expect(ins!).toContain(code);
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
