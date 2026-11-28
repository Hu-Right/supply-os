/**
 * 品目骨架路径装载（落点表 → 含全部祖先的节点码串）
 *
 * @module lib/services/commodity/backbone-loader
 * @description 2026-11-28 宽表退役：`backbone_path` 是服务表列，由本装载器从
 *              `notice_attribution_nodes`（落点表，唯一事实源）算出；形制不变
 *              （ASCII 逗号分隔的 UGT 节点码集，含全部祖先）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { loadBackboneIndex, toBackbonePathColumn } from "./backbone-path";

/** 装载输入：内部主键 + 对外公告编号 */
export interface AttributionSourceRow {
  pk: number;
  noticeId: string;
}

/**
 * 批量装载品目骨架路径。
 * @returns noticeId → { backbone }；无落点/无 pk 的行不在 Map 中（由调用方写 NULL）
 */
export async function loadBackboneMap(
  pool: Pool,
  sources: AttributionSourceRow[],
): Promise<Map<string, { backbone: string }>> {
  if (sources.length === 0) return new Map();
  const byPk = new Map<number, string>();
  for (const s of sources) if (s.pk) byPk.set(s.pk, s.noticeId);
  const pks = [...byPk.keys()];
  if (pks.length === 0) return new Map();

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT notice_pk, node_code FROM notice_attribution_nodes
      WHERE notice_pk IN (${pks.map(() => "?").join(",")})`,
    pks,
  );
  const nodesByPk = new Map<number, string[]>();
  for (const row of rows) {
    const arr = nodesByPk.get(Number(row.notice_pk));
    if (arr) arr.push(String(row.node_code));
    else nodesByPk.set(Number(row.notice_pk), [String(row.node_code)]);
  }

  // 祖先链展开只认骨架树索引（同一条口径）：脏码进 misses，不臆造祖先
  const index = await loadBackboneIndex(<T>(sql: string) => pool.query(sql).then((r) => (r as unknown as T[][])[0]));
  const result = new Map<string, { backbone: string }>();
  for (const [pk, nid] of byPk) {
    const codes = nodesByPk.get(pk);
    if (!codes || codes.length === 0) {
      result.set(nid, { backbone: "" });
      continue;
    }
    const expanded = index.pathOf(codes).codes;
    result.set(nid, { backbone: expanded.length ? toBackbonePathColumn(expanded) : "" });
  }
  return result;
}
