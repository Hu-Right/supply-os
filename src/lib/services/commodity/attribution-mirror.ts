/**
 * 桥表→落点 增量镜像（UNSPSC 退役 混合①的非 API 生产者）
 *
 * 干什么：把「宽表有 backbone_path 列值、但 crm_notice_attribution_nodes 里没有」的公告，
 *         按最深落点压回事实源（source='legacy_tag'）。这类公告是爬虫经桥表→buildWideRow 换算出的
 *         新归属，legacy backfill 一次性灌完后没人持续跟 ⇒ 增量镜像专门补这块，保持「落点 ⊇ 列值」不变量，
 *         为 R2 切读铺路（切读后列值改由落点派生，B=0 才不断供）。
 *
 * 纪律（与 scripts/ops/notice-attribution-backfill.ts 同口径，绝不"顺手修好"脏存量）：
 *   - 只镜像闭包稳定的列：closureOfPathColumn(col) !== col ⇒ 脏列，整条跳过交人工（改了会改写现网归属）；
 *   - 无幻觉：每个落点叶子都必须在启用树里，出现树外码 ⇒ 整条不落笔；
 *   - 幂等：INSERT IGNORE 撞 uk_notice_node 静默跳过；NOT EXISTS 过滤只碰缺落点的公告；
 *   - 只写 crm_notice_attribution_nodes 事实源，不碰宽表列（ADR-0002/0007 单一写入者）。
 *   flag ATTRIBUTION_READ 关时本镜像对现网分类零影响（buildWideRow 仍读桥表）。
 *
 * @module lib/services/commodity/attribution-mirror
 */
import type { Pool, ResultSetHeader } from "mysql2/promise";
import { loadBackboneIndex, backboneNodeLevel } from "./backbone-path";
import { closureOfPathColumn, leafNodesOfPathColumn } from "./attribution";

export type MirrorResult = {
  scanned: number;
  seededNotices: number;
  writtenRows: number;
  skippedDirty: number;
  skippedPhantom: number;
};

/**
 * 跑一轮增量镜像。
 * @param opts.batch 每批扫多少公告（默认 500）
 * @param opts.maxNotices 单轮最多扫多少公告（默认 5000，给下一轮继续，避免长占连接）
 */
export async function runAttributionMirror(
  pool: Pool,
  opts: { batch?: number; maxNotices?: number } = {},
): Promise<MirrorResult> {
  const BATCH = Math.max(1, opts.batch ?? 500);
  const MAX = Math.max(BATCH, opts.maxNotices ?? 5000);
  const INSERT_CHUNK = 800;
  const res: MirrorResult = { scanned: 0, seededNotices: 0, writtenRows: 0, skippedDirty: 0, skippedPhantom: 0 };

  // 启用树索引（进程内 TTL 缓存），判「叶子在不在树里」用，镜像不造码
  const idx = await loadBackboneIndex(<T>(sql: string) => pool.query(sql).then((r) => (r as unknown as T[][])[0]));

  let cur = 0;
  while (res.scanned < MAX) {
    const [rowsRaw] = await pool.query(
      `SELECT ns.id pk, ns.backbone_path col FROM crm_notice_search ns
        WHERE ns.id > ? AND ns.backbone_path IS NOT NULL AND ns.backbone_path <> ''
          AND NOT EXISTS (SELECT 1 FROM crm_notice_attribution_nodes a WHERE a.notice_pk = ns.id)
        ORDER BY ns.id LIMIT ${BATCH}`,
      [cur],
    );
    const rows = rowsRaw as Array<{ pk: number; col: string }>;
    if (rows.length === 0) break;
    cur = rows[rows.length - 1].pk;
    res.scanned += rows.length;

    const out: Array<[number, string, number]> = [];
    for (const r of rows) {
      // 闸口 1：闭包不稳定 ⇒ 脏列（ops 手工灌过 / 断档），整条不落，交人工，绝不镜像改写归属
      if (closureOfPathColumn(r.col) !== r.col) { res.skippedDirty++; continue; }
      const leaves = leafNodesOfPathColumn(r.col);
      // 闸口 3：无幻觉 ⇒ 出现树外码整条不落笔（半条比零条更难查）
      if (leaves.some((leaf) => !idx.nodeOf(leaf))) { res.skippedPhantom++; continue; }
      for (const leaf of leaves) out.push([r.pk, leaf, backboneNodeLevel(leaf)]);
      res.seededNotices++;
    }

    for (let i = 0; i < out.length; i += INSERT_CHUNK) {
      const chunk = out.slice(i, i + INSERT_CHUNK);
      const ph = chunk.map(() => "(?, ?, ?, 1.00, 'legacy_tag', '', '')").join(",");
      const params = chunk.flatMap(([pk, code, lv]) => [pk, code, lv]);
      const [retRaw] = await pool.query(
        `INSERT IGNORE INTO crm_notice_attribution_nodes (notice_pk, node_code, level, confidence, source, model, evidence_text) VALUES ${ph}`,
        params,
      );
      res.writtenRows += (retRaw as unknown as ResultSetHeader).affectedRows ?? 0;
    }
  }
  return res;
}
