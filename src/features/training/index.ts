/**
 * 培训注册模块入口
 * Training Registration Module Entry
 *
 * @module features/training
 * @description 导出落地页和公共 Hook（组件为内部私有，不导出）
 *              Export landing page and public hooks (components are private, not exported)
 */

export { default as TrainingLandingPage } from "./pages/TrainingLandingPage";
export { useTrainingModals } from "./hooks/useTrainingModals";

// API 类型（供外部使用）
export type { DictionaryItem, TrainingRegisterForm } from "./api";
