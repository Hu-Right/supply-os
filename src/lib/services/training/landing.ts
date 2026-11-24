/**
 * 研修班落地页数据 — 服务端唯一入口
 *
 * @module lib/services/training/landing
 * @description /training 页面（RSC 直出）与 GET /api/training/landing 共用同一份取数：
 *              课程 + 未来期次。抽出本函数的原因：页面需要服务端直出（AI 爬虫不执行 JS），
 *              路由需要同一口径；两处各写一份会把「未来期次过滤」这类规则分叉。
 */
import { getContext } from "@/lib/db/context";
import type { ScheduleRow } from "@/lib/repos/training.repo";
import {
  trainingCourseViewOf,
  trainingSchedulesViewOf,
  type TrainingCourseView,
  type TrainingScheduleView,
} from "./view";

export interface TrainingLandingData {
  course: TrainingCourseView | null;
  schedules: TrainingScheduleView[];
}

/**
 * 只保留「开课日 ≥ 今天」的期次，剔除已过去的排课。
 * 研修班为「每月 20 号 · 线下」滚动开课：库里预排多条期次，若不过滤，
 * listSchedules 按 start_date 升序会把已过期的一条排在最前且仍标「报名中」。
 * 与 formatScheduleDate 一致，按本地日历日比较（DB DATE 经驱动按本地时区还原）。
 */
function keepUpcoming(schedules: ScheduleRow[]): ScheduleRow[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return schedules.filter((s) => {
    const d = typeof s.start_date === "string" ? new Date(s.start_date) : (s.start_date as Date);
    if (Number.isNaN(d.getTime())) return true; // 解析失败保守保留，交由原状态展示
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return dayStart.getTime() >= todayStart.getTime();
  });
}

/** 读取落地页数据；DB 异常向上抛，由调用方决定降级（页面 catch → 客户端回退拉取） */
export async function loadTrainingLanding(): Promise<TrainingLandingData> {
  const trainingRepo = getContext().trainingRepo;
  const course = await trainingRepo.getActiveCourse();
  const upcoming = course ? keepUpcoming(await trainingRepo.listSchedules(course.id)) : [];
  return {
    course: trainingCourseViewOf(course),
    schedules: trainingSchedulesViewOf(upcoming),
  };
}
