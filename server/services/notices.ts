/**
 * 公告服务 — Barrel Re-export（向后兼容入口）
 * Notice Service — Barrel Re-export
 *
 * @module server/services/notices
 * @deprecated 请直接从 notices/ 子模块导入
 */
export {
  normalizeNoticeDetailPayload,
  findQualifiedOpportunityForNotice,
  refreshFeaturedColumn,
  FEATURED_NOTICE_EXISTS,
} from "./notices/index";
