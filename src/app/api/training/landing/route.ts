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

export async function GET() {
  const ctx = getContext();
  const trainingRepo = ctx.trainingRepo;

  // 课程 + 期次（报名支付的依据：course_id / schedule_id / 容量校验）
  const course = await trainingRepo.getActiveCourse();
  const schedules = course ? await trainingRepo.listSchedules(course.id) : [];

  return NextResponse.json({ course, schedules });
}
