/**
 * 公采搜索/国家/统计服务 — 兼容重导出
 * Notice search service — backward-compatible re-export
 *
 * @module server/services/noticeSearch
 * @description 此文件已拆分为 notice-search/ 子目录。
 *              本文件保留为重导出层，确保所有现有导入路径无需修改。
 *              新代码应直接从 ./notice-search 导入。
 */
export {
  // 类型
  type NoticeSearchParams,
  type NoticeSearchResult,
  type AgencyCacheItem,
  type NoticeStatsResult,
  // 搜索
  searchNotices,
  // 国家
  refreshNoticeCountries,
  getNoticeCountries,
  // 机构
  refreshNoticeAgencies,
  getNoticeAgencies,
  // 统计 + is_active
  refreshNoticeStats,
  refreshIsActive,
  getNoticeStats,
  // 缓存（供内部/测试使用）
  noticeSearchCache,
  noticeCountCache,
  featuredCountCache,
  searchCacheKey,
  countCacheKey,
  // 测试辅助
  __testClearAllCaches,
} from "./notice-search/index";
