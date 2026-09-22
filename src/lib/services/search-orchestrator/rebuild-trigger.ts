/**
 * 搜索编排器索引重建触发器 — 向后兼容 re-export
 * @deprecated 权威实现已迁至 search-common/rebuild-trigger，新代码应从 @/lib/services/search-common/rebuild-trigger 导入
 */
export { requestIndexRebuild, isRebuildRequested, tryRunPendingRebuild } from "../search-common/rebuild-trigger";
