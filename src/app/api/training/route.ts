/**
 * 培训模块路由
 * Training module routes
 *
 * @module app/api/training/route
 * @description 从 Express routes/training.routes.ts 迁移。
 *              包含报名、落地页数据、下载追踪、订单创建等功能。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/server/db/context";
import { requireUserKey } from "@/server/middleware/auth";
import { createTrainingOrder } from "@/server/services/training-payment";

// ── 错误码定义 ──
const ApiErrorCode = {
  INVALID_PARAMS: 40008,
  TRAINING_COURSE_NOT_FOUND: 40402,
  TRAINING_PRICE_INVALID: 40009,
  TRAINING_PROVIDER_UNAVAILABLE: 40010,
  TRAINING_GATEWAY_ERROR: 50002,
  INTERNAL_ERROR: 50000,
} as const;

function sendError(message: string, status: number, code: number) {
  return NextResponse.json(
    { code, message, error: message },
    { status },
  );
}

// ── GET 端点 ──
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const ctx = getContext();
  const trainingRepo = ctx.trainingRepo;

  // GET /api/training/landing — 落地页数据聚合
  if (url.pathname.endsWith("/landing")) {
    const course = await trainingRepo.getActiveCourse();
    const schedules = course ? await trainingRepo.listSchedules(course.id) : [];
    const featured = await trainingRepo.listFeaturedInstructors();
    const team = await trainingRepo.listTeamMembers();
    const categories = await trainingRepo.listGalleryCategories();

    // 组装每个分类的照片列表
    const gallery = await Promise.all(
      categories.map(async (cat) => {
        const images = await trainingRepo.listGalleryImagesByCategory(cat.id);
        return {
          id: cat.id,
          name_zh: cat.name_zh,
          name_en: cat.name_en,
          description_zh: cat.description_zh,
          description_en: cat.description_en,
          images: images.map((img) => ({ image_path: img.image_path })),
        };
      }),
    );

    const testimonials = await trainingRepo.listTestimonials();
    const faqs = await trainingRepo.listFaqs();

    return NextResponse.json({
      course: course
        ? {
            id: course.id,
            name_zh: course.name_zh,
            name_en: course.name_en,
            description_zh: course.description_zh,
            description_en: course.description_en,
            unit_price: Number(course.unit_price || 0),
            currency: course.currency || "CNY",
            includes: Array.isArray(course.includes) ? course.includes : safeParseJson(course.includes),
          }
        : null,
      schedules: schedules.map((s) => ({
        id: s.id,
        period_number: s.period_number,
        start_date: s.start_date,
        city: s.city,
        format: s.format,
        status: s.status,
        capacity: s.capacity,
        enrolled_count: s.enrolled_count,
      })),
      instructors: {
        featured: featured.map((i) => ({
          id: i.id,
          name_zh: i.name_zh,
          name_en: i.name_en,
          roles: Array.isArray(i.roles) ? i.roles : safeParseJson(i.roles, []),
          title_zh: i.title_zh,
          title_en: i.title_en,
          bio_zh: i.bio_zh,
          bio_en: i.bio_en,
          avatar_path: i.avatar_path,
        })),
        team: team.map((m) => ({
          id: m.id,
          name_zh: m.name_zh,
          name_en: m.name_en,
          title_zh: m.title_zh,
          title_en: m.title_en,
          roles: Array.isArray(m.roles) ? m.roles : safeParseJson(m.roles, []),
          avatar_path: m.avatar_path,
        })),
      },
      gallery,
      testimonials: testimonials.map((t) => ({
        id: t.id,
        quote_zh: t.quote_zh,
        quote_en: t.quote_en,
        author_name: t.author_name,
        author_title: t.author_title,
      })),
      faqs: faqs.map((f) => ({
        id: f.id,
        question_zh: f.question_zh,
        question_en: f.question_en,
        answer_zh: f.answer_zh,
        answer_en: f.answer_en,
      })),
    });
  }

  // GET /api/training/downloads/stats — 下载统计
  if (url.pathname.endsWith("/downloads/stats")) {
    const stats = await trainingRepo.listDownloadStats();
    return NextResponse.json(stats);
  }

  return NextResponse.json({ code: 40404, message: "Not found" }, { status: 404 });
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const ctx = getContext();
  const trainingRepo = ctx.trainingRepo;

  if (url.pathname.endsWith("/register")) {
    const body = await req.json();
    const result = await trainingRepo.insertRegistration(body);
    return NextResponse.json({ success: true, id: result }, { status: 201 });
  }

  if (url.pathname.endsWith("/downloads/track")) {
    const { material_id, file_name } = await req.json();
    const count = await trainingRepo.incrementDownloadCount(material_id, file_name);
    return NextResponse.json({ success: true, count });
  }

  // 订单相关端点需要认证
  const auth = await requireUserKey(req);
  if (auth instanceof Response) return auth;

  if (url.pathname.endsWith("/orders")) {
    const body = await req.json();
    const orderNo = await trainingRepo.createOrder({ ...body, user_key: auth.userKey });
    return NextResponse.json({ success: true, order_no: orderNo }, { status: 201 });
  }

  // /orders/:order_no/mock-paid
  if (url.pathname.match(/\/orders\/[^/]+\/mock-paid$/)) {
    const orderNo = url.pathname.split("/").slice(-2, -1)[0];
    const order = await trainingRepo.findOrderByNo(orderNo);
    if (!order) return NextResponse.json({ code: 40044, message: "订单不存在" }, { status: 404 });
    if (order.user_key !== auth.userKey) return NextResponse.json({ code: 40003, message: "无权操作" }, { status: 403 });
    await trainingRepo.updateOrderStatus(orderNo, "paid");
    return NextResponse.json({ success: true });
  }

  // /orders/:order_no/participants (POST)
  if (url.pathname.match(/\/orders\/[^/]+\/participants$/) && req.method === "POST") {
    const orderNo = url.pathname.split("/").slice(-2, -1)[0];
    const body = await req.json();
    // Add participants logic
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ code: 40404, message: "Not found" }, { status: 404 });
}

/** 安全解析 JSON 列（失败时返回兜底值） */
function safeParseJson<T>(value: string | null, fallback: T = [] as unknown as T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
