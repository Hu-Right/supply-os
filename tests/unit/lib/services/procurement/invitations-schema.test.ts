/**
 * 迁移 023 · procurement_invitations 结构断言
 *
 * 只验证"迁移文件自述的形态"（版本/幂等建表/排序规则/唯一键），
 * 不连库：真实 DDL 由 `npm run db:migrate` 落到目标库，结构差异用 DESC 复核。
 */
import { describe, it, expect, vi } from "vitest";
import { migration } from "@/lib/db/migrations/023-procurement-invitations";

function fakePool() {
  const calls: string[] = [];
  const db = {
    query: vi.fn(async (sql: string) => {
      calls.push(String(sql));
      return [[], []];
    }),
  };
  return { db: db as never, calls };
}

describe("迁移 023 · procurement_invitations", () => {
  it("版本号紧接 022、名称稳定", () => {
    expect(migration.version).toBe(23);
    expect(migration.name).toBe("procurement_invitations");
  });

  it("建表幂等且显式排序规则（gate check:ddl-collation）", async () => {
    const { db, calls } = fakePool();
    await migration.up(db);
    const ddl = calls.join("\n");
    expect(ddl).toContain("CREATE TABLE IF NOT EXISTS `procurement_invitations`");
    expect(ddl).toContain("utf8mb4_0900_ai_ci");
    expect(ddl).toContain("ENGINE=InnoDB");
  });

  it("邀约状态机与回执列齐全，每列都带 COMMENT（gate check:db-glossary）", async () => {
    const { db, calls } = fakePool();
    await migration.up(db);
    const ddl = calls.join("\n");
    for (const col of [
      "`project_id`",
      "`supplier_id`",
      "`version_no`",
      "`score`",
      "`reasons`",
      "`channel`",
      "`recipient_email`",
      "`recipient_user_id`",
      "`token`",
      "`status`",
      "`decline_reason`",
      "`fail_reason`",
      "`sent_at`",
      "`viewed_at`",
      "`responded_at`",
    ]) {
      expect(ddl).toContain(col);
    }
    // 列定义 = "`列名` 类型"；首段带 CREATE TABLE 前缀，故不锚定行首
    const colDefs = ddl
      .split(", ")
      .map((s) => s.trim())
      .filter((s) => /`[a-z_]+`\s+(BIGINT|INT|VARCHAR|CHAR|TINYINT)\b/.test(s));
    expect(colDefs.length).toBe(16); // 15 个业务列 + id
    for (const line of colDefs) expect(line).toContain("COMMENT");
  });

  it("唯一键防重发：项目×供应商×版本 与 token", async () => {
    const { db, calls } = fakePool();
    await migration.up(db);
    const ddl = calls.join("\n");
    expect(ddl).toContain("uq_inv_project_supplier_ver");
    expect(ddl).toContain("`project_id`,`supplier_id`,`version_no`");
    expect(ddl).toContain("uq_inv_token");
  });

  it("退订与频控查询有索引支撑", async () => {
    const { db, calls } = fakePool();
    await migration.up(db);
    const ddl = calls.join("\n");
    expect(ddl).toContain("idx_inv_supplier");
    expect(ddl).toContain("idx_inv_project_status");
  });
});
