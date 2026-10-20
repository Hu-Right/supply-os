/**
 * notice_type 归一化工具 — 服务端引用门面
 * Notice type normalization — server-side re-export facade
 *
 * @module server/utils/notice-type
 * @description 归一化「逻辑」的唯一实现已下沉至 shared/constants/notice-type（纯逻辑层），
 *              由前端展示层（shared/utils/notice-type 的 noticeTypeKey）与服务端共同引用，
 *              彻底消除历史上 lib（std 码）与 shared（i18n 键）两套平行正则的口径分叉。
 *              本文件仅为既有服务端调用点（wide-row-builder / meilisearch sync / recommend /
 *              filter-builder / params / similar / open-api）保留原引用路径的 re-export 门面，
 *              新增服务端引用亦应指向此处，勿再复制一份规则表。
 */
export { normalizeNoticeType, isKnownNoticeType } from "@/shared/constants/notice-type";
