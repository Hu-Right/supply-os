/**
 * UNSPSC 服务模块 — 统一导出入口
 * UNSPSC service module — unified export entry
 *
 * @module server/services/unspsc
 * @description 按职责拆分的 UNSPSC 子模块统一导出：
 *              - parser: 纯函数（码归一化、前缀提取）
 *              - tree-cache: 内存缓存（类目树加载/路径回溯）
 *              - filter: SQL 构建（筛选器/降级路径查询）
 *              - interest: 数据库写操作（用户兴趣码持久化）
 */

// 纯函数
export {
  normalizeUnspscCodes,
  unspscPrefixFromCode,
  expandUnspscInterestPrefixes,
  padUnspscPrefix,
} from "./parser";
export type { UnspscCodeRow } from "./parser";

// 内存缓存
export {
  loadUnspscCache,
  getPathFromCache,
  getCodeIdFromCache,
  getUnspscLevelFromCache,
  clearUnspscCache,
} from "./tree-cache";

// SQL 构建
export {
  buildNoticeUnspscFilter,
  getUnspscPath,
} from "./filter";

// 数据库写操作
export {
  persistUserInterestCodes,
} from "./interest";
