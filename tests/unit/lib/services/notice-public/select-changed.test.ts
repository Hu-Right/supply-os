/**
 * selectChangedPublicIds 选行口径回归（2026-11-17 事故）
 *
 * 事故：服务表缺行时 `LEFT JOIN notice_public p` 的 p.* 全为 NULL，于是「已存在行时间戳变新」
 * 分支里的 `n.update_time > IFNULL(p.updated_at, 0)` 对**所有** update_time > 0 的行成立，
 * 等于绕过了 PUBLIC_ADMIT_SQL 把全库选进来（实测选行 489,832，构建侧只接受 92 条，
 * 每轮空转 2.2h，新抓取的公告永远等不到进服务表）。
 *
 * 不变量：该分支必须带 `p.notice_pk IS NOT NULL`；缺行只走「缺行 + 准入红线」分支。
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  selectChangedPublicIds,
  PUBLIC_ADMIT_SQL,
} from "@/lib/services/notice-public/build";

function makePool(): { pool: never; sqls: string[] } {
  const sqls: string[] = [];
  const pool = {
    query: vi.fn(async (sql: string) => {
      sqls.push(sql);
      return [[{ id: 7 }, { id: 9 }]];
    }),
  } as never;
  return { pool, sqls };
}

describe("selectChangedPublicIds", () => {
  it("「已存在行变新」分支必须带 p.notice_pk IS NOT NULL，不能靠 IFNULL(p.updated_at,0) 兜底", async () => {
    const { pool, sqls } = makePool();
    const ids = await selectChangedPublicIds(pool);

    expect(ids).toEqual([7, 9]);
    expect(sqls).toHaveLength(1);
    const sql = sqls[0];

    // 正例：存在性守卫在比较之前
    expect(sql).toContain(
      "p.notice_pk IS NOT NULL AND n.update_time IS NOT NULL AND n.update_time > IFNULL(p.updated_at, 0)",
    );
    // 反例：不允许再出现不带存在性守卫的旧式判据（缺行会被全选）
    expect(sql).not.toMatch(
      /OR \(n\.update_time IS NOT NULL AND n\.update_time > IFNULL\(p\.updated_at, 0\)\)/,
    );
  });

  it("缺行分支仍受准入红线约束（不是「缺行就重建」）", async () => {
    const { pool, sqls } = makePool();
    await selectChangedPublicIds(pool);
    const sql = sqls[0];

    expect(sql).toContain(PUBLIC_ADMIT_SQL);
    expect(sql).toContain("p.notice_pk IS NULL AND n.notice_id IS NOT NULL AND n.notice_id <> ''");
  });
});
