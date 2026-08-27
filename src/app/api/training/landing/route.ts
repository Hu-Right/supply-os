/**
 * GET /api/training/landing — 培训着陆页完整数据
 *
 * @module app/api/training/landing/route
 * @description 返回课程/期次/讲师/团队/照片/反馈/FAQ 全部数据。
 *              前端 LandingDataResponse 期望 6 个字段，缺一不可。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";

export async function GET() {
  const ctx = getContext();
  const trainingRepo = ctx.trainingRepo;

  // 课程 + 期次
  const course = await trainingRepo.getActiveCourse();
  const schedules = course ? await trainingRepo.listSchedules(course.id) : [];

  // 讲师/团队/照片/反馈/FAQ — 并行查询
  const [instructors, team, galleryCategories, testimonials, faqs] = await Promise.all([
    trainingRepo.listFeaturedInstructors(),
    trainingRepo.listTeamMembers(),
    trainingRepo.listGalleryCategories(),
    trainingRepo.listTestimonials(),
    trainingRepo.listFaqs(),
  ]);

  // 照片按分类组装
  const gallery = await Promise.all(
    galleryCategories.map(async (cat) => ({
      ...cat,
      images: await trainingRepo.listGalleryImagesByCategory(cat.id),
    })),
  );

  return NextResponse.json({
    course,
    schedules,
    instructors: { featured: instructors, team },
    gallery,
    testimonials,
    faqs,
  });
}
