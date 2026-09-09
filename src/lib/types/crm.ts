/**
 * CRM 客户关系管理类型（服务端 re-export）
 * CRM Types — Server-side Re-export
 *
 * @module server/types/crm
 * @description 统一类型单一事实源：re-export 自 src/types/crm.ts。
 *              服务端代码通过相对路径 `../types/crm` 导入，
 *              实际指向权威定义，消除双写同步风险。
 */
export type { Lead, Opportunity } from "../../types/crm";
