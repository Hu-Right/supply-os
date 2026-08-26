/**
 * 培训注册模块入口
 * Training Registration Module Entry
 *
 * @module features/training
 * @description 导出页面和公共 Hook（组件为内部私有，不导出）
 *              Export pages and public hooks (components are private, not exported)
 */

export { default as TrainingPage } from "./pages/TrainingPage";
export { default as TrainingLandingPage } from "./pages/TrainingLandingPage";
export { useTrainingForm } from "./hooks/useTrainingForm";
export { useTrainingModals } from "./hooks/useTrainingModals";

// API 类型（供外部使用）
export type { TrainingRegisterForm } from "./api";
export type { DictionaryItem } from "@/core/unspsc/types";
