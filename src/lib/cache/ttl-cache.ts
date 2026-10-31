/**
 * 服务端 TTL+LRU 缓存原语（进程内单一实现）
 * TTL cache primitive — single in-process implementation
 *
 * @module lib/cache/ttl-cache
 * @description 2026-10-31 架构收口：全仓此前约 12 处手搓 `Map<key, {data, expires}>` +
 *              手写过期判断 + 各自为政的清扫策略（search-orchestrator 满额 LRU 淘汰至
 *              75%、recommend 满表扫过期、industry-profile 无清扫…），同一关注点五份实现。
 *              本类收编：TTL 过期 + 容量 LRU 淘汰 + 惰性清扫，一次写对处处复用。
 *
 *              语义（与被收编各处对齐）：
 *              - get：过期即视为未命中并删除条目；命中时重插以维持 LRU 最近访问序。
 *              - set：先删同键（重置插入序）→ 惰性清扫过期项 → 仍超容则从最旧淘汰至 75%
 *                （max 未设则只做 TTL 清扫，不设容量上限，行为对齐无上限的旧实现）。
 *              - 失效：调用方自行接失效回调（如 search-sync 的 registerInvalidateCallback）
 *                后调 delete/clear——本类不感知事件源。
 *
 *              迁移状态：unified-search 结果缓存 / recommend 结果缓存 / industry-profile
 *              已收编；其余手搓位点（stats、hot-topics、filter-builder、scoring、
 *              text-similarity、docCount、keyword-groups、crawler-sync 列缓存等）按本
 *              文件口径逐个跟进，新代码禁止再手搓 Map+expires。
 */
export interface TTLCacheOptions {
  /** 条目存活时长（毫秒） */
  ttlMs: number;
  /** 容量上限；超限按 LRU 淘汰至 75%。不传 = 不限容量（仅 TTL 清扫） */
  max?: number;
  /** 诊断用名称（日志/排查时区分实例） */
  name?: string;
}

export class TTLCache<K, V> {
  private readonly map = new Map<K, { value: V; expires: number }>();
  private readonly ttlMs: number;
  private readonly max?: number;
  readonly name: string;

  constructor(opts: TTLCacheOptions) {
    this.ttlMs = opts.ttlMs;
    this.max = opts.max;
    this.name = opts.name ?? "ttl-cache";
  }

  /** 命中返回值并刷新 LRU 序；过期/不存在返回 undefined（过期条目顺带删除） */
  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expires <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // 重插维持 Map 插入序 = 最近访问序（LRU 依据）
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    this.map.delete(key);
    // 惰性清扫：写入时顺手清过期，避免冷缓存长尾占用
    const now = Date.now();
    for (const [k, entry] of this.map) {
      if (entry.expires <= now) this.map.delete(k);
    }
    // 仍超容：从最旧淘汰至 75%（Map 迭代按插入序）
    if (this.max != null && this.map.size >= this.max) {
      const targetSize = Math.floor(this.max * 0.75);
      for (const k of this.map.keys()) {
        if (this.map.size <= targetSize) break;
        this.map.delete(k);
      }
    }
    this.map.set(key, { value, expires: now + this.ttlMs });
  }

  delete(key: K): void {
    this.map.delete(key);
  }

  /** 按谓词批量删除（键前缀/归属筛选类失效）；返回删除数 */
  deleteWhere(pred: (key: K) => boolean): number {
    let n = 0;
    for (const k of [...this.map.keys()] as K[]) {
      if (pred(k)) {
        this.map.delete(k);
        n++;
      }
    }
    return n;
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
