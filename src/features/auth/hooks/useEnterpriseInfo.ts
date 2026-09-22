/**
 * 向后兼容 re-export：企业信息取数 Hook 已提升至 shared/hooks/useEnterpriseInfo
 * （架构解耦红线 #3：消除 home→auth 跨 feature 硬依赖）。
 * auth 内部与 settings 页面沿用此路径导入，行为不变。
 *
 * @module features/auth/hooks/useEnterpriseInfo
 */
export * from "@/shared/hooks/useEnterpriseInfo";
