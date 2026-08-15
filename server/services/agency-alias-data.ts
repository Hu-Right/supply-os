/**
 * 机构别名映射种子数据 — Barrel Re-export（向后兼容层）
 * Agency Alias Seed Data — Barrel Re-export
 *
 * @module server/services/agency-alias-data
 * @description 数据已迁移至 server/data/agency-i18n/aliases.ts，
 *              本文件仅保留 re-export 以维持向后兼容。
 */
export type { AgencyAliasGroup } from "../data/agency-i18n/aliases";
export { AGENCY_ALIAS_GROUPS } from "../data/agency-i18n/aliases";
