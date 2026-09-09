/**
 * 供应商目录类型（服务端 re-export）
 * Supplier Directory Types — Server-side Re-export
 *
 * @module server/types/supplier
 * @description 统一类型单一事实源：re-export 自 src/types/supplier.ts。
 *              服务端代码通过相对路径 `../types/supplier` 导入，
 *              实际指向权威定义，消除双写同步风险。
 */
export type { Supplier } from "../../types/supplier";
