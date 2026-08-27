/**
 * GET /api/training/landing — 培训着陆页数据
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";

export async function GET() {
  const ctx = getContext();
  const trainingRepo = ctx.trainingRepo;
  const [course, schedules] = await Promise.all([
    trainingRepo.getActiveCourse(),
    trainingRepo.getActiveCourse().then((c) => (c ? trainingRepo.listSchedules(c.id) : [])),
  ]);
  return NextResponse.json({ course, schedules });
}
