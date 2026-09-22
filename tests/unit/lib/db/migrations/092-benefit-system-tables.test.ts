/**
 * 迁移 092 benefit-system-tables 结构契约测试
 *
 * @description 阶段一（旁路建表）契约：
 *              1) 8 张表按外键依赖顺序建齐，全部 CREATE TABLE IF NOT EXISTS（幂等可重跑）；
 *              2) 绝不触碰旧三表（crm_membership_plans/crm_user_subscriptions/crm_user_entitlements）；
 *              3) 关键结构语义在 DDL 中固化：矩阵三值列互斥 CHECK、不限=-1 显式口径、
 *                 订阅 source_order_no NOT NULL、额度池生成列、权益目录 requires_subscription；
 *              4) 每张表必须带 COMMENT 说明用途（命名正式化的配套要求，防"看名字猜不出用途"）；
 *              5) 末尾结构自检：缺表即抛错（防"半套"表组）。
 */
import { describe, it, expect, vi } from "vitest";
import { migration, BENEFIT_SYSTEM_TABLES } from "@/lib/db/migrations/092-benefit-system-tables";

function makePool(opts?: { missingTables?: string[] }) {
  const queries: string[] = [];
  const pool = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      if (/INFORMATION_SCHEMA\.TABLES/i.test(sql)) {
        const rows = BENEFIT_SYSTEM_TABLES.filter(
          (t) => !(opts?.missingTables ?? []).includes(t),
        ).map((t) => ({ t }));
        return [rows, []];
      }
      return [[], []];
    }),
    execute: vi.fn(async () => [{}, []]),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { pool: pool as any, queries };
}

const ddlOf = (queries: string[], table: string) =>
  queries.find((q) => new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, "i").test(q));

describe("migration 092 · benefit-system-tables", () => {
  it("元数据正确", () => {
    expect(migration.version).toBe(92);
    expect(migration.name).toBe("benefit-system-tables");
  });

  it("8 表按外键依赖顺序建齐，全部 IF NOT EXISTS", async () => {
    const { pool, queries } = makePool();
    await migration.up(pool);
    const createOrder = queries
      .map((q) => BENEFIT_SYSTEM_TABLES.find((t) => q.includes(`CREATE TABLE IF NOT EXISTS ${t}`)))
      .filter((t): t is (typeof BENEFIT_SYSTEM_TABLES)[number] => Boolean(t));
    expect(createOrder).toEqual([...BENEFIT_SYSTEM_TABLES]);
    // 依赖方向自检：目录表必须先于矩阵/订阅/额度
    expect(createOrder.indexOf("crm_benefit_catalog")).toBeLessThan(
      createOrder.indexOf("crm_plan_benefits"),
    );
    expect(createOrder.indexOf("crm_plan_subscriptions")).toBeLessThan(
      createOrder.indexOf("crm_benefit_quotas"),
    );
    expect(createOrder.indexOf("crm_service_catalog")).toBeLessThan(
      createOrder.indexOf("crm_service_orders"),
    );
  });

  it("命名正式：不带年份/代号后缀，且不使用临时影子名", async () => {
    const { pool, queries } = makePool();
    await migration.up(pool);
    for (const t of BENEFIT_SYSTEM_TABLES) {
      expect(t).not.toMatch(/neo|2026|__new|_v\d/i);
    }
    for (const q of queries) {
      expect(q).not.toMatch(/neo2026|__new/i);
    }
  });

  it("每张表都有 COMMENT 说明用途（首句为「XX表：」）", async () => {
    const { pool, queries } = makePool();
    await migration.up(pool);
    for (const t of BENEFIT_SYSTEM_TABLES) {
      const ddl = ddlOf(queries, t)!;
      const m = ddl.match(/COMMENT='([^']{10,})'/i);
      expect(m, `${t} 缺少表级 COMMENT`).not.toBeNull();
      expect(m![1]).toContain("表：");
    }
  });

  it("影子性质：全程不触碰旧三表（无 ALTER/UPDATE/RENAME 旧表语句）", async () => {
    const { pool, queries } = makePool();
    await migration.up(pool);
    const legacy = /crm_membership_plans|crm_user_subscriptions\b|crm_user_entitlements/;
    for (const q of queries) {
      expect(legacy.test(q)).toBe(false);
    }
  });

  it("不引入触发器/事件（与「冻结外部同步」切换策略不重叠）", async () => {
    const { pool, queries } = makePool();
    await migration.up(pool);
    for (const q of queries) {
      expect(q).not.toMatch(/CREATE TRIGGER|CREATE EVENT/i);
    }
  });

  it("关键结构语义固化在 DDL", async () => {
    const { pool, queries } = makePool();
    await migration.up(pool);

    const catalog = ddlOf(queries, "crm_benefit_catalog")!;
    expect(catalog).toContain("requires_subscription");
    expect(catalog).toContain("chk_enum_dict");

    const matrix = ddlOf(queries, "crm_plan_benefits")!;
    expect(matrix).toContain("uk_plan_benefit");
    expect(matrix).toMatch(/chk_one_value CHECK/i);
    expect(matrix).toContain(
      "(value_level IS NOT NULL) + (value_num IS NOT NULL) + (value_amount IS NOT NULL) = 1",
    );

    const subs = ddlOf(queries, "crm_plan_subscriptions")!;
    expect(subs).toMatch(/source_order_no VARCHAR\(80\)\s+NOT NULL/i);
    expect(subs).toContain("replaced_by_id");

    const quotas = ddlOf(queries, "crm_benefit_quotas")!;
    expect(quotas).toMatch(/subscription_id\s+BIGINT UNSIGNED NULL/i);
    expect(quotas).toMatch(/GENERATED ALWAYS AS \(IFNULL\(subscription_id, 0\)\) STORED/i);
    expect(quotas).toContain("uk_pool");

    const services = ddlOf(queries, "crm_service_catalog")!;
    expect(services).toMatch(/chk_grant_pair/i);
    expect(services).toMatch(/chk_grant_period/i);
    // 坑位回归：可空列比较式在 NULL 下为 UNKNOWN，CHECK 会放行——必须显式 IS NOT NULL
    expect(services).toMatch(
      /chk_price_by_mode CHECK \(price_mode IN \('token','project','quote','contact'\) OR \(standard_price IS NOT NULL AND standard_price > 0\)\)/i,
    );

    const plans = ddlOf(queries, "crm_plan_catalog")!;
    // 普通用户档（price=0）必须能存在：price_mode 需有 free 成员，且 CHECK 不得把 0 价限死在 contact
    expect(plans).toMatch(/price_mode\s+ENUM\('fixed','contact','free'\)/i);
    expect(plans).toMatch(/chk_price_mode CHECK \(price_mode <> 'fixed' OR price > 0\)/i);
    // 额度值 0 是合法语义（该档明确无额度），仅靠注释固化口径，不加 CHECK 以免锁死 -1/正数路径
    expect(plans).toContain("不承载权益内容");

    const orders = ddlOf(queries, "crm_service_orders")!;
    // 坑位回归：NOT NULL ENUM 无 DEFAULT 时隐式取首个枚举值，会静默把漏传当成合法状态
    expect(orders).toMatch(/status\s+VARCHAR\(20\)\s+NOT NULL/i);
    expect(orders).not.toMatch(/status\s+ENUM/i);
    expect(orders).toMatch(/chk_status_domain/i);
    expect(orders).toMatch(/chk_sale_mode_domain/i);

    // 全表统一排序规则（防 Illegal mix of collations）
    for (const t of BENEFIT_SYSTEM_TABLES) {
      expect(ddlOf(queries, t)).toContain("utf8mb4_0900_ai_ci");
    }
  });

  it("结构自检：缺表即抛错，不允许半套表组过关", async () => {
    const { pool } = makePool({ missingTables: ["crm_benefit_quotas"] });
    await expect(migration.up(pool)).rejects.toThrow(/权益表组不完整[\s\S]*crm_benefit_quotas/);
  });

  it("幂等：up() 可重复执行不抛错（IF NOT EXISTS + 自检通过）", async () => {
    const { pool } = makePool();
    await expect(migration.up(pool)).resolves.toBeUndefined();
    await expect(migration.up(pool)).resolves.toBeUndefined();
  });
});
