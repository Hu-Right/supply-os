/**
 * 服务表应用内增量重建（管道第一棒）。
 *
 * 管道翻转后的执行顺序：主表同步 → 本函数（①归一层）→ 宽表级联（②投影层，内部再级联
 * Meili）。此前 ① 是 ops 脚本 spawn 第三棒，生产 standalone 缺脚本即静默跳过——②改为
 * 读 ① 之后这不可接受，故入应用内。选行/构建/写入/清理全部委托 build.ts（唯一写入者）。
 */
import type { Pool } from "mysql2/promise";
import {
  buildPublicRow, deletePublicRows, fetchPublicInputRows,
  loadPublicBuildContext, selectChangedPublicIds, selectPublicGhostIds, upsertPublicRows,
} from "./build";
import type { PublicBuildContext } from "./build";
import { syncBuyerCandidates } from "../buyer/candidates";

export interface RebuildResult {
  selected: number;
  written: number;
  pruned: number;
  /** 未执行的原因（单飞中 / 节流窗口内） */
  skipped?: "running" | "throttled";
}

const REBUILD_CHUNK = 500;
/** 节流窗口：对账定时器高频触发时防止全库不等式选行刷屏；爬虫 tick 级联同样受此约束（小时级，无感） */
const MIN_INTERVAL_MS = Number(process.env.NOTICE_PUBLIC_REBUILD_MIN_INTERVAL_MS || 10 * 60 * 1000);

let _running = false;
let _lastRunAt = 0;

/**
 * 按一批 notice_pk 重建服务表行（构建 + 写入，含单行坏数据隔离）。
 * 选行由调用方决定：常规增量走 selectChangedPublicIds，buyer 数据变更回填走显式 id 列表。
 */
async function writeRowsByIds(pool: Pool, ctx: PublicBuildContext, ids: number[]): Promise<number> {
  let written = 0;
  for (let i = 0; i < ids.length; i += REBUILD_CHUNK) {
    const chunk = ids.slice(i, i + REBUILD_CHUNK);
    const input = await fetchPublicInputRows(pool, chunk);
    const params: unknown[][] = [];
    for (const r of input.rows) {
      const row = buildPublicRow(r, ctx, input);
      if (row) params.push(row);
    }
    try {
      written += await upsertPublicRows(pool, params);
    } catch (chunkErr) {
      // [2026-10-28 事故加固] 整块 all-or-nothing 会让单行坏数据毒化全部选中行：
      // 同一批次每轮都在同一块上失败，~1.2 万行永远写不进服务表。降级逐行落盘，
      // 隔离坏行并留痕（notice_pk = 行首列），修复数据后下轮自动补齐。
      for (const row of params) {
        try {
          written += await upsertPublicRows(pool, [row]);
        } catch (rowErr) {
          console.error(`[notice-public] 单行写入失败（已隔离，notice_pk=${row[0]}）:`, (rowErr as Error).message);
        }
      }
      console.warn(`[notice-public] 块写入失败已逐行降级（chunk ${i}-${i + params.length}）:`, (chunkErr as Error).message);
    }
  }
  return written;
}

/**
 * 单飞 + 节流的 --changed --apply [--prune] 等价物。任何异常向上抛，由调用方告警降级
 * （宽表投影读到旧归一值时，指纹对账会在下轮修复）。
 *
 * @param opts.force 跳过节流窗口（爬虫 tick / 手动 CLI 用）
 * @param opts.prune 是否清理「主表已无」的 ghost 行，默认 true。手动兜底脚本 daily-sync.cjs
 *                   普通轮次传 false（「普通轮次绝不删服务表一行」的口径）；应用内调度器不传。
 */
export async function rebuildNoticePublicChanged(
  pool: Pool,
  opts: { force?: boolean; prune?: boolean } = {},
): Promise<RebuildResult> {
  if (_running) return { selected: 0, written: 0, pruned: 0, skipped: "running" };
  if (!opts.force && Date.now() - _lastRunAt < MIN_INTERVAL_MS) {
    return { selected: 0, written: 0, pruned: 0, skipped: "throttled" };
  }
  _running = true;
  const t0 = Date.now();
  try {
    const ctx = await loadPublicBuildContext(pool);
    const ids = await selectChangedPublicIds(pool);
    const written = await writeRowsByIds(pool, ctx, ids);
    const ghostIds = opts.prune === false ? [] : await selectPublicGhostIds(pool);
    const pruned = ghostIds.length > 0 ? await deletePublicRows(pool, ghostIds) : 0;
    if (ids.length > 0 || ghostIds.length > 0) {
      console.log(`[notice-public] 增量重建：选行 ${ids.length} · 写入 ${written} · 清理 ${pruned}（${((Date.now() - t0) / 1000).toFixed(1)}s）`);
      await syncBuyerCandidates(pool).catch((err: unknown) => {
        console.warn("[notice-public] buyer_candidate 同步失败:", (err as Error).message);
      });
    }
    return { selected: ids.length, written, pruned };
  } finally {
    // [2026-10-28 事故加固] 失败也走节流：此前 _lastRunAt 仅在成功路径更新，
    // 一旦某批数据持续写失败（如单行坏 contacts JSON 毒化整块），每个对账 tick 都会
    // 重跑昂贵的选行+取数（选行集 ~1.2 万行时分钟级），成为常态负载把 DB 拖死。
    _running = false;
    _lastRunAt = Date.now();
  }
}

/**
 * 按显式 notice_pk 列表重建服务表投影（唯一写入者链路不变）。
 *
 * 为什么需要：`--changed` 水位只看主表/商机/标题旁表——buyer / buyer_alias / buyer.name_zh
 * 变更不会让已有服务表行「看起来变旧」，于是改名/合并实体后投影会无限期停留在旧值。
 * 本函数由 `buyer/refresh` 在买家数据变更后调用，把受影响的公告行重新走一遍 buildPublicRow，
 * 产出新的 buyer_id / buyer_name / buyer_name_cn / buyer_group 快照。
 *
 * @param ids 需要重建的 notice_pk（调用方负责圈定：按 buyer_id 反查或按别名命中反查）
 * @returns 实际写入行数（不可准入/无编号行会被 buildPublicRow 丢弃，不补写）
 */
export async function rebuildPublicRowsByIds(pool: Pool, ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const ctx = await loadPublicBuildContext(pool);
  const t0 = Date.now();
  const written = await writeRowsByIds(pool, ctx, ids);
  console.log(`[notice-public] 按 id 重建：选中 ${ids.length} · 写入 ${written}（${((Date.now() - t0) / 1000).toFixed(1)}s）`);
  return written;
}
