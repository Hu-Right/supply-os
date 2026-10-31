/**
 * 搜索/推荐共用展示助手（ensureNoticePk）
 * Display helpers shared by search orchestrator & recommend pipelines
 *
 * @module lib/services/search-common/display-helpers
 * @description 2026-10-31 解环：助手原先住在 search-orchestrator/format，而 recommend
 *              又被 orchestrator（recommended 模式委托）反向 import——包级双向依赖就此
 *              形成（format 一旦扩 API 立即成环）。助手无编排器状态，下沉 search-common
 *              共享叶层，format 保留 re-export 面，recommend 改直连，双向边消除。
 *              同日机构 i18n 链（enrichAgencyI18n/resolveAgencyDisplay/别名快照预热）
 *              整体退役，本文件只剩主键口径一只。
 */

/**
 * 统一列表项主键口径：`notice_pk` 是前端唯一主键字段（NoticeList 的 key、NoticeCard 的收藏/曝光上报均读它）。
 * 服务表直读行天然带 `notice_pk`；而宽表未就绪的降级多表 JOIN 与推荐管道都按主表 `bid_notices.id` 投影，
 * 行里只有 `id`。三表主键同值（见 baseline.sql：notice_public.notice_pk = bid_notices.id，
 * notice_search.id = notice_pk）⇒ 缺 `notice_pk` 时由 `id` 补齐，已有值不覆盖、两者皆无则不凭空造。
 * 各产出层（formatItems / recommend / deadlineFallback）共用本助手，避免 key={undefined} 触发 React 缺失 key 警告。
 */
export function ensureNoticePk(item: Record<string, unknown>): Record<string, unknown> {
  if (item.notice_pk == null && item.id != null) {
    item.notice_pk = Number(item.id);
  }
  return item;
}
