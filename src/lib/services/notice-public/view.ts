/**
 * 公告对外视图 mapper —— 命名红线② 的唯一收口点
 *
 * @module lib/services/notice-public/view
 * @description 服务表投影（crm_notice_public / crm_notice_search / crm_notice_deadline）的列名是
 *              snake_case，而列名属于存储层，不是对外契约。本模块把「行」转成「视图」：键名机械
 *              camelCase 化，**值一律原样透传**（不改时间格式、不改数字/字符串类型、不做二次归一），
 *              所以这次迁移改变的只是键名，不是数据。
 *
 *              为什么用机械转换而不是手写 40 项映射表：
 *              1. 列的唯一事实源是表；手工表会随加列腐化（新列忘登记 = 该列悄悄以 snake 出面或被漏发）。
 *              2. 机械规则下新列自动进入 camel 契约，转换逻辑仍只有这一处，不存在双口径。
 *              3. 表列名与本域类型名不再需要人肉对齐，`types/procurement.ts` 只描述契约。
 *
 *              ⚠ 不要用本函数做「字段裁剪」：它是整行改名，会保留所有列。
 *                 需要只发部分字段的端点（如付费墙预览 /api/notices/:id/preview）必须继续显式列键，
 *                 否则会把 description / description_cn / 附件等解锁后内容一起发出去。
 */
import type { NoticeItem } from "@/types/procurement";

/** 行对象：DB 驱动的返回结构（列名 → 值） */
export type NoticeRow = Record<string, unknown>;

/**
 * 单键 snake_case → camelCase。
 * 已是 camelCase 或全小写无下划线的键原样返回，因此本函数幂等：
 * 对同一份数据重复转换不会改变结果（防止端点与 mapper 双重转换时出现漂移）。
 */
export function toCamelKey(key: string): string {
  // 只把「下划线 + 小写字母/数字」提升为大写；连续下划线按逐个处理，
  // 与 types/procurement.ts 里人工登记的 camel 字段名保持一致口径
  return key.replace(/_+([a-z0-9])/g, (_m, ch: string) => ch.toUpperCase());
}

/**
 * 行→视图的通用改名（只改顶层键名，值原样不动）。
 * 供形状不是公告主体、但同样来自行结构的响应复用（如机构下拉的 `agency_i18n`），
 * 免得同一个命名规则在多处各写一份。
 */
export function toCamelKeys(row: NoticeRow): NoticeRow {
  const out: NoticeRow = {};
  for (const [key, value] of Object.entries(row)) {
    // undefined 键保持"不下发"语义（JSON.stringify 会丢弃 undefined，迁移前后一致）
    out[toCamelKey(key)] = value;
  }
  return out;
}

/**
 * 行 → 视图。
 * @description 返回值的键集合等于入参键集合（仅改名）。这里的断言是"由构造成立"的：
 *              视图类型描述的正是这批列的 camel 名，新增列若尚未登记进类型，它会出现在
 *              响应里但不在契约类型内 —— 与迁移前的行为一致（迁移前同样是整行透传），
 *              要收紧应当显式列举契约字段，那是独立的一次改动，不在命名迁移里顺带做。
 */
export function toNoticeView(row: NoticeRow | null | undefined): NoticeItem | null {
  if (!row) return null;
  // 经 unknown 中转：行对象的结构与视图类型不重叠（前者 snake、后者 camel），
  // 而本函数保证的正是“把前者逐键改名为后者”，直接断言会被 tsc 拦下。
  return toCamelKeys(row) as unknown as NoticeItem;
}

/** 批量：列表端点（unified-search / similar / favorites）用 */
export function toNoticeListView(rows: readonly unknown[]): NoticeItem[] {
  return rows.map((row) => toNoticeView(row as NoticeRow) as NoticeItem);
}
