/**
 * Feature Flag 系统
 * Feature Flag System
 *
 * @module core/flags
 * @description 基于环境变量的功能开关，控制新功能的灰度发布与回滚。
 *              所有重构功能通过 flag 控制，确保可随时回退到旧版本。
 *              Feature flags based on environment variables for controlled
 *              rollout and rollback of new features.
 *
 * 使用方式 / Usage:
 *   import { flags } from "@/core/flags";
 *   if (flags.NEW_HOME) { /* 新首页逻辑 *\/ }
 *
 * 环境变量命名规范 / Env var naming:
 *   FEATURE_<FLAG_NAME>="on"  → 开启
 *   未设置或 "off"            → 关闭（默认）
 */

/** 功能开关定义 / Feature flag definitions */
export const FEATURE_FLAGS = {
  /** 新首页（双搜索 Hero + 数字墙 + 三栏内容） */
  NEW_HOME: "FEATURE_NEW_HOME",
  /** 全球商机高级搜索（7 维筛选 + 热门入口） */
  ADVANCED_SEARCH: "FEATURE_ADVANCED_SEARCH",
  /** 招标详情 AI 摘要 + 下一步动作面板 */
  NOTICE_DETAIL_ENHANCED: "FEATURE_NOTICE_DETAIL_ENHANCED",
  /** 供应商库多维筛选 + 视图切换 */
  SUPPLIER_LIBRARY_ENHANCED: "FEATURE_SUPPLIER_LIBRARY_ENHANCED",
  /** 供应商企业主页（Tab 式能力档案） */
  SUPPLIER_PROFILE: "FEATURE_SUPPLIER_PROFILE",
  /** 中标情报页面 */
  AWARD_INTELLIGENCE: "FEATURE_AWARD_INTELLIGENCE",
  /** 会员套餐 6 档分层 */
  MEMBERSHIP_TIERS_V2: "FEATURE_MEMBERSHIP_TIERS_V2",
  /** CRM 鉴权守卫（登录后才可访问） */
  CRM_AUTH_GUARD: "FEATURE_CRM_AUTH_GUARD",
  /** 保存搜索 + 提醒 */
  SAVED_SEARCH: "FEATURE_SAVED_SEARCH",
  /** RFQ 采购需求发布 */
  RFQ: "FEATURE_RFQ",
  /** 知识中心 SEO 重构 */
  KNOWLEDGE_CENTER_V2: "FEATURE_KNOWLEDGE_CENTER_V2",
  /** 投标服务生命周期分组 */
  SERVICES_LIFECYCLE: "FEATURE_SERVICES_LIFECYCLE",
  /** 海外展厅地图 */
  SHOWROOM_MAP: "FEATURE_SHOWROOM_MAP",
  /** 研修班页面重构 */
  TRAINING_V2: "FEATURE_TRAINING_V2",
} as const;

export type FeatureFlagName = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

/**
 * 检查功能开关是否开启
 * Check if a feature flag is enabled
 *
 * @param flagName - 环境变量名（从 FEATURE_FLAGS 取值）
 * @returns true 当环境变量值为 "on"（不区分大小写）
 */
export function isFeatureEnabled(flagName: FeatureFlagName): boolean {
  const value = process.env[flagName];
  return value?.toLowerCase() === "on";
}

/**
 * 功能开关代理对象 — 提供便捷的属性访问方式
 * Feature flag proxy object — convenient property access
 *
 * @example
 *   import { flags } from "@/core/flags";
 *   if (flags.NEW_HOME) { ... }
 */
export const flags = new Proxy({} as Record<keyof typeof FEATURE_FLAGS, boolean>, {
  get(_target, prop: string) {
    const envVar = FEATURE_FLAGS[prop as keyof typeof FEATURE_FLAGS];
    if (!envVar) return false;
    return isFeatureEnabled(envVar);
  },
});

/**
 * 获取所有功能开关的当前状态（用于调试/管理界面）
 * Get current status of all feature flags (for debug/admin UI)
 */
export function getAllFlagsStatus(): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const [key, envVar] of Object.entries(FEATURE_FLAGS)) {
    result[key] = isFeatureEnabled(envVar as FeatureFlagName);
  }
  return result;
}
