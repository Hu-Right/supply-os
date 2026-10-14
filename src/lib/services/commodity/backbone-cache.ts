/**
 * 骨架索引的进程内缓存 —— 宽表写入侧唯一的取用入口
 * Backbone index cache (in-process, TTL) for the wide-row writer
 *
 * @module lib/services/commodity/backbone-cache
 * @description 为什么需要缓存：每条公告进宽表时都要把身上的旧品类码换成骨架节点码，
 *              而骨架是 159,429 行的一棵树。逐码查库会把同步链路拖死（一轮 500 行、平均 2.4 码，
 *              还要回溯祖先），所以一次载入整树在内存换算。实测成本（2026-10-11，经 SSH 隧道连生产）：
 *              载入 15.4s、常驻堆 +71.3MB；换算最近 500 行（有码 398 行）含取码 SQL 共 271ms；
 *              最重的一条（5,091 码）12ms 出 5,279 个节点码、列长 87,498 字符。
 *
 *              口径不在这里重写：四条换算规则仍只在 `backbone-path.ts` 一份（项目纪律：一份口径），
 *              本模块只管三件事——什么时候载入、载入失败怎么办、什么时候能给出 NULL。
 *
 * @staleness TTL 60 分钟：树只在 ops 脚本里变（正名/重灌），10 分钟一档没有收益，
 *              而载入一次要十几秒。刷新失败时**继续用旧索引**（陈旧但仍正确，树没变就是对的），
 *              绝不用空映射冒充"算得出"——那是把公告归属悄悄写坏的最快路径。
 * @limits 首次载入就失败（库里没树 / 连不上）⇒ 返回 null，调用方把 backbone_path 落 NULL 并告警。
 *          行照常写（其它列是搜索的命脉），归属缺位由门禁 BB7 直接报错：
 *          它断言「挂了码且按当前树可算的公告必须有非空 backbone_path」（2026-10-12 从「有码必填」收紧），
 *          所以这里不需要也不允许假装成功；全码换不出而不落笔属预期（以树为准，等 AI 补码）。
 *          口径改了但本模块的调用方跑的是线上已部署构建时，BB10 会把这类分叉报出来（新公告由旧规则写），
 *          它自会随发布收敛，不是数据坏。
 * @see src/lib/services/commodity/backbone-path.ts（换算口径唯一实现）
 * @see src/lib/services/search-sync/wide-row-builder.ts（唯一调用方）
 * @see scripts/gates/check-commodity-backbone.ts（BB7 闭合断言）
 */
import type { Pool } from "mysql2/promise";
import {
  assertBackbonePathLength,
  loadBackboneIndex,
  toBackbonePathColumn,
  type BackboneIndex,
} from "./backbone-path";

/** 树变动只发生在 ops 脚本里，一小时刷新一次足够（载入实测十几秒） */
const TTL_MS = 60 * 60 * 1000;
/** 同一进程内告警节流间隔：一小时的 TTL 里每轮同步都可能撞上，不能每轮刷一条 */
const WARN_THROTTLE_MS = 60 * 1000;

let _index: BackboneIndex | null = null;
let _expiresAt = 0;
let _lastWarnAt = 0;

/** 测试与运维手动失效用：下一次取用会重新载入（连告警节流一起清，否则单测看不到告警） */
export function resetBackboneCache(): void {
  _index = null;
  _expiresAt = 0;
  _lastWarnAt = 0;
}

/** 当前是否已有可用索引（供自检/诊断，不触发载入） */
export function hasBackboneIndex(): boolean {
  return _index !== null;
}

const warnThrottled = (msg: string) => {
  const now = Date.now();
  if (now - _lastWarnAt < WARN_THROTTLE_MS) return;
  _lastWarnAt = now;
  console.warn(msg);
};

/**
 * 取骨架索引：命中缓存直接返回，过期则重载；重载失败时保留旧索引（陈旧但可用）。
 * 返回 null 只有一种情况：从未成功载入过。
 */
export async function getBackboneIndex(pool: Pool): Promise<BackboneIndex | null> {
  if (_index && Date.now() < _expiresAt) return _index;
  try {
    const fresh = await loadBackboneIndex(<T = Record<string, unknown>>(sql: string) =>
      (pool.query(sql) as unknown as Promise<[T[], unknown]>).then(([r]) => r),
    );
    _index = fresh;
    _expiresAt = Date.now() + TTL_MS;
    return _index;
  } catch (err) {
    // 有旧索引就继续用：树没变时旧索引完全正确，树变了则最坏陈旧一小时
    if (_index) {
      warnThrottled(`[commodity] 骨架索引刷新失败，沿用旧索引（${_index.size} 节点）: ${(err as Error).message}`);
      // 陈旧索引再给一小时窗口，避免每轮同步都重试一次十几秒的全树查询把连接池拖住
      _expiresAt = Date.now() + TTL_MS;
      return _index;
    }
    warnThrottled(`[commodity] 骨架索引载入失败，本轮公告归属落 NULL（门禁 BB7 会点名）: ${(err as Error).message}`);
    return null;
  }
}

/**
 * 一条公告的码集合 → backbone_path 列值。
 * @returns 逗号分隔的节点码；公告没有码、或索引从未载入成功 ⇒ **null**（BB7 要求"无码必空"，
 *          且空串被视为违规，所以这里绝不返回 ""）。
 * @throws 列值超 1,000,000 字符时由 assertBackbonePathLength 抛出：截断等于改掉公告的归属，
 *         宁可让这一批同步失败重试，也不写半截（实测最长 87,498 字符，离上限 11 倍）。
 */
export async function backbonePathOfCodes(pool: Pool, codes: Iterable<string>): Promise<string | null> {
  const list = [...codes];
  if (list.length === 0) return null;
  const idx = await getBackboneIndex(pool);
  if (!idx) return null;
  const res = idx.pathOf(list);
  if (res.misses.length) {
    // 换不出的码不静默丢：点名告警，归属仍写已算出的部分（有比没有更接近真相）
    warnThrottled(
      `[commodity] ${res.misses.length}/${list.length} 个码在骨架树上换不出归属，样本 ${res.misses.slice(0, 3).join("、")}`,
    );
  }
  if (res.codes.length === 0) return null;
  return assertBackbonePathLength(toBackbonePathColumn(res.codes), "sync");
}
