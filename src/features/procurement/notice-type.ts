/**
 * Notice type normalization — 向后兼容 re-export
 *
 * @module features/procurement/notice-type
 * @description 已提升至 shared/utils/notice-type（消除跨 feature 依赖）。
 *              本文件保留 re-export 以兼容同 feature 内的相对路径引用。
 *              新代码请直接 import { noticeTypeKey } from "@/shared/utils/notice-type"。
 */
export { noticeTypeKey } from "@/shared/utils/notice-type";
