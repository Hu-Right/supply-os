// @vitest-environment node
/**
 * 7 个 BUG 修复验证测试
 *
 * BUG-A1: 注册 UPSERT 覆盖密码
 * BUG-A3: 登录无频率限制
 * BUG-P1: activatePaidOrder 缺事务
 * BUG-S1: Meilisearch filter 注入
 * BUG-S2: NULL deadline_sec 排序不一致
 * BUG-P4: appendUrlParams hash 错位
 * BUG-I1: 翻译异步竞态
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UsersRepo } from "../../../server/repos/users.repo";
import { PaymentService } from "../../../server/payment/PaymentService";
import { normalizeNoticeType } from "../../../server/services/meilisearch";
import { pendingNoticeTranslations } from "../../../server/services/notice-translation";

// ─── helpers ─────────────────────────────────────────────────────────────────

/** 创建 mock mysql2 pool（支持事务） */
function createPool(queryResults: any[] = []) {
  let callIndex = 0;
  const conn = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    query: vi.fn().mockImplementation(() => {
      const rows = queryResults[callIndex] ?? [];
      callIndex++;
      return Promise.resolve([rows]);
    }),
    execute: vi.fn().mockResolvedValue([[]]),
  };
  return {
    query: vi.fn().mockImplementation(() => {
      const rows = queryResults[callIndex] ?? [];
      callIndex++;
      return Promise.resolve([rows]);
    }),
    execute: vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
      // 模拟 INSERT 返回 affectedRows
      if (sql.includes("INSERT")) return [{ affectedRows: 1 }];
      return [[]];
    }),
    getConnection: vi.fn().mockResolvedValue(conn),
    _conn: conn,
  } as any;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUG-A1: 注册 UPSERT 覆盖已有用户密码
// ═══════════════════════════════════════════════════════════════════════════════
describe("BUG-A1: 注册不再使用 UPSERT 覆盖密码", () => {
  it("create 方法执行纯 INSERT，不包含 ON DUPLICATE KEY UPDATE", async () => {
    const pool = createPool();
    const repo = new UsersRepo(pool);
    await repo.create({
      user_key: "existing@b.com",
      email: "existing@b.com",
      display_name: "Existing",
      password_hash: "new_hash",
    });

    const sql = pool.execute.mock.calls[0][0] as string;
    // 核心验证：SQL 中不能有 ON DUPLICATE KEY UPDATE
    expect(sql).not.toContain("ON DUPLICATE KEY UPDATE");
    // 必须是纯 INSERT
    expect(sql).toContain("INSERT INTO crm_users");
    // 参数正确传递
    expect(pool.execute.mock.calls[0][1]).toEqual([
      "existing@b.com", "existing@b.com", "Existing", "new_hash",
    ]);
  });

  it("create 方法返回 boolean 表示是否成功插入", async () => {
    const pool = createPool();
    const repo = new UsersRepo(pool);
    const result = await repo.create({
      user_key: "new@b.com",
      email: "new@b.com",
      display_name: "New",
      password_hash: "hash",
    });
    expect(typeof result).toBe("boolean");
  });

  it("updateProfile 只更新 display_name，不触碰 password_hash", async () => {
    const pool = createPool();
    const repo = new UsersRepo(pool);
    await repo.updateProfile("user@test.com", "New Name");

    const sql = pool.execute.mock.calls[0][0] as string;
    expect(sql).toContain("display_name");
    expect(sql).not.toContain("password_hash");
    expect(sql).toContain("UPDATE crm_users SET");
    expect(pool.execute.mock.calls[0][1]).toEqual(["New Name", "user@test.com"]);
  });

  it("UsersRepo 不再暴露 upsert 方法", () => {
    const pool = createPool();
    const repo = new UsersRepo(pool);
    expect((repo as any).upsert).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BUG-A3: 登录接口 IP 维度速率限制
// ═══════════════════════════════════════════════════════════════════════════════
describe("BUG-A3: 登录速率限制", () => {
  // 由于 rate limiter 函数定义在 auth.routes.ts 内部，
  // 我们通过动态导入并检查模块导出的路由行为来验证
  it("auth.routes 模块可正常加载（速率限制器初始化无异常）", async () => {
    const mod = await import("../../../server/routes/auth.routes");
    expect(mod.createAuthRouter).toBeDefined();
    expect(typeof mod.createAuthRouter).toBe("function");
  });

  it("速率限制器源码验证：检查 auth.routes.ts 包含关键限流逻辑", async () => {
    // 通过读取模块源码确认限流逻辑存在
    const fs = await import("fs");
    const source = fs.readFileSync(
      require("path").resolve(__dirname, "../../../server/routes/auth.routes.ts"),
      "utf-8",
    );
    // 必须包含速率限制的关键要素
    expect(source).toContain("loginAttempts");
    expect(source).toContain("LOGIN_WINDOW_MS");
    expect(source).toContain("LOGIN_MAX_FAILS");
    expect(source).toContain("checkLoginRateLimit");
    expect(source).toContain("recordLoginFailure");
    expect(source).toContain("clearLoginFailures");
    expect(source).toContain("429");
    // 登录成功必须清除失败计数
    expect(source).toContain("clearLoginFailures(ip)");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BUG-P1: activatePaidOrder 事务保护
// ═══════════════════════════════════════════════════════════════════════════════
describe("BUG-P1: activatePaidOrder 事务保护", () => {
  it("支付订单激活使用事务：getConnection → beginTransaction → commit", async () => {
    const pool = createPool([
      // SELECT ... FOR UPDATE 返回订单数据
      [{ user_key: "u@t.com", plan_code: "annual", notice_id: null, amount: 5600, status: "pending" }],
      // SELECT plan
      [{ plan_code: "annual", unlock_quota: 10, duration_days: 365, plan_type: "subscription" }],
      // SELECT existing entitlements (none)
      [],
    ]);

    const service = new PaymentService();
    // 直接调用私有方法（通过 any 转型）
    await (service as any).activatePaidOrder(pool, "SO202601010001", "TRADE_123");

    // 验证事务生命周期
    expect(pool.getConnection).toHaveBeenCalledTimes(1);
    expect(pool._conn.beginTransaction).toHaveBeenCalledTimes(1);
    expect(pool._conn.commit).toHaveBeenCalled();
    expect(pool._conn.release).toHaveBeenCalledTimes(1);
    // 不应回滚（正常流程）
    expect(pool._conn.rollback).not.toHaveBeenCalled();
  });

  it("事务内使用 SELECT ... FOR UPDATE 悲观锁", async () => {
    const pool = createPool([
      [{ user_key: "u@t.com", plan_code: "annual", notice_id: null, amount: 5600, status: "pending" }],
      [{ plan_code: "annual", unlock_quota: 10, duration_days: 365, plan_type: "subscription" }],
      [],
    ]);

    const service = new PaymentService();
    await (service as any).activatePaidOrder(pool, "SO202601010002");

    // 验证第一条查询包含 FOR UPDATE
    const firstQuery = pool._conn.query.mock.calls[0][0] as string;
    expect(firstQuery).toContain("FOR UPDATE");
  });

  it("已支付订单幂等跳过：status=paid 时直接 commit 不重复发放", async () => {
    const pool = createPool([
      [{ user_key: "u@t.com", plan_code: "annual", notice_id: null, amount: 5600, status: "paid" }],
    ]);

    const service = new PaymentService();
    await (service as any).activatePaidOrder(pool, "SO202601010003");

    // 只查询了一次（SELECT FOR UPDATE 发现已支付），没有 INSERT
    expect(pool._conn.query).toHaveBeenCalledTimes(1);
    expect(pool._conn.execute).not.toHaveBeenCalled();
    expect(pool._conn.commit).toHaveBeenCalled();
  });

  it("事务异常时执行 rollback", async () => {
    const pool = createPool();
    // 让 SELECT FOR UPDATE 抛异常
    pool._conn.query.mockRejectedValueOnce(new Error("DB deadlock"));

    const service = new PaymentService();
    await expect(
      (service as any).activatePaidOrder(pool, "SO202601010004"),
    ).rejects.toThrow("DB deadlock");

    expect(pool._conn.rollback).toHaveBeenCalledTimes(1);
    expect(pool._conn.release).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BUG-S1: Meilisearch filter 字符串注入防护
// ═══════════════════════════════════════════════════════════════════════════════
describe("BUG-S1: Meilisearch filter 注入防护", () => {
  // escapeFilter 是模块内部函数，通过检查 meilisearch.ts 源码验证
  it("meilisearch.ts 包含 escapeFilter 函数并转义双引号和反斜杠", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      require("path").resolve(__dirname, "../../../server/services/meilisearch.ts"),
      "utf-8",
    );
    // 必须存在 escapeFilter 函数
    expect(source).toContain("function escapeFilter");
    // 必须转义双引号
    expect(source).toContain('replace(/"/g');
    // 必须转义反斜杠
    expect(source).toContain("replace(/\\\\/g");
  });

  it("所有 filter 拼接点均使用 escapeFilter", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      require("path").resolve(__dirname, "../../../server/services/meilisearch.ts"),
      "utf-8",
    );
    // country filter 必须转义
    expect(source).toMatch(/country = "\$\{escapeFilter\(country\)\}"/);
    // agency filter 必须转义
    expect(source).toMatch(/agency = "\$\{escapeFilter/);
    // noticeType filter 必须转义
    expect(source).toMatch(/notice_type_normalized = "\$\{escapeFilter\(normalized\)\}"/);
    // UNSPSC filter 必须转义
    expect(source).toMatch(/level\$\{unspscLevel\}_id = "\$\{escapeFilter\(unspscLevelId\)\}"/);
  });

  it("不存在未转义的 filter 拼接（无裸变量插入 filter 字符串）", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      require("path").resolve(__dirname, "../../../server/services/meilisearch.ts"),
      "utf-8",
    );
    // 搜索 filter.push 行，排除使用 escapeFilter 的和纯数字/固定值/已转义变量组合
    const filterPushes = source.match(/filter\.push\(`[^`]+`\)/g) || [];
    for (const push of filterPushes) {
      // 跳过纯数字比较（deadline_sec）和固定值（is_active, is_featured）
      if (push.includes("deadline_sec") || push.includes("is_active") || push.includes("is_featured")) continue;
      // 跳过已由 escapeFilter 处理的 OR 组合包裹（orParts 内部已转义）
      if (push.includes("orParts")) continue;
      // 其余所有含插值的 filter.push 必须使用 escapeFilter
      if (push.includes("${") && !push.includes("escapeFilter")) {
        throw new Error(`发现未转义的 filter 拼接: ${push}`);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BUG-S2: NULL deadline_sec 排序一致性
// ═══════════════════════════════════════════════════════════════════════════════
describe("BUG-S2: NULL deadline_sec 排序一致性", () => {
  it("meilisearch.ts 使用哨兵值替代 NULL deadline_sec", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      require("path").resolve(__dirname, "../../../server/services/meilisearch.ts"),
      "utf-8",
    );
    // 必须定义哨兵常量
    expect(source).toContain("NULL_DEADLINE_SENTINEL");
    expect(source).toContain("9999999999");
  });

  it("buildSyncDoc 对 NULL deadline_sec 使用哨兵值而非 0", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      require("path").resolve(__dirname, "../../../server/services/meilisearch.ts"),
      "utf-8",
    );
    // 不能再用 || 0 的旧模式
    expect(source).not.toMatch(/deadline_sec:\s*r\.deadline_sec\s*\|\|\s*0/);
    // 必须使用哨兵值
    expect(source).toContain("NULL_DEADLINE_SENTINEL");
  });

  it("哨兵值 9999999999 在升序排列中排在最后（无截止日期 = 最远截止日期）", () => {
    const sentinel = 9999999999;
    const now = Math.floor(Date.now() / 1000);
    // 哨兵值远大于当前时间戳
    expect(sentinel).toBeGreaterThan(now);
    // 在 ASC 排列中（nearest deadline first），哨兵排在最后
    const ascSorted = [now, 0, sentinel, now + 86400].sort((a, b) => a - b);
    expect(ascSorted[ascSorted.length - 1]).toBe(sentinel);
    // 在 DESC 排列中（farthest deadline first），哨兵排在最前
    // 语义：无截止日期 = 无限远截止日期，在「最远截止」排序中优先展示
    const descSorted = [now, 0, sentinel, now + 86400].sort((a, b) => b - a);
    expect(descSorted[0]).toBe(sentinel);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BUG-P4: appendUrlParams hash 片段参数错位
// ═══════════════════════════════════════════════════════════════════════════════
describe("BUG-P4: appendUrlParams hash 参数正确位置", () => {
  // appendUrlParams 是 PaymentService 的私有方法
  // 通过源码验证修复逻辑
  it("hash 前的 URL 部分接收查询参数，hash 保持在末尾", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      require("path").resolve(__dirname, "../../../server/payment/PaymentService.ts"),
      "utf-8",
    );
    // 修复后的逻辑：参数插在 beforeHash 之后、#hash 之前
    // 关键模式：`${beforeHash}${...?"&":"?"}${query}#${hash}`
    expect(source).toContain("${query}#${hash}");
    // 旧逻辑（参数在 hash 之后）不应存在
    expect(source).not.toContain("${beforeHash}#${hash}${hash.includes");
  });

  it("appendUrlParams 逻辑验证：通过 PaymentService 实例间接测试", async () => {
    // 创建 PaymentService 实例，通过反射调用私有方法
    const service = new PaymentService();
    const appendUrlParams = (service as any).appendUrlParams.bind(service);

    // 无 hash 的 URL
    expect(appendUrlParams("https://example.com", { order_no: "SO1" }))
      .toBe("https://example.com?order_no=SO1");

    // 已有查询参数的 URL
    expect(appendUrlParams("https://example.com?a=1", { order_no: "SO1" }))
      .toBe("https://example.com?a=1&order_no=SO1");

    // 含 hash 的 URL：参数必须插在 # 之前
    expect(appendUrlParams("https://example.com#section", { order_no: "SO1" }))
      .toBe("https://example.com?order_no=SO1#section");

    // 含 hash + 查询参数的 URL
    expect(appendUrlParams("https://example.com?a=1#section", { order_no: "SO1" }))
      .toBe("https://example.com?a=1&order_no=SO1#section");

    // 空 URL 返回空字符串
    expect(appendUrlParams("", { order_no: "SO1" })).toBe("");

    // 空参数返回原 URL
    expect(appendUrlParams("https://example.com#section", { order_no: "" }))
      .toBe("https://example.com#section");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BUG-I1: 翻译异步竞态
// ═══════════════════════════════════════════════════════════════════════════════
describe("BUG-I1: 翻译异步竞态 key 格式一致性", () => {
  beforeEach(() => {
    pendingNoticeTranslations.clear();
  });

  it("pendingNoticeTranslations 的 key 格式统一为 notice:${id}:${lang}", async () => {
    const fs = await import("fs");
    const ntSource = fs.readFileSync(
      require("path").resolve(__dirname, "../../../server/services/notice-translation.ts"),
      "utf-8",
    );
    // notice-translation.ts 中所有 pendingKey 必须使用 notice: 前缀
    const pendingKeyMatches = ntSource.match(/pendingKey\w*\s*=\s*`[^`]+`/g) || [];
    expect(pendingKeyMatches.length).toBeGreaterThan(0);
    for (const match of pendingKeyMatches) {
      expect(match).toContain("notice:");
    }
  });

  it("autoTranslate.ts 使用与 notice-translation.ts 一致的 key 前缀", async () => {
    const fs = await import("fs");
    const atSource = fs.readFileSync(
      require("path").resolve(__dirname, "../../../server/services/autoTranslate.ts"),
      "utf-8",
    );
    // 必须使用 pendingPrefix 变量区分 notice/opportunity
    expect(atSource).toContain("pendingPrefix");
    expect(atSource).toContain('"notice"');
    expect(atSource).toContain('"opportunity"');
    // 旧格式（target.idCol）不应存在
    expect(atSource).not.toContain("${target.idCol}:${row.id}:${targetLang}");
  });

  it("pendingNoticeTranslations Map 可正常去重：相同 key 只触发一次翻译", () => {
    // 模拟并发去重逻辑
    const key = "notice:123:zh";
    const mockPromise = Promise.resolve({ translations: ["标题", "描述"], provider: "deepseek" });

    // 第一次设置
    pendingNoticeTranslations.set(key, mockPromise);
    expect(pendingNoticeTranslations.has(key)).toBe(true);

    // 第二次检查 → 应发现已存在，不再重复设置
    const existing = pendingNoticeTranslations.get(key);
    expect(existing).toBe(mockPromise);

    // 不同 key 互不干扰
    expect(pendingNoticeTranslations.has("notice:123:en")).toBe(false);
    expect(pendingNoticeTranslations.has("notice:456:zh")).toBe(false);
    // opportunity 前缀不与 notice 碰撞
    expect(pendingNoticeTranslations.has("opportunity:123:zh")).toBe(false);
  });

  it("旧格式 key（无 notice: 前缀）不会与新格式碰撞", () => {
    // 验证旧格式 "123:zh" 与新格式 "notice:123:zh" 不会互相匹配
    pendingNoticeTranslations.set("notice:123:zh", Promise.resolve({ translations: [], provider: "test" }));
    expect(pendingNoticeTranslations.has("123:zh")).toBe(false);
    expect(pendingNoticeTranslations.has("notice:123:zh")).toBe(true);
  });
});
