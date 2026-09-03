/**
 * 统一用户身份类型
 * Unified User Identity
 *
 * @module lib/types/identity
 * @description user_key → user_id 迁移完成后的单一事实源。
 *              所有业务关联、鉴权、限流、缓存键均使用 UserId（number）。
 *              user_key 已退役为 crm_users 本表的登录凭据列，不再作为跨表关联键。
 */

/** 用户 ID — crm_users.id (BIGINT UNSIGNED)，全系统唯一用户标识 */
export type UserId = number;
