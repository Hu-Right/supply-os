/**
 * 金额服务模块 — 统一导出入口
 * Amount Service Module — Unified Export Entry
 *
 * @module server/services/amount
 * @description 金额解析、缓存回填服务模块。
 */

import { parseAmountUsd } from "../notice-normalize/amount";

/** 解析版本号 v2（2026-10-31）：解析器二合一——notice_amount_cache 全量重算触发器 */
export const AMOUNT_PARSE_VERSION = 2;
export { parseAmountUsd };
export { backfillNoticeAmountCache } from "./cache-backfill";
