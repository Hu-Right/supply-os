/**
 * 供应商就绪度评分引擎 — 向后兼容 re-export
 * Supplier Readiness Scoring Engine — Backward-compatible re-export
 *
 * @module features/procurement/utils/scoringEngine
 * @description ARCH-P0（2026-08-31）：权威实现已迁至 lib/services/scoring/index.ts，
 *              本文件改为 re-export 保持 features 层存量导入路径兼容。
 *              新代码应直接从 @/lib/services/scoring 导入。
 */
export type {
  QualificationScoreInput,
  DimensionScore,
  ScoringResult,
} from "@/lib/services/scoring";
export { scoreQualification } from "@/lib/services/scoring";
