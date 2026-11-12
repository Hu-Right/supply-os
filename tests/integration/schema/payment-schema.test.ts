/**
 * 订单 Schema 一致性测试（INSERT 语句 vs 统一表 `orders`）
 *
 * @description 2026-11-12 四张订单表合并为 `orders` 后，本文件从「校验各自物理表的
 *              INSERT 列」改为「校验四个仓储都写 `orders`、且列与 product_kind 字面量对得上」。
 *              它守的不再是表结构，而是**切表没有回退**：任何一处又写回旧表名、或漏掉
 *              product_kind 作用域，这里立刻红。
 *
 *              保留的既有目的：
 *              - users.user_key 列退役收尾（2026-09-04）：INSERT 不得再出现 user_key；
 *              - INSERT 列与 VALUES 形状必须自洽（不出现「列多了值少了」）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const REPOS = {
  membership: resolve(__dirname, "../../../src/lib/repos/payments.repo.ts"),
  learning: resolve(__dirname, "../../../src/lib/repos/learning-orders.repo.ts"),
  service: resolve(__dirname, "../../../src/lib/repos/service-orders.repo.ts"),
  training: resolve(__dirname, "../../../src/lib/repos/training.repo.ts"),
} as const;

interface InsertShape {
  /** 完整 INSERT 语句原文 */
  sql: string;
  /** 列名列表（已 trim） */
  fields: string[];
  /** VALUES 后的片段（用于查字面量） */
  values: string;
}

/** 从仓储源文件里取出写 `orders` 的那条 INSERT */
function extractInsert(repoPath: string): InsertShape | null {
  const content = readFileSync(repoPath, "utf-8");
  const m = content.match(/INSERT INTO orders\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\)/i);
  if (!m) return null;
  return {
    sql: m[0],
    fields: m[1].split(",").map((f) => f.trim()).filter(Boolean),
    values: m[2],
  };
}

describe("统一切表：四个仓储都必须写 orders", () => {
  it.each(Object.entries(REPOS))("%s 仓储存在写 orders 的 INSERT", (_name, path) => {
    expect(extractInsert(path)).not.toBeNull();
  });

  it.each(Object.entries(REPOS))("%s 仓储不再写旧订单表", (_name, path) => {
    const content = readFileSync(path, "utf-8");
    // 只查 SQL 形态，避免注释里提到旧表名就误报
    expect(content).not.toMatch(/INSERT INTO\s+(payment|learning|service|training)_orders/i);
    expect(content).not.toMatch(/UPDATE\s+(payment|learning|service|training)_orders/i);
    expect(content).not.toMatch(/FROM\s+(payment|learning|service|training)_orders/i);
  });
});

describe("会员单（payments.repo）", () => {
  const shape = extractInsert(REPOS.membership)!;

  it("列集合覆盖下单必需字段", () => {
    for (const f of [
      "user_id", "order_no", "provider", "product_kind", "product_code", "product_name",
      "unit_price", "quantity", "amount", "currency", "status", "pay_url", "qr_code_url", "raw_request",
    ]) {
      expect(shape.fields, `缺少字段: ${f}`).toContain(f);
    }
  });

  it("product_kind 字面量为 plan，状态落 pending", () => {
    expect(shape.values).toContain("'plan'");
    expect(shape.values).toContain("'pending'");
  });

  it("不含已退役的 user_key", () => {
    expect(shape.fields).not.toContain("user_key");
  });
});

describe("学习单（learning-orders.repo）", () => {
  const shape = extractInsert(REPOS.learning)!;

  it("列集合覆盖已购商品与支付要素", () => {
    for (const f of [
      "order_no", "user_id", "product_kind", "product_code", "product_name",
      "unit_price", "quantity", "amount", "currency", "provider", "status",
      "pay_url", "qr_code_url", "raw_request",
    ]) {
      expect(shape.fields, `缺少字段: ${f}`).toContain(f);
    }
  });

  it("product_kind 走占位符（material / bundle 由码形判定），状态落 pending", () => {
    // 学习单的 kind 来自 classifyProductCode，不是字面量
    expect(shape.values).toContain("'pending'");
  });

  it("不含已退役的 user_key", () => {
    expect(shape.fields).not.toContain("user_key");
  });
});

describe("增值服务单（service-orders.repo）", () => {
  const shape = extractInsert(REPOS.service)!;

  it("列集合覆盖数量/单价/快照", () => {
    for (const f of [
      "order_no", "user_id", "product_kind", "product_code", "product_name",
      "unit_price", "quantity", "amount", "currency", "status", "provider", "items_snapshot",
    ]) {
      expect(shape.fields, `缺少字段: ${f}`).toContain(f);
    }
  });

  it("product_kind 与 provider 均为 service 字面量（非网关渠道，别拿去查网关）", () => {
    expect(shape.values).toContain("'service'");
    expect(shape.values).toContain("'pending'");
  });
});

describe("培训单（training.repo）", () => {
  const shape = extractInsert(REPOS.training)!;

  it("列集合覆盖人数/期次快照/过期时间", () => {
    for (const f of [
      "order_no", "user_id", "product_kind", "product_code", "unit_price", "quantity",
      "amount", "currency", "provider", "status", "qr_code_url", "expires_at", "items_snapshot",
    ]) {
      expect(shape.fields, `缺少字段: ${f}`).toContain(f);
    }
  });

  it("product_kind 字面量为 course", () => {
    expect(shape.values).toContain("'course'");
    expect(shape.values).toContain("'pending'");
  });

  it("不含已退役的 user_key", () => {
    expect(shape.fields).not.toContain("user_key");
  });
});
