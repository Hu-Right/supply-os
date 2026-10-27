/**
 * 键名机械转换 —— 「行 → 视图」的通用改名工具
 *
 * @module shared/utils/case-keys
 * @description DB 列名是 snake_case，而列名属于存储层、不是对外契约（命名红线②）。
 *              各域的视图 mapper 都需要同一件事：把行对象的顶层键机械 camel 化、
 *              值原样透传。这段规则只在本文出现一次，避免同一个命名规则
 *              在 notices / awards 等多处各写一份而慢慢分叉。
 *
 *              为什么用机械转换而不是手写映射表：列的唯一事实源是表，
 *              手工表会随加列腐化（新列忘登记 = 悄悄以 snake 出面或被漏发）。
 */

/** 行对象：DB 驱动的返回结构（列名 → 值） */
export type RowLike = Record<string, unknown>;

/**
 * 单键 snake_case → camelCase。
 * 已是 camelCase 或全小写无下划线的键原样返回，因此本函数幂等：
 * 对同一份数据重复转换不会改变结果（防止端点与 mapper 双重转换时出现漂移）。
 */
export function toCamelKey(key: string): string {
  // 只把「下划线 + 小写字母/数字」提升为大写；连续下划线按逐个处理，
  // 与各域契约类型里人工登记的 camel 字段名保持一致口径
  return key.replace(/_+([a-z0-9])/g, (_m, ch: string) => ch.toUpperCase());
}

/**
 * 行→视图的通用改名（只改顶层键名，值原样不动）。
 * @param row 任何对象：这里不要求索引签名，因为 repo 行类型多为 interface
 *            （interface 没有隐式索引签名，写成 Record<string, unknown> 入参会迫使调用方强转）。
 * @remarks 这是**改名**不是**裁剪**：所有键都会留在结果里。需要只发部分字段的
 *          端点（付费墙、公开列表）必须显式列键，不要用本函数图省事。
 */
export function toCamelKeys(row: object): RowLike {
  const out: RowLike = {};
  for (const [key, value] of Object.entries(row)) {
    // undefined 键保持"不下发"语义（JSON.stringify 会丢弃 undefined，迁移前后一致）
    out[toCamelKey(key)] = value;
  }
  return out;
}
