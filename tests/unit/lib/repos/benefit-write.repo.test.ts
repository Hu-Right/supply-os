/**
 * BenefitWriteRepo 写层单测
 *
 * 钉住四类不变式：
 * 1. 订阅事实的准入守卫（无订单号 / 负金额 / free 档一律拒写，且是发 SQL 之前就拒）；
 * 2. 额度池幂等：重复发放只抬额度、绝不洗掉已用量；-1 不限池绝不写 quota_used（否则撞库内 chk_usage）；
 * 3. 锁池查询不得按 status 过滤——只捞 active 会让耗尽的池"消失"，调用方随即误开新池等于凭空发额度；
 * 4. 写路径 SQL 一旦出现旧三表名即判失败（防"双写/兼容层"回流）。
 */
import { describe, it, expect } from "vitest";
import { BenefitWriteRepo, type Db, type LockedPoolRow } from "@/lib/repos/benefit-write.repo";
import type { BenefitSystemRepo } from "@/lib/repos/benefit-system.repo";

const norm = (s: unknown) => String(s).replace(/\s+/g, " ").trim();

function makeDb(opts: { rows?: unknown[]; affectedRows?: number; insertId?: number } = {}) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const db = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql: norm(sql), params });
      return [opts.rows ?? [], []];
    },
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql: norm(sql), params });
      return [{ insertId: opts.insertId ?? 77, affectedRows: opts.affectedRows ?? 1 }, []];
    },
  };
  return { db: db as unknown as Db, calls };
}

/** 伪造连事务：query 返回指定行集，同时记录 SQL */
function makeConn(rows: unknown[] = []) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const conn = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql: norm(sql), params });
      return [rows, []];
    },
  };
  return { conn: conn as never, calls };
}

const pool = (over: Partial<LockedPoolRow> = {}): LockedPoolRow => ({
  id: 5,
  subscription_id: 9,
  seat_user_id: 42,
  benefit_code: "notice_view",
  quota_total: 10,
  quota_used: 3,
  status: "active",
  ...over,
});

describe("insertSubscription · 订阅事实准入守卫", () => {
  const base = {
    ownerUserId: 42,
    planCode: "business",
    sourceOrderNo: "ALI-20260922-0001",
    pricePaid: 8800,
    seatLimit: 3,
    expiresAt: null,
  };

  it("列清单完整：订单号、实付、席位快照全部落列", async () => {
    const repo = new BenefitWriteRepo();
    const { db, calls } = makeDb({ insertId: 101 });
    const id = await repo.insertSubscription(db, { ...base, expiresAt: new Date(1800000000000) });

    expect(id).toBe(101);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain("INSERT INTO crm_plan_subscriptions");
    for (const col of [
      "owner_user_id",
      "plan_code",
      "source_order_no",
      "price_paid",
      "currency",
      "seat_limit",
      "expires_at",
    ]) {
      expect(calls[0].sql).toContain(col);
    }
    expect(calls[0].params).toEqual([42, "business", "ALI-20260922-0001", 8800, "CNY", 3, new Date(1800000000000)]);
  });

  it("无期限订阅传 NULL 而不是伪造远期时间", async () => {
    const repo = new BenefitWriteRepo();
    const { db, calls } = makeDb();
    await repo.insertSubscription(db, base);
    expect(calls[0].params[6]).toBeNull();
  });

  it("三条守卫都在发出 SQL 之前拦住（空订单号 / 负金额 / free 档）", async () => {
    const repo = new BenefitWriteRepo();
    for (const bad of [
      { ...base, sourceOrderNo: "   " },
      { ...base, pricePaid: -1 },
      { ...base, pricePaid: Number.NaN },
      { ...base, planCode: "free" },
    ]) {
      const { db, calls } = makeDb();
      await expect(repo.insertSubscription(db, bad as typeof base)).rejects.toThrow(/拒绝/);
      expect(calls).toHaveLength(0);
    }
  });
});

describe("openQuotaPool · 幂等发放", () => {
  it("撞 uk_pool 只把额度抬到不低于现值，且绝不改 quota_used", async () => {
    const repo = new BenefitWriteRepo();
    const { db, calls } = makeDb();
    await repo.openQuotaPool(db, {
      subscriptionId: 9,
      seatUserId: 42,
      benefitCode: "notice_view",
      quotaTotal: 100,
    });

    const sql = calls[0].sql;
    expect(sql).toContain("ON DUPLICATE KEY UPDATE");
    expect(sql).toContain("GREATEST(quota_total, ?)");
    expect(sql).not.toContain("quota_used =");
    // 同一个额度值绑定三次：插入位 + IF 比较位 + GREATEST 比较位（不用 VALUES() 以避开 8.0.20 弃用写法）
    expect(calls[0].params.filter((p) => p === 100)).toHaveLength(3);
    expect(sql).not.toContain("VALUES(");
  });

  it("普通用户池用 NULL 表达，不用 0 伪装", async () => {
    const repo = new BenefitWriteRepo();
    const { db, calls } = makeDb();
    await repo.openQuotaPool(db, {
      subscriptionId: null,
      seatUserId: 42,
      benefitCode: "notice_view",
      quotaTotal: 0,
    });
    expect(calls[0].params[0]).toBeNull();
  });
});

describe("grantQuotaPoolsForPlan · 按矩阵发池", () => {
  const catalogWith = (defs: unknown[], cells: unknown[]) =>
    ({
      listBenefits: async () => defs,
      loadCells: async () => cells,
    }) as unknown as BenefitSystemRepo;

  const quotaDef = (code: string, consumable: number, kind = "quota") => ({
    benefit_code: code,
    value_kind: kind,
    is_consumable: consumable,
  });

  it("只发 is_consumable=1 的额度类权益；-1 与 0 都落显式行", async () => {
    const repo = new BenefitWriteRepo();
    const { db, calls } = makeDb();
    const res = await repo.grantQuotaPoolsForPlan(
      db,
      catalogWith(
        [quotaDef("notice_view", 1), quotaDef("ai_match", 0), quotaDef("tech_support", 1)],
        [
          { plan_code: "unlimited", benefit_code: "notice_view", value_num: -1 },
          { plan_code: "unlimited", benefit_code: "tech_support", value_num: 0 },
        ],
      ),
      { planCode: "unlimited", subscriptionId: 9, seatUserId: 42 },
    );

    expect(res.granted).toEqual(["notice_view", "tech_support"]);
    expect(res.anomalies).toEqual([]);
    expect(calls).toHaveLength(2);
    expect(calls[0].params).toContain(-1);
    expect(calls[1].params).toContain(0); // 0 是"明确无额度"的显式账，照常建行
    expect(calls.every((c) => c.sql.includes("crm_benefit_quotas"))).toBe(true);
  });

  it("配置异常必须浮出水面而不是静默跳过", async () => {
    const repo = new BenefitWriteRepo();
    const { db, calls } = makeDb();
    const res = await repo.grantQuotaPoolsForPlan(
      db,
      catalogWith(
        [quotaDef("weird", 1, "bool"), quotaDef("missing", 1), quotaDef("nullnum", 1)],
        [
          // weird 可消耗但非额度类；nullnum 格子存在但 value_num 为 null；missing 无格子
          { plan_code: "pro", benefit_code: "nullnum", value_num: null },
          { plan_code: "pro", benefit_code: "unrelated", value_num: 5 },
        ],
      ),
      { planCode: "pro", subscriptionId: 9, seatUserId: 42 },
    );

    expect(res.granted).toEqual([]);
    expect(res.anomalies).toHaveLength(3);
    expect(res.anomalies[0]).toContain("value_kind=bool");
    expect(res.anomalies.some((a) => a.includes("矩阵缺格"))).toBe(true);
    expect(res.anomalies.some((a) => a.includes("value_num 非数值"))).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe("findAndLockCurrentPool / consumeLockedPool · 扣减持复", () => {
  it("锁当前周期行：NULL 安全比较 + FOR UPDATE，且不过滤状态", async () => {
    const repo = new BenefitWriteRepo();
    const { conn, calls } = makeConn([
      {
        id: 5,
        subscription_id: null,
        seat_user_id: 42,
        benefit_code: "notice_view",
        quota_total: 0,
        quota_used: 0,
        status: "exhausted",
      },
    ]);
    const locked = await repo.findAndLockCurrentPool(conn, {
      seatUserId: 42,
      benefitCode: "notice_view",
      subscriptionId: null,
    });

    const sql = calls[0].sql;
    expect(sql).toContain("subscription_id <=> ?");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("ORDER BY period_starts_at DESC");
    // 关键：一旦出现 status 过滤，耗尽的池会查不到 → 调用方误开新池 = 凭空发额度
    expect(sql).not.toMatch(/WHERE.*status\s*=/);
    expect(locked).toMatchObject({ id: 5, status: "exhausted", subscription_id: null });
  });

  it("不限池（-1）直接放行且一行不写", async () => {
    const repo = new BenefitWriteRepo();
    const { db, calls } = makeDb();
    expect(await repo.consumeLockedPool(db, pool({ quota_total: -1, quota_used: 0 }))).toBe("unlimited");
    expect(calls).toHaveLength(0);
  });

  it("非 active 池不扣（exhausted / frozen 一律拒），且不发 SQL", async () => {
    const repo = new BenefitWriteRepo();
    for (const st of ["exhausted", "frozen", "expired"] as const) {
      const { db, calls } = makeDb();
      expect(await repo.consumeLockedPool(db, pool({ status: st }))).toBe("denied");
      expect(calls).toHaveLength(0);
    }
  });

  it("扣减条件带余量复核，耗尽判定用自增后的新值（MySQL SET 从左到右求值）", async () => {
    const repo = new BenefitWriteRepo();
    const { db, calls } = makeDb();
    expect(await repo.consumeLockedPool(db, pool())).toBe("consumed");

    const sql = calls[0].sql;
    expect(sql).toContain("quota_used = quota_used + 1");
    // 写成 quota_used + 1 >= quota_total 会提前一格误标 exhausted
    expect(sql).toContain("IF(quota_used >= quota_total, 'exhausted', status)");
    expect(sql).not.toContain("quota_used + 1 >=");
    // -1 行不可能走到这里，WHERE 仍须排除，防未来有人直接拿 id 调
    expect(sql).toContain("quota_total > 0");
    expect(sql).toContain("quota_used < quota_total");
    expect(sql).toContain("status = 'active'");
  });

  it("并发被抢：affectedRows=0 判 denied 而不是乐观当作成功", async () => {
    const repo = new BenefitWriteRepo();
    const { db } = makeDb({ affectedRows: 0 });
    expect(await repo.consumeLockedPool(db, pool())).toBe("denied");
  });
});

describe("expireOverdueSubscriptions / freezePoolsOfSubscription · 到期与冻结", () => {
  it("先查 id 再按同一批 id 冻结池、置 expired（两步 WHERE 会漏掉并发新行）", async () => {
    const repo = new BenefitWriteRepo();
    const { db, calls } = makeDb({ rows: [{ id: 3 }, { id: 8 }] });
    expect(await repo.expireOverdueSubscriptions(db)).toEqual([3, 8]);

    expect(calls).toHaveLength(3);
    expect(calls[0].sql).toContain("SELECT id FROM crm_plan_subscriptions");
    expect(calls[1].sql).toContain("UPDATE crm_benefit_quotas");
    expect(calls[1].sql).toContain("status = 'frozen'");
    expect(calls[2].sql).toContain("status = 'expired'");
    expect(calls[1].params).toEqual([3, 8]);
    expect(calls[2].params).toEqual([3, 8]);
  });

  it("无到期订阅时一条 UPDATE 都不发", async () => {
    const repo = new BenefitWriteRepo();
    const { db, calls } = makeDb({ rows: [] });
    expect(await repo.expireOverdueSubscriptions(db)).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("冻结只动 active/exhausted，不覆盖 expired 历史行", async () => {
    const repo = new BenefitWriteRepo();
    const { db, calls } = makeDb();
    await repo.freezePoolsOfSubscription(db, 9);
    expect(calls[0].sql).toContain("status IN ('active', 'exhausted')");
    expect(calls[0].sql).toContain("WHERE subscription_id = ?");
  });
});

describe("ensureOwnerSeat · 席位不变式", () => {
  it("主账号占一行 is_owner=1 席位，撞唯一键只复活不新增", async () => {
    const repo = new BenefitWriteRepo();
    const { db, calls } = makeDb();
    await repo.ensureOwnerSeat(db, { subscriptionId: 9, ownerUserId: 42 });
    expect(calls[0].sql).toContain("INSERT INTO crm_subscription_seats");
    expect(calls[0].sql).toContain("is_owner, status");
    expect(calls[0].sql).toContain("ON DUPLICATE KEY UPDATE status = 'active', removed_at = NULL");
    expect(calls[0].params).toEqual([9, 42]);
  });
});

/** 伪造连接池：带 getConnection，用于验证调用方未传事务时库内必须自开事务 */
function makePoolLike(opts: { rows?: unknown[]; failOn?: RegExp } = {}) {
  const connCalls: string[] = [];
  const poolCalls: string[] = [];
  const conn = {
    query: async (sql: string) => {
      connCalls.push(norm(sql));
      return [opts.rows ?? [], []];
    },
    execute: async (sql: string) => {
      const s = norm(sql);
      connCalls.push(s);
      if (opts.failOn?.test(s)) throw new Error("模拟到期更新失败");
      return [{ insertId: 1, affectedRows: 1 }, []];
    },
    // 事务 API：实现库类代码真的会调的那几个方法，而不是只记 SQL
    beginTransaction: async () => void connCalls.push("START TRANSACTION"),
    commit: async () => void connCalls.push("COMMIT"),
    rollback: async () => void connCalls.push("ROLLBACK"),
    release: () => undefined,
  };
  const pool = {
    query: async (sql: string) => {
      poolCalls.push(norm(sql));
      return [opts.rows ?? [], []];
    },
    execute: async (sql: string) => {
      poolCalls.push(norm(sql));
      return [{ insertId: 1, affectedRows: 1 }, []];
    },
    getConnection: async () => conn,
  };
  return { pool: pool as unknown as Db, conn, connCalls, poolCalls };
}

describe("expireOverdueSubscriptions · 事务边界（缺陷 1 复现）", () => {
  it("传入 Pool 时必须自开事务并在同一连接上跑完三步，不得逐条自提交", async () => {
    const repo = new BenefitWriteRepo();
    const { pool, connCalls, poolCalls } = makePoolLike({ rows: [{ id: 3 }, { id: 8 }] });
    await repo.expireOverdueSubscriptions(pool);

    // 任何写语句都不允许走 pool 直连（那等于三条独立自提交）
    expect(poolCalls.filter((s) => /UPDATE|DELETE|INSERT/i.test(s))).toEqual([]);
    const joined = connCalls.join(" ; ");
    expect(joined).toMatch(/START TRANSACTION|BEGIN/);
    expect(joined).toMatch(/COMMIT/);
    expect(connCalls.filter((s) => /UPDATE crm_benefit_quotas/.test(s))).toHaveLength(1);
    expect(connCalls.filter((s) => /UPDATE crm_plan_subscriptions/.test(s))).toHaveLength(1);
    // 顺序：开事务 → 查 id → 冻池 → 置 expired → 提交
    expect(connCalls.findIndex((s) => /UPDATE crm_benefit_quotas/.test(s))).toBeLessThan(
      connCalls.findIndex((s) => /UPDATE crm_plan_subscriptions/.test(s)),
    );
    expect(connCalls.some((s) => /RELEASE|ROLLBACK/.test(s))).toBe(false);
    // 自开的事务必须把连接归还连接池
  });

  it("传入事务连接时不得自行 BEGIN/COMMIT（事务归调用方）", async () => {
    const repo = new BenefitWriteRepo();
    const { db, calls } = makeDb({ rows: [{ id: 3 }] });
    await repo.expireOverdueSubscriptions(db);
    const joined = calls.map((c) => c.sql).join(" ; ");
    expect(joined).not.toMatch(/START TRANSACTION|BEGIN|COMMIT|ROLLBACK/);
  });

  it("中途报错必须回滚并抛出，不能留下「池已冻、订阅仍 active」的半状态", async () => {
    const repo = new BenefitWriteRepo();
    // 冻池成功、下一条置 expired 失败
    const { pool, connCalls } = makePoolLike({ rows: [{ id: 3 }], failOn: /UPDATE crm_plan_subscriptions/ });
    await expect(repo.expireOverdueSubscriptions(pool)).rejects.toThrow("模拟到期更新失败");
    expect(connCalls.some((s) => /ROLLBACK/.test(s))).toBe(true);
    expect(connCalls.some((s) => /COMMIT/.test(s))).toBe(false);
  });
});

describe("openQuotaPool · 不限额度的抬额语义（缺陷 2 复现）", () => {
  it("重发为不限时，GREATEST 不得把 -1 判成比 100 小而丢弃不限", async () => {
    const repo = new BenefitWriteRepo();
    const { db, calls } = makeDb();
    await repo.openQuotaPool(db, {
      subscriptionId: 9,
      seatUserId: 42,
      benefitCode: "notice_view",
      quotaTotal: -1,
    });
    const sql = calls[0].sql;
    // 必须显式优先处理 -1（两侧任一为 -1 结果就是 -1）
    expect(sql).toMatch(/IF\(\? = -1 OR quota_total = -1, -1, GREATEST\(quota_total, \?\)\)/);
    // 额度值共绑定 3 次：插入位 + IF 比较位 + GREATEST 比较位
    expect(calls[0].params.filter((p) => p === -1)).toHaveLength(3);
  });

  it("正数额度仍不得降级现有额度", async () => {
    const repo = new BenefitWriteRepo();
    const { db, calls } = makeDb();
    await repo.openQuotaPool(db, { subscriptionId: 9, seatUserId: 42, benefitCode: "notice_view", quotaTotal: 50 });
    expect(calls[0].sql).toContain("GREATEST(quota_total, ?)");
  });
});

describe("insertSubscription · 套餐码守卫（缺陷 5 复现）", () => {
  it("空或纯空格 plan_code 在发 SQL 前就被拒，而不是依赖外键报错", async () => {
    const repo = new BenefitWriteRepo();
    for (const bad of ["", "   "]) {
      const { db, calls } = makeDb();
      await expect(
        repo.insertSubscription(db, {
          ownerUserId: 42,
          planCode: bad,
          sourceOrderNo: "ORD-1",
          pricePaid: 129,
          seatLimit: 1,
          expiresAt: null,
        }),
      ).rejects.toThrow(/拒绝/);
      expect(calls).toHaveLength(0);
    }
  });
});

describe("refundSubscription · 退款原子性（缺陷 6 复现）", () => {
  it("传入 Pool 时必须自开事务，且先冻池再置 refunded", async () => {
    const repo = new BenefitWriteRepo();
    const { pool, connCalls, poolCalls } = makePoolLike();
    const r = await repo.refundSubscription(pool, 9);

    expect(r.frozenPools).toBe(1);
    // 写语句不得走 pool 直连（否则两步各自提交，存在退完款还能扣的窗口）
    expect(poolCalls.filter((s) => /UPDATE/i.test(s))).toEqual([]);
    const iFreeze = connCalls.findIndex((s) => /UPDATE crm_benefit_quotas/.test(s));
    const iRefund = connCalls.findIndex((s) => /UPDATE crm_plan_subscriptions.*refunded/.test(s));
    expect(iFreeze).toBeGreaterThanOrEqual(0);
    expect(iRefund).toBeGreaterThanOrEqual(0);
    expect(iFreeze).toBeLessThan(iRefund);
    expect(connCalls[0]).toMatch(/START TRANSACTION|BEGIN/);
    expect(connCalls[connCalls.length - 1]).toMatch(/COMMIT/);
  });

  it("传入连接时并入调用方事务：不发 BEGIN/COMMIT，只发两条 UPDATE", async () => {
    const repo = new BenefitWriteRepo();
    const { conn, connCalls } = makePoolLike();
    await repo.refundSubscription(conn as unknown as Db, 9);

    expect(connCalls).toHaveLength(2);
    expect(connCalls[0]).toContain("status IN ('active', 'exhausted')");
    expect(connCalls[1]).toContain("status = 'refunded'");
    expect(connCalls.join(" ")).not.toMatch(/BEGIN|START TRANSACTION|COMMIT|ROLLBACK/);
  });
});

describe("反向守门 · 写路径不得触碰旧三表", () => {
  it("跑遍全部写入方法，SQL 里不出现 crm_user_subscriptions / crm_user_entitlements / crm_membership_plans", async () => {
    const repo = new BenefitWriteRepo();
    const { db, calls } = makeDb({ rows: [{ id: 1 }] });
    const sub = {
      ownerUserId: 42,
      planCode: "starter",
      sourceOrderNo: "ORD-1",
      pricePaid: 129,
      seatLimit: 1,
      expiresAt: null,
    };

    await repo.insertSubscription(db, sub);
    await repo.ensureOwnerSeat(db, { subscriptionId: 1, ownerUserId: 42 });
    await repo.openQuotaPool(db, { subscriptionId: 1, seatUserId: 42, benefitCode: "notice_view", quotaTotal: 10 });
    await repo.grantQuotaPoolsForPlan(
      db,
      { listBenefits: async () => [], loadCells: async () => [] } as unknown as BenefitSystemRepo,
      { planCode: "starter", subscriptionId: 1, seatUserId: 42 },
    );
    await repo.consumeLockedPool(db, pool({ id: 1 }));
    await repo.freezePoolsOfSubscription(db, 1);
    await repo.linkReplacedSubscription(db, { oldSubscriptionId: 1, newSubscriptionId: 2 });
    await repo.refundSubscription(db, 1);
    await repo.expireOverdueSubscriptions(db);

    expect(calls.length).toBeGreaterThan(8);
    for (const legacy of ["crm_user_subscriptions", "crm_user_entitlements", "crm_membership_plans"]) {
      expect(calls.filter((c) => c.sql.includes(legacy))).toEqual([]);
    }
    // 且只写这三张表
    const targets = new Set(
      calls
        .map((c) => (c.sql.match(/(?:INTO|UPDATE|FROM) (crm_[a-z_]+)/) || [])[1])
        .filter(Boolean) as string[],
    );
    expect([...targets].sort()).toEqual([
      "crm_benefit_quotas",
      "crm_plan_subscriptions",
      "crm_subscription_seats",
    ]);
  });
});
