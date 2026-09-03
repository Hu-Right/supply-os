/**
 * GET /api/training/landing — 培训着陆页完整数据
 *
 * @module app/api/training/landing/route
 * @description 只返回动态内容：课程/期次/讲师/团队/课堂照片。
 *              学员反馈、常见问题与课堂照片分类文案已改为前端静态数据（src/data/training-*.ts）。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { TRAINING_GALLERY_CATEGORIES } from "@/data/training-gallery";

export async function GET() {
  const ctx = getContext();
  const trainingRepo = ctx.trainingRepo;

  // 课程 + 期次
  const course = await trainingRepo.getActiveCourse();
  const schedules = course ? await trainingRepo.listSchedules(course.id) : [];

  // 讲师/团队 — 并行查询
  const [instructors, team] = await Promise.all([
    trainingRepo.listFeaturedInstructors(),
    trainingRepo.listTeamMembers(),
  ]);

  // 照片按分类组装（分类名称与描述来自前端静态数据，仅图片查库）
  const gallery = await Promise.all(
    TRAINING_GALLERY_CATEGORIES.map(async (cat) => ({
      ...cat,
      images: await trainingRepo.listGalleryImagesByCategory(cat.id),
    })),
  );

  return NextResponse.json({
    course,
    schedules,
    instructors: { featured: instructors, team },
    gallery,
  });
}
