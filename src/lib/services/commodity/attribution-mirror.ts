/**
 * 桥表→落点 增量镜像（旧品类码退役 混合①的非 API 生产者）
 *
 * 干什么：把「宽表 backbone_path 列值隐含、但 crm_notice_attribution_nodes 里缺」的落点，
 *         按最深落点压回事实源（source='legacy_tag'）。保持「落点 ⊇ 列值」不变量，
 *         为 R2 切读铺路（切读后列值改由落点派生，缺对即断供）。
 *
 * 候选判据（ADR-0014 登记项的修复，2026-10-14）：早期版本用
 *   `NOT EXISTS (该公告任意落点行)` 选候选 ⇒ 只补「零落点」公告，落点已有部分行的公告
 *   （列值后来因新码变长）永不被回补——正是 5 行缺口缺号的长期复现形态。
 *   现改为契约现成判据 `missingLandingPairs()`：列隐含落点 − 现有落点 ≠ ∅ 即为候选，
 *   与门禁、灌入脚本共用同一份纯函数（判据单一来源）。
 *
 * 纪律（与 scripts/tools/notice-attribution-backfill.ts 同口径，绝不"顺手修好"脏存量）：
 *   - 只镜像闭包稳定的列：closureOfPathColumn(col) !== col ⇒ 脏列，整条跳过交人工（改了会改写现网归属）；
 *   - 无幻觉：每个缺对叶子都必须在启用树里，出现树外码 ⇒ 整条不落笔；
 *   - 幂等：INSERT IGNORE 撞 uk_notice_node 静默跳过；
 *   - 只写 crm_notice_attribution_nodes 事实源，不碰宽表列（ADR-0002/0007 单一写入者）。
 *
 * 扫描指针：落 runtime/attribution-mirror-watermark.json（lastPk）。新判据下候选不再
 *   自排干（脏列/幻觉行会永远缺对），固定从 0 扫会把游标卡死在表头、新公告永不被扫到
 *   ⇒ 指针跨轮持久化，扫到表尾回绕开新周期。
 *
 * @module lib/services/commodity/attribution-mirror
 */
import type { Pool, ResultSetHeader } from "mysql2/promise";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { loadBackboneIndex, backboneNodeLevel } from "./backbone-path";
import { closureOfPathColumn } from "./attribution";
import { missingLandingPairs } from "./attribution-contract";

export type MirrorResult = {
  scanned: number;
  seededNotices: number;
  writtenRows: number;
  skippedDirty: number;
  skippedPhantom: number;
};

const WATERMARK_FILE = "runtime/attribution-mirror-watermark.json";

function readWatermark(): number {
  try {
    return Number(JSON.parse(readFileSync(WATERMARK_FILE, "utf8")).lastPk) || 0;
  } catch {
    return 0;
  }
}

function writeWatermark(pk: number): void {
  try {
    mkdirSync("runtime", { recursive: true });
    writeFileSync(WATERMARK_FILE, JSON.stringify({ lastPk: pk, updatedAt: new Date().toISOString() }));
  } catch {
    // 水印写不进去只影响下轮起点（从头多扫一轮），不影响正确性，不抬错误
  }
}

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

  let cur = readWatermark();
  while (res.scanned < MAX) {
    const [rowsRaw] = await pool.query(
      `SELECT ns.id pk, ns.backbone_path col FROM crm_notice_search ns
        WHERE ns.id > ? AND ns.backbone_path IS NOT NULL AND ns.backbone_path <> ''
        ORDER BY ns.id LIMIT ${BATCH}`,
      [cur],
    );
    const rows = rowsRaw as Array<{ pk: number; col: string }>;
    if (rows.length === 0) {
      // 扫到表尾：回绕开新周期；本轮剩余配额继续从 0 消化（每轮至多回绕一次）
      if (cur === 0) break;
      cur = 0;
      writeWatermark(0);
      continue;
    }
    cur = rows[rows.length - 1].pk;
    res.scanned += rows.length;

    // 契约判据（单一来源）：列隐含落点 − 现有落点 ≠ ∅ 的 (pk, leaf) 对即为本批候选
    const landingRaw = (await pool.query(
      `SELECT a.notice_pk pk, a.node_code code, a.source FROM crm_notice_attribution_nodes a
        WHERE a.notice_pk IN (${rows.map(() => "?").join(",")})`,
      rows.map((r) => r.pk),
    ))[0] as Array<{ pk: number; code: string; source: string }>;
    const pairs = missingLandingPairs(landingRaw, rows);
    if (pairs.length === 0) continue;

    const pairsByPk = new Map<number, string[]>();
    for (const p of pairs) {
      const list = pairsByPk.get(p.pk);
      if (list) list.push(p.code);
      else pairsByPk.set(p.pk, [p.code]);
    }

    const out: Array<[number, string, number]> = [];
    for (const r of rows) {
      // 闸口 1：闭包不稳定 ⇒ 脏列（ops 手工灌过 / 断档），整条不落，交人工，绝不镜像改写归属。
      // missingLandingPairs 对脏列同样剔除（同一判据），这里先查是为补齐 skippedDirty 计数
      if (closureOfPathColumn(r.col) !== r.col) { res.skippedDirty++; continue; }
      const rowPairs = pairsByPk.get(r.pk);
      if (!rowPairs) continue;
      // 闸口 3：无幻觉 ⇒ 缺对叶子出现树外码整条不落笔（半条比零条更难查）
      if (rowPairs.some((leaf) => !idx.nodeOf(leaf))) { res.skippedPhantom++; continue; }
      for (const leaf of rowPairs) out.push([r.pk, leaf, backboneNodeLevel(leaf)]);
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
  writeWatermark(cur);
  return res;
}
