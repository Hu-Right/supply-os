/**
 * 支付相关数据库 Schema 验证测试
 *
 * @description 验证代码中的 SQL 语句与数据库表结构定义匹配。
 *              防止字段缺失、类型不匹配等迁移遗留问题。
 *              重点覆盖：learning_orders 表的 user_key 迁移兼容。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * 从 Repo 源文件中提取 INSERT 语句的字段列表
 */
function extractInsertFields(repoFilePath: string, tableName: string): string[] {
  const content = readFileSync(repoFilePath, "utf-8");
  // 匹配 INSERT INTO table_name (field1, field2, ...) 模式
  const regex = new RegExp(`INSERT INTO ${tableName}\\s*\\(([^)]+)\\)`, "i");
  const match = content.match(regex);
  if (!match) return [];
  return match[1].split(",").map((f) => f.trim());
}

/**
 * 从 SQL migration 文件中提取表的 NOT NULL 字段
 */
function extractNotNullFields(migrationContent: string, tableName: string): string[] {
  const fields: string[] = [];
  // 匹配 CREATE TABLE 或 ALTER TABLE 中的字段定义
  const fieldRegex = /`?(\w+)`?\s+\w+[^,\n]*NOT NULL/gi;
  let match;
  while ((match = fieldRegex.exec(migrationContent)) !== null) {
    fields.push(match[1]);
  }
  return fields;
}

describe("Schema 验证测试", () => {
  describe("learning_orders 表", () => {
    const repoPath = resolve(__dirname, "../../../src/lib/repos/learning-orders.repo.ts");

    it("INSERT 语句必须包含 user_id 字段", () => {
      const fields = extractInsertFields(repoPath, "learning_orders");
      expect(fields).toContain("user_id");
    });

    it("INSERT 语句必须包含 user_key 字段（迁移兼容）", () => {
      const fields = extractInsertFields(repoPath, "learning_orders");
      expect(fields).toContain("user_key");
    });

    it("INSERT 语句包含所有必需字段", () => {
      const fields = extractInsertFields(repoPath, "learning_orders");
      const requiredFields = [
        "order_no",
        "user_id",
        "user_key",
        "plan_code",
        "amount",
        "currency",
        "provider",
        "pay_url",
        "qr_code_url",
        "raw_request",
      ];
      for (const field of requiredFields) {
        expect(fields, `缺少字段: ${field}`).toContain(field);
      }
    });

    it("INSERT 字段数量与 VALUES 占位符数量匹配", () => {
      const content = readFileSync(repoPath, "utf-8");
      // 提取 INSERT 语句
      const insertMatch = content.match(/INSERT INTO learning_orders\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
      expect(insertMatch).not.toBeNull();

      const fields = insertMatch![1].split(",").map((f) => f.trim());
      const values = insertMatch![2].split(",").map((v) => v.trim());

      // 每个字段应该对应一个 VALUES 占位符（? 或硬编码值）
      expect(fields.length).toBe(values.length);
    });
  });

  describe("crm_payment_orders 表（会员订单）", () => {
    const repoPath = resolve(__dirname, "../../../src/lib/repos/payments.repo.ts");

    it("INSERT 语句必须包含 user_id 字段", () => {
      const fields = extractInsertFields(repoPath, "crm_payment_orders");
      expect(fields).toContain("user_id");
    });

    it("INSERT 语句必须包含 user_key 字段（迁移兼容）", () => {
      const fields = extractInsertFields(repoPath, "crm_payment_orders");
      expect(fields).toContain("user_key");
    });
  });

  describe("training_orders 表", () => {
    const repoPath = resolve(__dirname, "../../../src/lib/repos/training.repo.ts");

    it("INSERT 语句必须包含 user_id 字段", () => {
      const fields = extractInsertFields(repoPath, "training_orders");
      expect(fields).toContain("user_id");
    });

    it("INSERT 语句必须包含 user_key 字段（迁移兼容）", () => {
      const fields = extractInsertFields(repoPath, "training_orders");
      expect(fields).toContain("user_key");
    });
  });
});
