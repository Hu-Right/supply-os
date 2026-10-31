/**
 * 搜索/推荐共用展示助手（enrichAgencyI18n / ensureNoticePk）
 * Display helpers shared by search orchestrator & recommend pipelines
 *
 * @module lib/services/search-common/display-helpers
 * @description 2026-10-31 解环：这两只助手原先住在 search-orchestrator/format，而
 *              recommend 又被 orchestrator（recommended 模式委托）反向 import——包级
 *              双向依赖就此形成（format 一旦扩 API 立即成环）。两只助手本就无编排器
 *              状态（纯函数 + agency/resolve 依赖），下沉 search-common 共享叶层，
 *              format 保留 re-export 面，recommend 改直连，双向边消除。
 */
import { resolveAgencyDisplay } from "../agency/resolve";

const CJK_RE = /[\u4e00-\u9fff]/;

/**
 * 逐条补 agency_i18n（机构中文精名，仅别名表登记名；未命中留 undefined 不造假）。
 * 「绝对准确」口径（2026-10-29）：
 *   原名永远准确，宁缺毋假；中文精名靠 agency_aliases 批次持续补
 *   （runtime/agency-coverage.sql 月度巡检出清单）。
 * 筛选下拉（/api/notices/agencies）的聚合桶不受影响：那是过滤导航的本职语义。
 * ⚠ 下拉聚合缓存条目的键名仍是 `agency`（下拉 API 的形状），与公告行字段名无关；
 *   本函数已不再消费聚合缓存。
 */
export function enrichAgencyI18n(
  items: Array<Record<string, unknown>>,
  locale: string,
): Array<Record<string, unknown>> {
  for (const item of items) {
    if (!item.buyer_name) continue;
    const disp = resolveAgencyDisplay(String(item.buyer_name));
    const hit = disp.i18nFrom === "alias"
      && !!disp.i18n?.zh
      && CJK_RE.test(disp.i18n.zh);
    item.agency_i18n = hit ? disp.i18n?.[locale] || undefined : undefined;
  }
  return items;
}

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
