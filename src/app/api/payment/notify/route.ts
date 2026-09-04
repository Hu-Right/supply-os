/**
 * 支付异步通知路由（支付宝/微信）
 * Payment async notification routes (Alipay/Wechat)
 *
 * @module app/api/payment/notify/route
 * @description ARCH-B+（2026-09-01）：通过 Orchestrator 统一入口，
 *              根据订单号前缀自动路由至对应业务服务。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";

// ── POST /api/payment/notify/alipay — 支付宝异步通知 ──
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const path = url.pathname;

  // POST /api/payment/notify/alipay
  if (path.endsWith("/alipay")) {
    try {
      const ctx = getContext();
      const { orchestrator } = ctx.payment;

      // 解析 form-urlencoded body
      const body = await req.formData();
      const params: Record<string, string> = {};
      body.forEach((value: FormDataEntryValue, key: string) => {
        params[key] = String(value);
      });

      const signature = params.sign || "";
      const result = await orchestrator.handleNotify("alipay", params, signature);

      // 支付宝期望返回纯文本 "success" 或 "fail"
      return new Response(result.success ? "success" : "fail", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    } catch (err) {
      console.error("[Alipay Notify Error]", err);
      return new Response("fail", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  }

  // POST /api/payment/notify/wechat
  if (path.endsWith("/wechat")) {
    try {
      const ctx = getContext();
      const { orchestrator } = ctx.payment;

      const body = await req.json();
      const signature = req.headers.get("wechatpay-signature") || "";
      const result = await orchestrator.handleNotify("wechat", body, signature);

      return NextResponse.json({
        code: result.success ? "SUCCESS" : "FAIL",
        message: result.message || "",
      });
    } catch (err) {
      console.error("[Wechat Notify Error]", err);
      return NextResponse.json({ code: "FAIL", message: "" });
    }
  }

  return NextResponse.json({ code: 40404, message: "通知路由不存在" }, { status: 404 });
}
