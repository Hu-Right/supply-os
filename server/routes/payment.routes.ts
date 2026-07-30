/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import crypto from "crypto";
import { Router } from "express";
import type { AppContext } from "../context";
import { normalizeUserKey } from "../utils/normalize";
import { getPaymentRuntimeConfig } from "../config/env";
import { NOTICE_TRANSLATION_LANGS, pendingNoticeTranslations, translateNoticeViaChain } from "../services/notice-translation";

export function createPaymentRouter(ctx: AppContext): Router {
  const router = Router();
  const { dbPool, paymentService, paymentMode } = ctx;

  router.post("/api/billing/subscribe", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.body.user_key) || ""; // 本地差异 #7：F.1 归一化收敛
      const planCode = String(req.body.plan_code || "single");
      if (!userKey) return res.status(400).json({ error: "\u8bf7\u5148\u767b\u5f55" });

      const plans: Record<string, { days: number | null; price: number; quota: number }> = {
        single: { days: null, price: 89, quota: 1 },
        trial_3: { days: null, price: 99, quota: 3 },
        week_21: { days: 7, price: 299, quota: 21 },
        annual: { days: 365, price: 5600, quota: 1095 },
      };
      const plan = plans[planCode] || plans.single;
      await dbPool.execute(
        `INSERT INTO crm_user_subscriptions (user_id, user_key, plan_code, status, started_at, expires_at)
         VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, 'active', NOW(), ${plan.days ? "DATE_ADD(NOW(), INTERVAL ? DAY)" : "NULL"})`,
        plan.days ? [userKey, userKey, planCode, plan.days] : [userKey, userKey, planCode]
      );
      await dbPool.execute("UPDATE crm_users SET membership_tier = 'vip', updated_at = NOW() WHERE user_key = ?", [userKey]);
      res.status(201).json({ success: true, plan_code: planCode, price: plan.price, quota: plan.quota, membership_tier: "vip" });
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
      const status = String(req.query.status || "").trim();
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
      const page = Math.max(1, Number(req.query.page || 1));
      const offset = (page - 1) * limit;
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });

      const params: any[] = [userKey];
      const countParams: any[] = [userKey];
      let where = "WHERE o.user_key = ?";
      if (status) {
        where += " AND o.status = ?";
        params.push(status);
        countParams.push(status);
      }
      params.push(limit, offset);

      const [countRows] = await dbPool.query(
        `SELECT COUNT(*) AS total
         FROM crm_payment_orders o
         ${where}`,
        countParams,
      );

      const [rows] = await dbPool.query(
        `SELECT
           o.order_no, o.user_key, o.provider, o.plan_code, o.notice_id, o.amount, o.currency,
           o.status, o.provider_trade_no, o.paid_at, o.created_at, o.updated_at,
           n.notice_id AS external_notice_id, n.source_channel, n.reference, n.title,
           n.notice_type, n.agency, n.agency_full, n.country, n.deadline, n.urgency, n.url, n.industry
         FROM crm_payment_orders o
         LEFT JOIN crm_bid_notices n ON n.id = o.notice_id
         ${where}
         ORDER BY o.id DESC
         LIMIT ? OFFSET ?`,
        params,
      );

      res.json({
        total: Number((countRows as any[])[0]?.total || 0),
        page,
        limit,
        list: (rows as any[]).map((row) => ({
          order_no: row.order_no,
          user_key: row.user_key,
          provider: row.provider,
          plan_code: row.plan_code,
          notice_id: row.notice_id,
          amount: Number(row.amount || 0),
          currency: row.currency,
          status: row.status,
          provider_trade_no: row.provider_trade_no,
          paid_at: row.paid_at,
          created_at: row.created_at,
          updated_at: row.updated_at,
          notice: row.notice_id ? {
            id: row.notice_id,
            notice_id: row.external_notice_id,
            source_channel: row.source_channel,
            reference: row.reference,
            title: row.title,
            notice_type: row.notice_type,
            agency: row.agency || row.agency_full,
            agency_full: row.agency_full,
            country: row.country,
            deadline: row.deadline,
            urgency: row.urgency,
            url: row.url,
            industry: row.industry,
          } : null,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/api/payment/unlocks", async (req, res) => {
    try {
      const userKey = normalizeUserKey(req.query.user_key) || ""; // 本地差异 #7：F.1 归一化收敛
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
      const page = Math.max(1, Number(req.query.page || 1));
      const offset = (page - 1) * limit;
      if (!userKey) return res.status(400).json({ error: "USER_REQUIRED" });

      // 可选 lang：附带公告标题译文（与详情翻译共用缓存表；本地差异 #18：en 也可翻——
      // 中文原文公告在英文环境需反向英译，英文原文由链层直通返回不耗 API）
      const lang = String(req.query.lang || "").toLowerCase();
      const translatable = !!NOTICE_TRANSLATION_LANGS[lang];

      const [countRows] = await dbPool.query(
        `SELECT COUNT(*) AS total
         FROM crm_opportunity_unlocks u
         WHERE u.user_key = ? AND u.notice_id IS NOT NULL`,
        [userKey],
      );

      // translatable 时多取 n.description（仅供后台补翻用，不返回）与缓存译文标题
      const [rows] = await dbPool.query(
        translatable
          ? `SELECT
               u.user_key, u.notice_id, u.unlock_type, u.price, u.unlocked_at,
               n.notice_id AS external_notice_id, n.source_channel, n.reference, n.title,
               n.notice_type, n.agency, n.agency_full, n.country, n.deadline, n.deadline_ts, n.urgency, n.url, n.industry,
               n.description, tr.title_tr AS title_i18n
             FROM crm_opportunity_unlocks u
             LEFT JOIN crm_bid_notices n ON n.id = u.notice_id
             LEFT JOIN crm_notice_translations tr ON tr.notice_id = u.notice_id AND tr.lang = ?
             WHERE u.user_key = ? AND u.notice_id IS NOT NULL
             ORDER BY u.id DESC
             LIMIT ? OFFSET ?`
          : `SELECT
               u.user_key, u.notice_id, u.unlock_type, u.price, u.unlocked_at,
               n.notice_id AS external_notice_id, n.source_channel, n.reference, n.title,
               n.notice_type, n.agency, n.agency_full, n.country, n.deadline, n.deadline_ts, n.urgency, n.url, n.industry
             FROM crm_opportunity_unlocks u
             LEFT JOIN crm_bid_notices n ON n.id = u.notice_id
             WHERE u.user_key = ? AND u.notice_id IS NOT NULL
             ORDER BY u.id DESC
             LIMIT ? OFFSET ?`,
        translatable ? [lang, userKey, limit, offset] : [userKey, limit, offset],
      );

      res.json({
        total: Number((countRows as any[])[0]?.total || 0),
        page,
        limit,
        list: (rows as any[]).map((row) => ({
          user_key: row.user_key,
          notice_id: row.notice_id,
          unlock_type: row.unlock_type,
          price: Number(row.price || 0),
          unlocked_at: row.unlocked_at,
          notice: row.notice_id ? {
            id: row.notice_id,
            notice_id: row.external_notice_id,
            source_channel: row.source_channel,
            reference: row.reference,
            title: row.title,
            title_i18n: translatable ? row.title_i18n ?? null : undefined,
            notice_type: row.notice_type,
            agency: row.agency || row.agency_full,
            agency_full: row.agency_full,
            country: row.country,
            deadline: row.deadline,
            // 公采搜索功能（本地差异 #6：需求 2 解锁页过期标记）——
            // deadline 为自由文本前端无法判过期，服务端按 deadline_ts 算好
            // （秒/毫秒混存，先折算成毫秒再与 Date.now() 比较）
            deadline_expired: row.deadline_ts
              ? (Number(row.deadline_ts) > 100000000000
                  ? Number(row.deadline_ts)
                  : Number(row.deadline_ts) * 1000) < Date.now()
              : null,
            urgency: row.urgency,
            url: row.url,
            industry: row.industry,
          } : null,
        })),
      });

      // 缺译行响应后逐条后台补翻（标题+描述整条入库，与详情端点缓存互通；
      // pendingNoticeTranslations 按 noticeId:lang 去重，翻译链全不可用时静默跳过）
      if (translatable) {
        void (async () => {
          for (const row of rows as any[]) {
            if (!row.notice_id || row.title_i18n || !String(row.title || "").trim()) continue;
            const pendingKey = `${row.notice_id}:${lang}`;
            if (pendingNoticeTranslations.has(pendingKey)) continue;
            const pending = translateNoticeViaChain(
              String(row.title || ""),
              String(row.description || ""),
              lang
            );
            pendingNoticeTranslations.set(pendingKey, pending);
            pending.finally(() => pendingNoticeTranslations.delete(pendingKey)).catch(() => undefined);
            try {
              const { translations, provider } = await pending;
              await dbPool.query(
                `INSERT INTO crm_notice_translations (notice_id, lang, title_tr, description_tr, model)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE title_tr = VALUES(title_tr), description_tr = VALUES(description_tr), model = VALUES(model)`,
                [row.notice_id, lang, translations[0], translations[1], provider]
              );
            } catch {
              // 翻译不可用或失败：保持英文原文，下次请求重试
            }
          }
        })();
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/api/payment/alipay/redirect/:orderNo", async (req, res) => {
    try {
      const orderNo = String(req.params.orderNo || "");
      const [rows] = await dbPool.query(
        "SELECT order_no, provider, status, pay_url FROM crm_payment_orders WHERE order_no = ? LIMIT 1",
        [orderNo]
      );
      const order = (rows as any[])[0];
      if (!order) return res.status(404).send("Order not found");
      if (order.provider !== "alipay") return res.status(400).send("Not an Alipay order");
      if (order.status !== "pending") return res.status(400).send("Order is not pending");

      res.redirect(302, order.pay_url);
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
      const [rows] = await dbPool.query(
        `SELECT provider, mode, app_id, merchant_id, notify_url, is_active
         FROM crm_payment_provider_configs
         WHERE is_active = 1
         ORDER BY provider, id DESC`
      );
      const configs = rows as any[];
      const runtime = getPaymentRuntimeConfig();
      res.json({
        ...runtime,
        active_provider_configs: configs.map((item) => ({
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
            source: runtime.providers.alipay.configured ? "env" : configs.some((item) => item.provider === "alipay") ? "database_config_only" : "none",
          },
          wechat: {
            ...runtime.providers.wechat,
            source: runtime.providers.wechat.configured ? "env" : configs.some((item) => item.provider === "wechat") ? "database_config_only" : "none",
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

      const [planRows] = await dbPool.query(
        "SELECT plan_code, name, price, currency FROM crm_membership_plans WHERE plan_code = ? AND is_active = 1 LIMIT 1",
        [planCode]
      );
      const plan = (planRows as any[])[0];
      if (!plan) return res.status(404).json({ error: "PLAN_NOT_FOUND" });
      const providerConfigured = provider === "alipay"
        ? Boolean(process.env.ALIPAY_APP_ID && process.env.ALIPAY_PRIVATE_KEY && process.env.ALIPAY_NOTIFY_URL)
        : Boolean(process.env.WECHAT_MCH_ID && process.env.WECHAT_APP_ID && process.env.WECHAT_API_V3_KEY && process.env.WECHAT_NOTIFY_URL);
      const paymentMode = providerConfigured ? "configured" : "mock";

      const orderNo = `PAY${Date.now()}${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      const fakePayUrl = `/api/payments/${orderNo}/mock-paid`;
      await dbPool.execute(
        `INSERT INTO crm_payment_orders
          (user_id, order_no, user_key, provider, plan_code, notice_id, amount, currency, status, pay_url, raw_request)
         VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [userKey, orderNo, userKey, provider, planCode, noticeId, plan.price, plan.currency || "CNY", fakePayUrl, JSON.stringify(req.body || {})]
      );
      res.status(201).json({
        success: true,
        order_no: orderNo,
        provider,
        plan_code: planCode,
        plan_name: plan.name,
        amount: Number(plan.price),
        currency: plan.currency || "CNY",
        status: "pending",
        payment_mode: paymentMode,
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
      const [orderRows] = await dbPool.query(
        "SELECT * FROM crm_payment_orders WHERE order_no = ? LIMIT 1",
        [orderNo]
      );
      const order = (orderRows as any[])[0];
      if (!order) return res.status(404).json({ error: "ORDER_NOT_FOUND" });
      if (order.status !== "paid") {
        const [planRows] = await dbPool.query(
          "SELECT duration_days, plan_type, unlock_quota FROM crm_membership_plans WHERE plan_code = ? LIMIT 1",
          [order.plan_code]
        );
        const plan = (planRows as any[])[0] || {};
        await dbPool.execute(
          `UPDATE crm_payment_orders
           SET status = 'paid', provider_trade_no = ?, raw_notify = ?, paid_at = NOW(), updated_at = NOW()
           WHERE order_no = ?`,
          [`MOCK-${orderNo}`, JSON.stringify(req.body || { mock: true }), orderNo]
        );
        const unlockQuota = Math.max(1, Number(plan.unlock_quota || 1));
        await dbPool.execute(
          `INSERT INTO crm_user_entitlements
            (user_id, user_key, source_order_no, plan_code, quota_total, quota_used, started_at, expires_at, status)
           VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, 0, NOW(), ${plan.duration_days ? "DATE_ADD(NOW(), INTERVAL ? DAY)" : "NULL"}, 'active')`,
          plan.duration_days
            ? [order.user_key, order.user_key, orderNo, order.plan_code, unlockQuota, plan.duration_days]
            : [order.user_key, order.user_key, orderNo, order.plan_code, unlockQuota]
        );
        if (plan.plan_type !== "single") {
          await dbPool.execute(
            `INSERT INTO crm_user_subscriptions (user_id, user_key, plan_code, status, started_at, expires_at)
             VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, 'active', NOW(), ${plan.duration_days ? "DATE_ADD(NOW(), INTERVAL ? DAY)" : "NULL"})`,
            plan.duration_days ? [order.user_key, order.user_key, order.plan_code, plan.duration_days] : [order.user_key, order.user_key, order.plan_code]
          );
          await dbPool.execute("UPDATE crm_users SET membership_tier = 'vip', updated_at = NOW() WHERE user_key = ?", [order.user_key]);
        }
        if (order.notice_id) {
          await dbPool.execute(
            `INSERT INTO crm_notice_interests (user_id, user_key, notice_id, interest_type, source)
             VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, 'subscribed', 'payment')
             ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), updated_at = NOW()`,
            [order.user_key, order.user_key, order.notice_id]
          );
        }
      }
      res.json({ success: true, order_no: orderNo, status: "paid" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
