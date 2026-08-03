/**
 * URL 查询参数序列化工具
 * URL query string builder
 *
 * @module core/http/buildQuery
 * @description 自动过滤 null / undefined / ""，保留 0 和 false，
 *              消除各 feature api.ts 中手动 new URLSearchParams + 逐个 if set 的重复模式。
 *              Auto-filters null/undefined/"" while keeping 0 and false,
 *              eliminating repetitive URLSearchParams construction across feature api.ts files.
 */

/**
 * 将键值对象序列化为 URL 查询字符串（不含前导 `?`）。
 * - `null` / `undefined` / `""` 自动跳过
 * - `0` 和 `false` 是有效值，会保留
 * - 非字符串值自动调用 `String()` 转换
 *
 * @example
 * buildQuery({ page: 1, q: "hello", country: undefined, featured: false })
 * // => "page=1&q=hello&featured=false"
 */
export function buildQuery(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    sp.set(key, String(value));
  }
  return sp.toString();
}
