/**
 * 统一错误响应端口（SSOT）
 * Unified API error response — Single Source of Truth
 *
 * @module server/utils/http-error
 * @description N4 收敛（2026-08-20）：原错误响应三种形态混用（机读码式 {error:"CODE"}、
 *              人读中文式 {error:"请输入..."}、混合式 {error,message}），与开发规范
 *              "统一 code（数字错误码）/message（本地化消息）结构" 零符合。
 *              本模块为错误出口唯一权威实现：
 *              - code：数字错误码，前端按码分支（429 倒计时、VIP_REQUIRED 拉起付费面板等）；
 *              - message：用户可见消息（过渡期含中文原文，后续接 i18n key）；
 *              - error：过渡兼容字段 = message，保证既有前端 api-client 读取 err.error
 *                展示消息的行为零变更；全量迁移完成后移除。
 *              迁移纪律：按路由域分批替换 `.json({ error })` 为 sendError，
 *              同一 code 语义全域唯一，新增错误码必须登记于 ApiErrorCode。
 */
import type { Response } from "express";

/**
 * 统一数字错误码注册表（前端按码分支的唯一依据）。
 * 分段约定：40xxx 参数/身份类，41xxx 权限/配额类，42xxx 频控类，50xxx 服务端类。
 */
export const ApiErrorCode = {
  // ── 40xxx 参数/身份 ──
  USER_REQUIRED: 40001,
  INVALID_PARAMS: 40002,
  NOTICE_NOT_FOUND: 40004,
  SUPPLIER_NOT_FOUND: 40005,
  OPPORTUNITY_NOT_FOUND: 40006,
  // ── 41xxx 权限/配额 ──
  VIP_REQUIRED: 41001,
  FORBIDDEN: 41003,
  FREE_LIMIT_REACHED: 41101,
  PAID_QUOTA_REQUIRED: 41102,
  // ── 42xxx 频控 ──
  RATE_LIMITED: 42001,
  // ── 50xxx 服务端 ──
  INTERNAL_ERROR: 50000,
} as const;

export type ApiErrorCodeValue = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

/**
 * 统一错误响应出口（唯一权威实现）。
 * @param res     Express 响应对象
 * @param status  HTTP 状态码
 * @param code    ApiErrorCode 数字错误码（前端逻辑分支依据）
 * @param message 用户可见消息（展示用；过渡期为中文原文，后续接 i18n）
 * @param extra   附加字段（如 retry_after_seconds），平铺进响应体
 */
export function sendError(
  res: Response,
  status: number,
  code: ApiErrorCodeValue,
  message: string,
  extra?: Record<string, unknown>,
): void {
  res.status(status).json({
    code,
    message,
    // 过渡兼容：前端 api-client 现读取 err.error 作为展示消息，保持零变更；
    // 全量迁移并升级前端按 code 分支后删除本字段。
    error: message,
    ...extra,
  });
}
