/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from "express";
import type { AppContext } from "../context";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { OpportunitiesRepo } from "../repos/opportunities.repo";
import { ApiErrorCode, sendError } from "../utils/http-error";
import {
  createTrainingOrder,
  queryTrainingOrderStatus,
  fulfillTrainingOrder,
} from "../services/training-payment";

export function createTrainingRouter(ctx: AppContext): Router {
  const router = Router();
  const trainingRepo = ctx.trainingRepo;
  const opportunitiesRepo = ctx.opportunitiesRepo;

  // 6b. TRAINING SEMINAR REGISTRATION
  router.post("/api/training/register", asyncHandler(async (req, res) => {
      const {
        company_name,
        industry_id,
        main_product,
        export_experience,
        certification,
        contact_name,
        position,
        telephone,
        email,
        remark,
      } = req.body;

      if (!company_name || !contact_name || !telephone) {
        return sendError(res, 400, ApiErrorCode.INVALID_PARAMS, "企业名称、参会人姓名、手机号码为必填项");
      }

      let industryName = "";
      if (industry_id) {
        const industryCode = await opportunitiesRepo.findUnspscCodeById(industry_id);
        if (industryCode) {
          industryName = industryCode.title_zh || industryCode.title || "";
        }
      }

      const registrationId = await trainingRepo.insertRegistration({
        companyName: company_name,
        industryId: industry_id || null,
        industry: industryName,
        mainProduct: main_product || "",
        exportExperience: export_experience || "",
        certification: certification || "",
        contactName: contact_name,
        position: position || "",
        telephone,
        email: email || "",
        remark: remark || "",
        ip: req.ip || req.socket?.remoteAddress || "127.0.0.1",
      });

      return res.status(201).json({
        success: true,
        id: registrationId,
        message: "\u7814\u4fee\u73ed\u62a5\u540d\u4fe1\u606f\u5df2\u63d0\u4ea4",
      });
  }));

  // 6c. 研修班文件下载次数追踪
  // P3-11 安全修复：下载计数持久化到数据库（原内存 Record 重启即丢失）
  router.post("/api/training/downloads/track", asyncHandler(async (req, res) => {
    const materialId = String(req.body.material_id || "").slice(0, 60);
    const fileName = String(req.body.file_name || "").slice(0, 120);
    if (!materialId) return sendError(res, 400, ApiErrorCode.INVALID_PARAMS, "material_id required");
    const total = await trainingRepo.incrementDownloadCount(materialId, fileName);
    console.log(`[Download] ${materialId} | ${fileName} | total=${total}`);
    return res.json({ success: true, material_id: materialId, total });
  }));

  router.get("/api/training/downloads/stats", asyncHandler(async (_req, res) => {
    res.json(await trainingRepo.listDownloadStats());
  }));

  // ── 落地页数据聚合 API（全部 DB 驱动，无种子数据） ──
  // 6a. LANDING PAGE DATA：一次性返回课程/期次/讲师/团队/照片/反馈/FAQ
  router.get("/api/training/landing", asyncHandler(async (_req, res) => {
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

    res.json({
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
  }));

  // 6d. CREATE TRAINING ORDER：创建培训支付订单（金额从 DB 读取）
  // P0-6 安全修复：支付订单必须 JWT 认证，身份取自 req.userKey（禁止未登录下单）
  router.post("/api/training/orders", requireAuth, asyncHandler(async (req, res) => {
    try {
      const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "";
      // 站点对外访问基址（反代优先），供服务端生成可扫码的绝对二维码链接
      const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "http").split(",")[0].trim();
      const host = String(req.headers["host"] || "");
      const baseUrl = host ? `${proto}://${host}` : "";
      const result = await createTrainingOrder(ctx, trainingRepo, {
        courseId: Number(req.body.course_id || 0),
        scheduleId: req.body.schedule_id ? Number(req.body.schedule_id) : null,
        registrationId: req.body.registration_id ? Number(req.body.registration_id) : null,
        participantCount: Number(req.body.participant_count || 1),
        provider: String(req.body.provider || "alipay"),
        contactName: String(req.body.contact_name || ""),
        telephone: String(req.body.telephone || ""),
        clientIp,
        baseUrl,
      });
      res.status(201).json({ success: true, ...result });
    } catch (err: any) {
      const raw = String(err.message || "");
      if (raw === "COURSE_NOT_FOUND") {
        return sendError(res, 404, ApiErrorCode.TRAINING_COURSE_NOT_FOUND, "课程不存在或已下架");
      }
      if (raw === "COURSE_PRICE_INVALID") {
        return sendError(res, 400, ApiErrorCode.TRAINING_PRICE_INVALID, "课程价格配置无效");
      }
      if (raw === "PAYMENT_PROVIDER_UNAVAILABLE") {
        // 与会员区对齐：渠道未开通时明确拒绝（不回退 mock），前端展示友好提示
        return sendError(res, 400, ApiErrorCode.TRAINING_PROVIDER_UNAVAILABLE, "当前支付方式暂未开通，请选择其他支付方式或联系我们");
      }
      if (raw === "PAYMENT_GATEWAY_ERROR") {
        // 网关创建支付链接失败（密钥无效等）：不落空订单，前端展示友好提示
        return sendError(res, 503, ApiErrorCode.TRAINING_GATEWAY_ERROR, "支付通道暂时不可用，请稍后重试或联系我们");
      }
      if (raw === "PAYMENT_QR_CODE_MISSING") {
        // 二维码生成失败（未开通当面付等）：不落空订单，前端展示友好提示
        return sendError(res, 503, ApiErrorCode.TRAINING_GATEWAY_ERROR, "支付宝二维码生成失败，请确认已开通「当面付」产品后重试");
      }
      // 未预料的错误（数据库瞬时故障等）：记录日志并返回友好提示，不暴露内部细节
      console.error("[TrainingOrders] 未预料的错误:", err);
      return sendError(res, 500, ApiErrorCode.INTERNAL_ERROR, "系统繁忙，请稍后重试");
    }
  }));

  // 6d-1. ALIPAY REDIRECT：支付宝 page.pay 表单渲染端点（同会员区 /api/payment/alipay/redirect）
  // 二维码扫码/点击后访问此处，服务端返回自动提交的 HTML 表单跳转至支付宝收银台
  router.get("/api/training/orders/:order_no/alipay-redirect", asyncHandler(async (req, res) => {
    const order = await trainingRepo.findOrderByNo(String(req.params.order_no || ""));
    if (!order) return res.status(404).send("Order not found");
    if (order.provider !== "alipay") return res.status(400).send("Not an Alipay order");
    if (order.status !== "pending") return res.status(400).send("Order is not pending");
    if (!order.pay_url) return res.status(400).send("Payment url missing");

    // Alipay SDK pageExecute 返回的是自动提交的 HTML 表单（含 <form> + <script>auto-submit</script>），
    // 必须用 res.send() 渲染此 HTML，浏览器加载后自动 POST 到支付宝网关完成跳转。
    // 不可用 res.redirect()——那会把 HTML 字符串当作 URL 导致跳转失败。
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(order.pay_url);
  }));

  // 6e. QUERY TRAINING ORDER：查询培训订单状态（pending 时主动轮询网关）
  router.get("/api/training/orders/:order_no", asyncHandler(async (req, res) => {
    try {
      const result = await queryTrainingOrderStatus(ctx, trainingRepo, String(req.params.order_no || ""));
      res.json(result);
    } catch (err: any) {
      if (String(err.message || "") === "ORDER_NOT_FOUND") {
        return sendError(res, 404, ApiErrorCode.TRAINING_ORDER_NOT_FOUND, "订单不存在");
      }
      throw err;
    }
  }));

  // 6f. MOCK PAID（仅 mock 模式）：模拟培训订单支付成功
  if (ctx.payment.paymentMode !== "live") {
    router.post("/api/training/orders/:order_no/mock-paid", asyncHandler(async (req, res) => {
      const orderNo = String(req.params.order_no || "");
      const order = await trainingRepo.findOrderByNo(orderNo);
      if (!order) return sendError(res, 404, ApiErrorCode.TRAINING_ORDER_NOT_FOUND, "订单不存在");
      await fulfillTrainingOrder(trainingRepo, orderNo, `MOCK-${orderNo}`);
      res.json({ success: true, order_no: orderNo, status: "paid" });
    }));
  }

  // 6g. SAVE PARTICIPANTS：保存学员信息（支付完成后）
  router.post("/api/training/orders/:order_no/participants", requireAuth, asyncHandler(async (req, res) => {
    const orderNo = String(req.params.order_no || "");
    const order = await trainingRepo.findOrderByNo(orderNo);
    
    if (!order) {
      return sendError(res, 404, ApiErrorCode.TRAINING_ORDER_NOT_FOUND, "订单不存在");
    }
    
    // 验证订单状态必须为 paid
    if (order.status !== "paid") {
      return sendError(res, 400, ApiErrorCode.TRAINING_ORDER_NOT_PAID, "订单尚未支付，无法保存学员信息");
    }
    
    // 验证订单归属（防止越权）
    if (order.user_key !== req.userKey) {
      return sendError(res, 403, ApiErrorCode.TRAINING_ORDER_FORBIDDEN, "无权操作此订单");
    }
    
    const participants = req.body.participants;
    if (!Array.isArray(participants) || participants.length === 0) {
      return sendError(res, 400, ApiErrorCode.TRAINING_PARTICIPANTS_INVALID, "学员信息不能为空");
    }
    
    // 验证学员数量与订单的 participant_count 一致
    if (participants.length !== order.participant_count) {
      return sendError(
        res, 
        400, 
        ApiErrorCode.TRAINING_PARTICIPANTS_COUNT_MISMATCH, 
        `学员数量不匹配：订单要求 ${order.participant_count} 人，实际提交 ${participants.length} 人`
      );
    }
    
    // 验证每个学员的必填字段
    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      if (!p.full_name || !p.full_name.trim()) {
        return sendError(res, 400, ApiErrorCode.TRAINING_PARTICIPANTS_INVALID, `第 ${i + 1} 位学员姓名不能为空`);
      }
    }
    
    // 保存学员信息
    await trainingRepo.saveParticipants(order.id, participants);
    
    res.json({ 
      success: true, 
      message: "学员信息保存成功",
      order_no: orderNo,
      participant_count: participants.length
    });
  }));

  // 6h. GET PARTICIPANTS：查询学员信息
  router.get("/api/training/orders/:order_no/participants", requireAuth, asyncHandler(async (req, res) => {
    const orderNo = String(req.params.order_no || "");
    const order = await trainingRepo.findOrderByNo(orderNo);
    
    if (!order) {
      return sendError(res, 404, ApiErrorCode.TRAINING_ORDER_NOT_FOUND, "订单不存在");
    }
    
    // 验证订单归属（防止越权）
    if (order.user_key !== req.userKey) {
      return sendError(res, 403, ApiErrorCode.TRAINING_ORDER_FORBIDDEN, "无权查看此订单");
    }
    
    const participants = await trainingRepo.getParticipantsByOrderId(order.id);
    
    res.json({ 
      success: true,
      order_no: orderNo,
      participants,
      participant_count: participants.length
    });
  }));

  return router;
}

/** 安全解析 JSON 列（失败时返回兑底值） */
function safeParseJson<T>(value: string | null, fallback: T = [] as unknown as T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
