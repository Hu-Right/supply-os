/**
 * 搜索详情覆盖兜底：Meili 返回的 ID 若尚未进服务表，按其主键即时补建。
 * 只处理少量缺失页，不替代正常流水线；用于阻断“有总数、卡片为空”。
 */
import type { Pool } from "mysql2/promise";
import {
  buildPublicRow, fetchPublicInputRows, loadPublicBuildContext, upsertPublicRows,
} from "./build";

export async function repairNoticePublicIds(pool: Pool, ids: number[]): Promise<number> {
  const wanted = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
  if (wanted.length === 0) return 0;
  const [existingRows] = await pool.query(
    `SELECT notice_pk FROM notice_public WHERE notice_pk IN (${wanted.map(() => "?").join(",")})`,
    wanted,
  );
  const existing = new Set((existingRows as Array<{ notice_pk: number }>).map((r) => Number(r.notice_pk)));
  const missing = wanted.filter((id) => !existing.has(id));
  if (missing.length === 0) return 0;

  const ctx = await loadPublicBuildContext(pool);
  const input = await fetchPublicInputRows(pool, missing);
  const params: unknown[][] = [];
  for (const row of input.rows) {
    const built = buildPublicRow(row, ctx, input);
    if (built) params.push(built);
  }
  return upsertPublicRows(pool, params);
}
