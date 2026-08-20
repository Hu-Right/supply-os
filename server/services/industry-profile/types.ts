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

/** 用户五级行业画像（由 resolve.ts 解析） */
export interface UserIndustryProfile {
  userKey: string;
  /** 最深非空级（1~5） */
  deepestLevel: number;
  /** 各级类目 id（下标 0 = level1，未选级为 null） */
  levelIds: (number | null)[];
  /** 最深级类目 id */
  deepestId: number | null;
  /** 行业分支码前缀（如 '4214'） */
  branchPrefix: string | null;
  /** 行业中文名 */
  industryTitleZh: string | null;
}
