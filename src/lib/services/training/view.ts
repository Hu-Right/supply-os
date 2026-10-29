/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 培训对外视图（红线②收口点）
 *
 * @module services/training/view
 * @description GET /api/training/landing 的出口形状。两个值都来自 `SELECT *`
 *              （training_courses 12 列 / training_schedules 11 列，真库实测），
 *              库里有列就跟着上网——本视图改成按前端已声明的契约显式列举，
 *              新增列必须先登记（写进这里）才能出网。
 *
 *              命名约定 `*ViewOf` 是给静态面看的：规则三（字面量包 opaque 值）
 *              只认这个后缀，才能自己看出已收口、把登记行删掉。
 *
 *              ⚠️ 值形态一律原样透传，本批不改数值口径：unit_price 是 DECIMAL，
 *              连接池未开 `decimalNumbers`（见 lib/db/pool.ts 的编码红线注释），
 *              驱动实际返回字符串；而前端 `LandingCourse.unit_price` 一直声明为 number
 *              （运行时靠 String 的 toLocaleString/arithmetic 兜住）。把这层类型谎改成
 *              诚实形态会连带改变价格显示（"3800.00" → "3,800"），属独立批次。
 */
import type { CourseRow, ScheduleRow } from "@/lib/repos/training.repo";

export interface TrainingCourseView {
  id: number;
  nameZh: string;
  nameEn: string | null;
  descriptionZh: string | null;
  descriptionEn: string | null;
  /** 见文件头 ⚠️：值原样透传，类型沿用前端既有声明 */
  unitPrice: number;
  currency: string;
  /** JSON 列由驱动解析为 JS 值（前端按 string[] 渲染） */
  includes: string[];
}

export interface TrainingScheduleView {
  id: number;
  periodNumber: number;
  /** DATE 列：本池未开 dateStrings，驱动给 Date，序列化后为 ISO 串（前端两种都吃） */
  startDate: string | Date;
  city: string;
  format: string;
  status: string;
  capacity: number | null;
  enrolledCount: number;
}

/** 课程行 → 视图；无 active 课程时返回 null（前端有 TRAINING_FALLBACK_* 兜底显示） */
export function trainingCourseViewOf(row: CourseRow | null): TrainingCourseView | null {
  if (!row) return null;
  return {
    id: row.id,
    nameZh: row.name_zh,
    nameEn: row.name_en ?? null,
    descriptionZh: row.description_zh ?? null,
    descriptionEn: row.description_en ?? null,
    unitPrice: row.unit_price as TrainingCourseView["unitPrice"],
    currency: row.currency,
    includes: row.includes as unknown as string[],
  };
}

export function trainingScheduleViewOf(row: ScheduleRow): TrainingScheduleView {
  return {
    id: row.id,
    periodNumber: row.period_number,
    startDate: row.start_date,
    city: row.city,
    format: row.format,
    status: row.status,
    capacity: row.capacity ?? null,
    enrolledCount: row.enrolled_count,
  };
}

export const trainingSchedulesViewOf = (rows: readonly ScheduleRow[]): TrainingScheduleView[] =>
  rows.map(trainingScheduleViewOf);
