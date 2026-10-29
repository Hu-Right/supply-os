/**
 * GET /api/training/landing — 培训着陆页动态数据
 *
 * @module app/api/training/landing/route
 * @description 仅返回支付链路所需的动态内容：课程配置与开课期次。
 *              讲师/团队/课堂照片为前端静态配置（src/data/training-content.ts），
 *              全部文案走六语言 i18n（tlFaq* / tlTest* / tlGalCat* / tlIns* / tlTeam*），
 *              本接口不再读取这些内容。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";
import { trainingCourseViewOf, trainingSchedulesViewOf } from "@/lib/services/training/view";
import type { ScheduleRow } from "@/lib/repos/training.repo";

/**
 * 只保留「开课日 ≥ 今天」的期次，剔除已过去的排课。
 * 研修班为「每月 20 号 · 线下」滚动开课：库里预排多条期次，若不过滤，
 * listSchedules 按 start_date 升序会把已过期的一条（如 9/20）排在最前且仍标
 * 「报名中」，导致页面展示过期日期。过滤后页面始终以「下一个 20 号」开头，
 * 每月自动前进，且不会让报名/支付选到已截止的期次。
 * 与 formatScheduleDate 一致，按本地日历日比较（DB DATE 经驱动按本地时区还原），
 * 不做 UTC 换算以免日期错位。
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

export const GET = withRoute(async () => {
  const ctx = getContext();
  const trainingRepo = ctx.trainingRepo;

  // 课程 + 期次（报名支付的依据：course_id / schedule_id / 容量校验）
  const course = await trainingRepo.getActiveCourse();
  const upcoming = course ? keepUpcoming(await trainingRepo.listSchedules(course.id)) : [];

  // 两个值都是 `SELECT *` 整行，必须过视图才上网（旧写法里库里 12/11 列全部直接跟着出网）。
  // 不写成三元内联：那种形状静态面看不见（本轮【丙】组就是这么漏掉 schedules 的）。
  return NextResponse.json({
    course: trainingCourseViewOf(course),
    schedules: trainingSchedulesViewOf(upcoming),
  });
});
