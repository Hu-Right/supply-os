/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 支付路由层（薄入口）
 * @description 仅负责参数解析、校验与响应组装；数据访问走 PaymentsRepo，
 *              历史查询映射走 services/paymentHistory，履约编排走 services/paymentFulfillment。
 */
import { Router } from "express";
import type { AppContext } from "../context";
import { normalizeUserKey } from "../utils/normalize";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { getPaymentRuntimeConfig } from "../config/env";
import { listOrderHistory, listUnlockHistory } from "../services/paymentHistory";
import { activateSubscription, fulfillMockPayment } from "../payment/fulfillment";
import { toQrDataUrl } from "../payment/qr";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "./admin/middleware";

export function createPaymentRouter(ctx: AppContext): Router {
  const router = Router();
  // 双轨制退役（轨道A）：统一走领域上下文 ctx.payment；原顶层字段与 ?? 兜底构造已移除
  // （bootstrap 保证领域上下文完整注入，兜底不再必要）
  const { paymentService, paymentMode } = ctx.payment;
  const paymentsRepo = ctx.payment.paymentsRepo;
  const membershipRepo = ctx.payment.membershipRepo;

  // P1-4 修复：billing/subscribe 需要管理员密钥，防止免费开通 VIP
  router.post("/api/billing/subscribe", asyncHandler(async (req, res) => {
    const adminKey = String(req.body.admin_key || req.headers["x-admin-key"] || "");
    const expectedAdminKey = process.env.ADMIN_SECRET_KEY || "";
    if (!expectedAdminKey || adminKey !== expectedAdminKey) {
      return res.status(403).json({ error: "ADMIN_AUTH_REQUIRED", message: "此端点需要管理员密钥" });
    }
    const userKey = normalizeUserKey(req.body.user_key) || "";
    const planCode = String(req.body.plan_code || "single");
    if (!userKey) return res.status(400).json({ error: "\u8bf7\u5148\u767b\u5f55" });

    // 套餐以 crm_membership_plans 为唯一事实源：不存在/已下架时 404
    const result = await activateSubscription(paymentsRepo, membershipRepo, { userKey, planCode });
    if (!result) return res.status(404).json({ error: "PLAN_NOT_FOUND" });
    res.status(201).json({ success: true, plan_code: planCode, price: result.price, quota: result.quota, membership_tier: "vip" });
  }));

  // =========== Payment API ===========

  // POST /api/payment/orders - 创建支付订单
  // B1 退役准备（高危端点升级）：requireAuth 强制 JWT 身份，订单归属取自 req.userKey，
  // 杜绝 body.user_key 为任意用户创建订单的伪造风险（见《legacy 通道清点报告》§2.2）。
  // 前端 api() 已自动携带 JWT，行为向后兼容。
  router.post("/api/payment/orders", requireAuth, asyncHandler(async (req, res) => {
    try {
      const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "";
      // 与研修班 resolveProvider 对齐：live 模式下仅接受已开通渠道名，其余明确拒绝（不回退 mock）
      const requestedProvider = String(req.body.provider || "");
      if (paymentMode === "live" && requestedProvider !== "alipay" && requestedProvider !== "wechat") {
        throw new HttpError(400, "PAYMENT_PROVIDER_UNAVAILABLE");
      }
      const provider = (paymentMode === "live" ? requestedProvider : "mock") as import("../../src/types").PaymentProviderName;
      const result = await paymentService.createOrder({
        user_key: req.userKey,
        plan_code: String(req.body.plan_code || ""),
        notice_id: req.body.notice_id ? Number(req.body.notice_id) : null,
        provider,
        return_url: String(req.body.return_url || ""),
        client_ip: clientIp,
        // 升级订单：服务端据此校验升级资格并按差价计费
        order_type: req.body.order_type === "upgrade" ? "upgrade" : "new",
        original_plan_code: String(req.body.original_plan_code || ""),
      });
      const clientPayUrl = result.provider === "alipay"
        ? `/api/payment/alipay/redirect/${encodeURIComponent(result.order_no)}`
        : result.pay_url;
      // 零跳转弹窗支付：必须使用支付渠道返回的原生二维码（如支付宝当面付 precreate）
      // 如果没有原生二维码，直接报错，不回退到跳转端点二维码
      if (!result.qr_code_url) {
        throw new HttpError(500, "PAYMENT_QR_CODE_MISSING");
      }
      const qrCodeUrl = await toQrDataUrl(result.qr_code_url);
      res.status(201).json({
        ...result,
        pay_url: clientPayUrl,
        qr_code_url: qrCodeUrl,
        payment_mode: paymentMode === "live" ? "configured" : "mock",
      });
    } catch (err: any) {
      // 屏蔽技术性错误信息（如 "Unsupported payment provider: wechat"），返回用户友好提示
      const raw = String(err.message || "");
      const friendly = raw.includes("Unsupported payment provider")
        ? "PAYMENT_PROVIDER_UNAVAILABLE"
        : raw.includes("PAYMENT_QR_CODE_MISSING")
        ? "支付宝二维码生成失败，请确认已开通“当面付”产品后重试"
        : raw;
      throw new HttpError(400, friendly);
    }
  }));

  // P0-5 安全修复：订单列表必须 JWT 认证，身份取自 req.userKey（禁止 query user_key 冒充）
  router.get("/api/payment/orders", requireAuth, asyncHandler(async (req, res) => {
    const userKey = req.userKey || "";
    if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });
    res.json(await listOrderHistory(paymentsRepo, {
      userKey,
      status: String(req.query.status || "").trim(),
      limit: Math.min(100, Math.max(1, Number(req.query.limit || 20))),
      page: Math.max(1, Number(req.query.page || 1)),
    }));
  }));

  // P0-5 安全修复：解锁历史必须 JWT 认证
  router.get("/api/payment/unlocks", requireAuth, asyncHandler(async (req, res) => {
    const userKey = req.userKey || "";
    // 可选 lang：附带公告标题译文（与详情翻译共用缓存表；本地差异 #18：en 也可翻——
    // 中文原文公告在英文环境需反向英译，英文原文由链层直通返回不耗 API）
    res.json(await listUnlockHistory(paymentsRepo, {
      userKey,
      lang: String(req.query.lang || ""),
      limit: Math.min(100, Math.max(1, Number(req.query.limit || 20))),
      page: Math.max(1, Number(req.query.page || 1)),
    }));
  }));

  router.get("/api/payment/alipay/redirect/:orderNo", asyncHandler(async (req, res) => {
    const order = await paymentsRepo.findByOrderNo(String(req.params.orderNo || ""));
    if (!order) return res.status(404).send("Order not found");
    if (order.provider !== "alipay") return res.status(400).send("Not an Alipay order");
    if (order.status !== "pending") return res.status(400).send("Order is not pending");

    // Alipay SDK pageExecute 返回的是自动提交的 HTML 表单（含 <form> + <script>auto-submit</script>），
    // 必须用 res.send() 渲染此 HTML，浏览器加载后自动 POST 到支付宝网关完成跳转。
    // 不可用 res.redirect()——那会把 HTML 字符串当作 URL 导致跳转失败。
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(order.pay_url!);
  }));

  // GET /api/payment/orders/:orderNo - 查询订单状态
  // P0-5 安全修复：身份强制取自 req.userKey（JWT），不再允许 query user_key 优先于 JWT
  router.get("/api/payment/orders/:orderNo", requireAuth, asyncHandler(async (req, res) => {
    const userKey = req.userKey || "";
    if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });
    // 先查询订单归属
    const order = await paymentsRepo.findByOrderNo(req.params.orderNo);
    if (!order) return res.status(404).json({ error: "ORDER_NOT_FOUND" });
    if (order.user_key !== userKey) return res.status(403).json({ error: "FORBIDDEN" });
    const result = await paymentService.queryOrder(req.params.orderNo, String(req.query.trade_no || ""));
    res.json(result);
  }));

  // POST /api/payment/notify/alipay - 支付宝异步通知
  // P1-1 修复：从 req.body.sign 提取签名，不再硬编码空串
  router.post("/api/payment/notify/alipay", async (req, res) => {
    try {
      const signature = String(req.body?.sign || "");
      const result = await paymentService.handleNotify("alipay", req.body, signature);
      res.send(result.success ? "success" : "fail");
    } catch (err: any) {
      console.error("[Alipay Notify Error]", err);
      res.send("fail");
    }
  });

  // POST /api/payment/notify/wechat - 微信支付异步通知
  router.post("/api/payment/notify/wechat", async (req, res) => {
    try {
      const signature = String(req.headers["wechatpay-signature"] || "");
      const result = await paymentService.handleNotify("wechat", req.body, signature);
      res.json({ code: result.success ? "SUCCESS" : "FAIL", message: result.message || "" });
    } catch (err) {
      console.error("[Wechat Notify Error]", err);
      res.json({ code: "FAIL", message: "" });
    }
  });

  const paymentConfigStatusHandler = asyncHandler(async (_req: any, res: any) => {
    const configs = await paymentsRepo.listActiveProviderConfigs();
    const runtime = getPaymentRuntimeConfig();
    res.json({
      ...runtime,
      active_provider_configs: configs.map((item: any) => ({
        provider: item.provider,
        mode: item.mode,
        app_id: item.app_id ? `${String(item.app_id).slice(0, 6)}***` : null,
        merchant_id: item.merchant_id ? `${String(item.merchant_id).slice(0, 6)}***` : null,
        notify_url: item.notify_url || null,
        is_active: Boolean(item.is_active),
      })),
      note: runtime.live_enabled
        ? "PAYMENT_MODE=live: 下单会请求真实支付策略；真实付款成功需要支付平台异步通知或主动查询落库。"
        : "PAYMENT_MODE 未设置为 live: 下单会强制走 mock，方便本地闭环测试，不会调支付宝/微信真实网关。",
      providers: {
        ...runtime.providers,
        alipay: {
          ...runtime.providers.alipay,
          source: runtime.providers.alipay.configured ? "env" : configs.some((item: any) => item.provider === "alipay") ? "database_config_only" : "none",
        },
        wechat: {
          ...runtime.providers.wechat,
          source: runtime.providers.wechat.configured ? "env" : configs.some((item: any) => item.provider === "wechat") ? "database_config_only" : "none",
        },
      },
      required_env: {
        alipay: ["ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY", "ALIPAY_PUBLIC_KEY", "ALIPAY_NOTIFY_URL"],
        wechat: ["WECHAT_APP_ID", "WECHAT_MCH_ID \u6216 WECHAT_MERCHANT_ID", "WECHAT_API_V3_KEY", "WECHAT_PRIVATE_KEY", "WECHAT_NOTIFY_URL"],
      },
    });
  });

  // P3-2/P3-3 安全修复：config-status 分级——
  // 公共端点仅下发前端 UI 决策所需的最小字段（provider 是否 configured），
  // 不再暴露 app_id 片段/notify_url/mode/required_env 等内部配置；
  // 完整诊断信息移至 requireAdmin 保护的管理端点
  //
  // configured 以“策略已注册”为准（密钥可解析才会注册），而非仅环境变量存在：
  // 占位符密钥不会再被误报为已开通
  const publicConfigStatusHandler = asyncHandler(async (_req: any, res: any) => {
    const live = paymentMode === "live";
    res.json({
      providers: {
        alipay: { configured: live && paymentService.hasStrategy("alipay") },
        wechat: { configured: live && paymentService.hasStrategy("wechat") },
      },
    });
  });

  router.get("/api/payment/config-status", publicConfigStatusHandler);
  router.get("/api/payments/config-status", requireAdmin, paymentConfigStatusHandler);

  // 双轨制下线（2026-08-20）：legacy 下单端点 POST /api/payments/create 已删除。
  // 下单唯一入口为 POST /api/payment/orders（PaymentService，支持升级订单/策略引擎/事务履约）；
  // mock 闭环由下方 /api/payments/:orderNo/mock-paid 承担（新旧订单通用履约入口，保留）。

  // P0-3 安全修复：mock-paid 仅在 mock 模式下注册，防止 live 模式下一键已支付真实订单
  if (paymentMode !== "live") {
    router.post("/api/payments/:orderNo/mock-paid", asyncHandler(async (req, res) => {
      const orderNo = String(req.params.orderNo || "");
      const { found } = await fulfillMockPayment(paymentsRepo, membershipRepo, {
        orderNo,
        rawNotify: JSON.stringify(req.body || { mock: true }),
      });
      if (!found) return res.status(404).json({ error: "ORDER_NOT_FOUND" });
      res.json({ success: true, order_no: orderNo, status: "paid" });
    }));
  }

  return router;
}
