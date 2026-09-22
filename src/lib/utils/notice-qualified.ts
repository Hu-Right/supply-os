/**
 * 合格机会谓词 —— 跨层唯一口径出口
 * Qualified Opportunity Predicate (single source)
 *
 * @module server/utils/notice-qualified
 * @description 「一条机会记录是否算合格机会」决定了公告详情页/宽表/索引里的描述与展示字段
 *              取自哪一行 crm_bid_opportunities。此前该条件在 4 个文件里各写一份
 *              （宽表构建、翻译批量查询、SEO 详情查询、搜索降级查询），任一处演进都会
 *              让「详情页看到的」与「搜索索引里被搜到的」取自不同行 —— D4 实测已产出
 *              8,367 行描述错值。
 *
 *              归属 utils 层原因：services/search-sync、services/meilisearch 与
 *              repos/notices 都需引用，放 services 会造成 repos → services 反向依赖。
 *              由 scripts/check-wide-table-ssot.mjs（红线 #6）禁止再出现内联副本。
 *
 *              注意：status 列为 tinyint(1=won)，不可用字符串 'won' 比较（UPDATE 严格模式会报截断错误）。
 */

/**
 * @param alias 表别名，空串表示无别名
 * @returns 可直接拼进 ON / WHERE 的括号化谓词
 */
export function qualifiedOppWhere(alias = ""): string {
  const p = alias ? `${alias}.` : "";
  return `(${p}is_qualified = 1 OR ${p}status = 1 OR ${p}audit_status = 1)`;
}
