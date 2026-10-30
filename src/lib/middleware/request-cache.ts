/**
 * 请求作用域缓存 — Request-scoped memoization
 *
 * @module lib/middleware/request-cache
 * @description 同一次 HTTP 请求内，相同 key 的读取只落一次库。用途是消除
 *              「同请求内多处判权/取矩阵」造成的重复往返：
 *              典型链路 canAccessNotice（行业墙）→ resolveNoticeAccess（解锁判定）
 *              → isEntitled（权益门控）三个函数各自会取一次「当前生效套餐 + 矩阵格」，
 *              同请求内其实是同一份数据。
 *
 *              为什么是**请求作用域**而不是带 TTL 的进程缓存：
 *              权益矩阵与生效套餐直接决定付费墙放行，跨请求缓存会引入
 *              「刚付款/刚过期仍按旧口径放行」的窗口；请求内复用不存在这个问题
 *              （同一请求内不会有人把套餐改掉再按新套餐判权，付款履约走的是独立事务连接）。
 *
 *              未进入作用域时（脚本、生命周期任务、单测直接调 service）memoizeRequest
 *              退化为直读 loader，行为与未引入本模块完全一致。
 */
import { AsyncLocalStorage } from "node:async_hooks";

/** 一次请求一份的 key → pending promise 映射（值只放 promise，失败即删，不做结果缓存） */
const store = new AsyncLocalStorage<Map<string, Promise<unknown>>>();

/**
 * 在「单次请求」作用域内执行 fn。
 * 已处于作用域内时直接执行（嵌套调用复用同一份缓存，不另开作用域）。
 */
export function runWithRequestCache<T>(fn: () => T): T {
  if (store.getStore()) return fn();
  return store.run(new Map(), fn);
}

/**
 * 同请求内相同 key 只执行一次 loader；loader 拒绝时删除该 key（后续调用可重试），
 * 避免一次瞬时失败在本请求余下生命周期里被当成终态。
 */
export function memoizeRequest<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const cache = store.getStore();
  if (!cache) return loader();
  const hit = cache.get(key);
  if (hit) return hit as Promise<T>;
  const pending = loader();
  cache.set(key, pending);
  // 只删自己这一条：并发下可能已被后续同名 key 覆盖（当前实现不会，但保持判等更稳）
  pending.catch(() => {
    if (cache.get(key) === pending) cache.delete(key);
  });
  return pending;
}
