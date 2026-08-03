/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 支付路由层（薄入口）
 * @description 仅负责参数解析、校验与响应组装；数据访问走 PaymentsRepo，
 *              历史查询映射走 services/paymentHistory，履约编排走 services/paymentFulfillment。
 */
import crypto from "crypto";
import { Router } from "express";
import type { AppContext } from "../context";
import { normalizeUserKey } from "../utils/normalize";
import { getPaymentRuntimeConfig } from "../config/env";
import { PaymentsRepo } from "../repos/payments.repo";
import { MembershipRepo } from "../repos/membership.repo";
import { listOrderHistory, listUnlockHistory } from "../services/paymentHistory";
import { activateSubscription, fulfillMockPayment, createLegacyOrder } from "../services/paymentFulfillment";

export function createPaymentRouter(ctx: AppContext): Router {
  const router = Router();
  const { dbPool, paymentService, paymentMode } = ctx;
  // 测试 ctx 可能仅注入 dbPool，此处兜底构造（repo 只是 pool 的薄封装）
  const paymentsRepo = ctx.paymentsRepo ?? new PaymentsRepo(dbPool);
  const membershipRepo = ctx.membershipRepo ?? new MembershipRepo(dbPool);

  router.post("/api/billing/subscribe", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.body.user_key) || ""; // 本地差异 #7：F.1 归一化收敛
      const planCode = String(req.body.plan_code || "single");
      if (!userKey) return res.status(400).json({ error: "\u8bf7\u5148\u767b\u5f55" });

      const { price, quota } = await activateSubscription(paymentsRepo, { userKey, planCode });
      res.status(201).json({ success: true, plan_code: planCode, price, quota, membership_tier: "vip" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========== Payment API ===========

  // POST /api/payment/orders - 创建支付订单
  router.post("/api/payment/orders", async (req, res) => {
    try {
      const result = await paymentService.createOrder(dbPool, {
        user_key: normalizeUserKey(req.body.user_key) || "", // 本地差异 #7：F.1 归一化收敛
        plan_code: String(req.body.plan_code || ""),
        notice_id: req.body.notice_id ? Number(req.body.notice_id) : null,
        provider: (paymentMode === "live" && ["alipay", "wechat"].includes(req.body.provider) ? req.body.provider : "mock") as any,
        return_url: String(req.body.return_url || ""),
      });
      const clientPayUrl = result.provider === "alipay"
        ? `/api/payment/alipay/redirect/${encodeURIComponent(result.order_no)}`
        : result.pay_url;
      res.status(201).json({
        ...result,
        pay_url: clientPayUrl,
        qr_code_url: result.provider === "alipay" ? clientPayUrl : result.qr_code_url,
        payment_mode: paymentMode === "live" ? "configured" : "mock",
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get("/api/payment/orders", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.query.user_key) || ""; // 本地差异 #7：F.1 归一化收敛
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });
      res.json(await listOrderHistory(paymentsRepo, {
        userKey,
        status: String(req.query.status || "").trim(),
        limit: Math.min(100, Math.max(1, Number(req.query.limit || 20))),
        page: Math.max(1, Number(req.query.page || 1)),
      }));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/api/payment/unlocks", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.query.user_key) || ""; // 本地差异 #7：F.1 归一化收敛
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });
      // 可选 lang：附带公告标题译文（与详情翻译共用缓存表；本地差异 #18：en 也可翻——
      // 中文原文公告在英文环境需反向英译，英文原文由链层直通返回不耗 API）
      res.json(await listUnlockHistory(paymentsRepo, {
        userKey,
        lang: String(req.query.lang || ""),
        limit: Math.min(100, Math.max(1, Number(req.query.limit || 20))),
        page: Math.max(1, Number(req.query.page || 1)),
      }));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/api/payment/alipay/redirect/:orderNo", async (req, res) => {
    try {
      const order = await paymentsRepo.findByOrderNo(String(req.params.orderNo || ""));
      if (!order) return res.status(404).send("Order not found");
      if (order.provider !== "alipay") return res.status(400).send("Not an Alipay order");
      if (order.status !== "pending") return res.status(400).send("Order is not pending");

      res.redirect(302, order.pay_url!);
    } catch (err: any) {
      res.status(500).send(err.message || "Alipay redirect failed");
    }
  });

  // GET /api/payment/orders/:orderNo - 查询订单状态
  router.get("/api/payment/orders/:orderNo", async (req, res) => {
    try {
      const result = await paymentService.queryOrder(dbPool, req.params.orderNo, String(req.query.trade_no || ""));
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/payment/notify/alipay - 支付宝异步通知
  router.post("/api/payment/notify/alipay", async (req, res) => {
    try {
      const result = await paymentService.handleNotify(dbPool, "alipay", req.body, "");
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
      const result = await paymentService.handleNotify(dbPool, "wechat", req.body, signature);
      res.json({ code: result.success ? "SUCCESS" : "FAIL", message: result.message || "" });
    } catch (err: any) {
      console.error("[Wechat Notify Error]", err);
      res.json({ code: "FAIL", message: err.message });
    }
  });

  const paymentConfigStatusHandler = async (_req: any, res: any) => {
    try {
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
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  router.get("/api/payment/config-status", paymentConfigStatusHandler);
  router.get("/api/payments/config-status", paymentConfigStatusHandler);

  router.post("/api/payments/create", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.body.user_key) || ""; // 本地差异 #7：F.1 归一化收敛（原不做 trim/lower）
      const provider = req.body.provider === "wechat" ? "wechat" : "alipay";
      const planCode = String(req.body.plan_code || "single_89");
      const noticeId = req.body.notice_id ? Number(req.body.notice_id) : null;
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });

      const providerConfigured = provider === "alipay"
        ? Boolean(process.env.ALIPAY_APP_ID && process.env.ALIPAY_PRIVATE_KEY && process.env.ALIPAY_NOTIFY_URL)
        : Boolean(process.env.WECHAT_MCH_ID && process.env.WECHAT_APP_ID && process.env.WECHAT_API_V3_KEY && process.env.WECHAT_NOTIFY_URL);
      const mode = providerConfigured ? "configured" : "mock";

      const orderNo = `PAY${Date.now()}${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      const fakePayUrl = `/api/payments/${orderNo}/mock-paid`;
      const created = await createLegacyOrder(paymentsRepo, membershipRepo, {
        userKey,
        provider,
        planCode,
        noticeId,
        orderNo,
        payUrl: fakePayUrl,
        rawRequest: JSON.stringify(req.body || {}),
      });
      if (!created) return res.status(404).json({ error: "PLAN_NOT_FOUND" });
      res.status(201).json({
        success: true,
        order_no: orderNo,
        provider,
        plan_code: planCode,
        plan_name: created.planName,
        amount: created.amount,
        currency: created.currency,
        status: "pending",
        payment_mode: mode,
        pay_url: fakePayUrl,
        qr_code_url: fakePayUrl,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/api/payments/:orderNo/mock-paid", async (req, res) => {
    try {
      const orderNo = String(req.params.orderNo || "");
      const { found } = await fulfillMockPayment(paymentsRepo, membershipRepo, {
        orderNo,
        rawNotify: JSON.stringify(req.body || { mock: true }),
      });
      if (!found) return res.status(404).json({ error: "ORDER_NOT_FOUND" });
      res.json({ success: true, order_no: orderNo, status: "paid" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
