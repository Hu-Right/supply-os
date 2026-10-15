/**
 * 用户行业画像领域类型定义
 * Industry profile domain types
 *
 * @module server/services/industry-profile/types
 * @description 旧版两阶段行业匹配（T0-T3 分层 + Tier4 类目推断兜底）已随
 *              USE_LEGACY_IMPL 回滚开关一并移除；检索统一走
 *              search-orchestrator（mode=prefs）。此处仅保留用户行业画像
 *              类型，供 resolve.ts 与 search-orchestrator/mode-resolver 使用。
 *              （#11 清扫，2026-08-20：industry-match → industry-profile 更名，
 *              目录名与实际职责对齐——匹配逻辑早已不在本目录）
 */

/** 用户行业画像（由 resolve.ts 解析，码版：偏好表存最深 UGT 节点码） */
export interface UserIndustryProfile {
  userId: number;
  /** 最深已选 UGT 骨架节点码（crm_user_industry_prefs.commodity_code，已过形制校验） */
  commodityCode: string;
  /** 码长即层级（1~5，BB1 不变量） */
  deepestLevel: number;
  /** 所属大类 = L1 树码（2026-10-15 G 码退役后由 commodity_code 前缀纯切片推导）。
   *  可见性判定只认这个：industry-scope 的墙按大类执法。 */
  l1Code: string | null;
  /** 节点中文名（品目树 name_zh，提示条/日志展示用） */
  industryTitleZh: string | null;
}
