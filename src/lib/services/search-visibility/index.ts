/**
 * 搜索可见性模块 — 统一导出
 *
 * @module server/services/search-visibility
 * @description 「让公告对公众可见 / 不可见」的服务端唯一出口。
 *              可见（写入宽表 + 索引）走 search-sync/syncWideIds；
 *              不可见（删除宽表行 + 索引文档 + 结果缓存）走本模块 purgeNoticeSearch。
 *              业务路由不得自行 DELETE crm_notice_search 或直接操作 Meili 文档。
 */
export { purgeNoticeSearch } from "./purge";
