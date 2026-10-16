"use client";

/**
 * 中标情报页 — 弹窗组件集合（barrel）
 * Award Intelligence — Modals
 *
 * @module app/(public)/award-intelligence/Modals
 * @description 2026-10 组件化拆分：本文件由 520 行大组件瘦身为纯再导出 barrel，
 *              各弹窗一文件（./modals/*），通用展示件在 ./modals/_shared。
 *              消费方（./page-client）的 "./Modals" 导入路径保持不变。
 *              拆分对 JSX 与数据逐字不变，各弹窗已套 memo（展示组件规范）。
 */
export { AgencyModal } from "./modals/AgencyModal";
export { CategoryModal } from "./modals/CategoryModal";
export { WinnersModal } from "./modals/WinnersModal";
export { SupplierModal } from "./modals/SupplierModal";
export { CalendarModal } from "./modals/CalendarModal";
export { ReminderModal } from "./modals/ReminderModal";
export { CnCaseDetailModal } from "./modals/CnCaseDetailModal";
