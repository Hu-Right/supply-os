/**
 * 公告详情深链工具 —— URL 与选中态的单一口径
 *
 * @module features/procurement/lib/deepLink
 * @description 把「当前打开的公告」映射到查询串里的 `?notice_id=<pk>`，让详情页可分享、可刷新：
 *              点开即写入、关闭即清除，其余筛选/分页参数原样保留。纯字符串函数，无副作用，
 *              便于单测与在页面 effect、支付回跳两处共用同一份改名规则。
 */

/** notice_id 深链参数名 */
export const NOTICE_ID_PARAM = "notice_id";

/**
 * 在给定的查询串（不含前导 `?`）上设置/清除 `notice_id`，其它参数保持不变。
 * @param search 当前 `location.search` 去掉前导 `?` 的串，或 `URLSearchParams.toString()` 结果
 * @param noticePk 要写入的公告主键；传 null/undefined 表示清除该参数
 * @returns 处理后的查询串（可能为空串）
 */
export function applyNoticeIdParam(search: string, noticePk: number | null | undefined): string {
  const params = new URLSearchParams(search);
  if (noticePk != null && Number.isFinite(noticePk) && noticePk > 0) {
    params.set(NOTICE_ID_PARAM, String(noticePk));
  } else {
    params.delete(NOTICE_ID_PARAM);
  }
  return params.toString();
}

/** 从查询串解析当前深链公告主键；无/非法返回 null。 */
export function readNoticeIdParam(search: string): number | null {
  const raw = new URLSearchParams(search).get(NOTICE_ID_PARAM);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}
