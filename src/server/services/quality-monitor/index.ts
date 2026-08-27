/**
 * 质量监控模块 — 统一导出入口
 * Quality Monitor Module — Unified Export Entry
 *
 * @module server/services/quality-monitor
 * @description 数据质量快照采集服务模块。
 */
import "server-only";

export { captureDataQualitySnapshot } from "./snapshot";
