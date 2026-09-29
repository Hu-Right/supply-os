/**
 * crm_benefit_catalog 影子表切换的唯一映射表（方案 §1.2）
 *
 * 为什么单独成文件：主表 sort_order 重编号、影子表回填、回滚反解三处都必须用同一张表，
 * 各写一份就会出现"两个顺序事实源"——那正是本次切换要消除的毛病本身。
 *
 * 编号规则：按现线上顺序（listBenefits 的 ORDER BY group_code, sort_order，
 * ENUM 分组序 notice→search→ai→enterprise）逐行取 10,20,…,150，步长 10 留插队空间。
 * 关键性质：组内相对序保持不变，因此重编号后
 *   ORDER BY group_code, sort_order  ≡  ORDER BY sort_order
 * 逐行同序 —— 这是"代码可先于切表发布"的前提，由 renumber 脚本硬断言。
 */

/** benefit_code → 新 sort_order */
export const BENEFIT_SORT_MAP = {
  notice_view: 10,
  notice_translation: 20,
  history_notice_db: 30,
  similar_opportunity: 40,
  global_search: 50,
  advanced_keyword_search: 60,
  favorite_monitor: 70,
  alert_service: 80,
  ai_match: 90,
  ai_summary: 100,
  industry_scoped: 110,
  all_category_access: 120,
  enterprise_profile: 130,
  product_keyword_lib: 140,
  joint_bid_match: 150,
};

/** 反解用：新 sort_order → benefit_code（回滚时把主表编号改回去） */
export const BENEFIT_SORT_REVERSE = Object.fromEntries(
  Object.entries(BENEFIT_SORT_MAP).map(([code, so]) => [String(so), code]),
);

/** 影子表切换后被删除的列（供各阶段脚本做"是否仍被引用"的核对） */
export const RETIRED_COLUMNS = [
  "group_code",
  "is_consumable",
  "requires_subscription",
  "gate_key",
  "is_active",
  "updated_at",
];

/**
 * 未映射码（切换窗口内新增的权益）的兜底编号：从已有最大值往后按步长 10 递增。
 * 由调用方传入当前基准值，保证同一次运行内不撞号。
 */
export function nextSortOrder(base) {
  return Number(base || 0) + 10;
}
