/**
 * GET  /api/user/llm-config — 获取用户 LLM 配置（api_key 掩码）
 * PUT  /api/user/llm-config — 保存/更新用户 LLM 配置
 *
 * @module app/api/user/llm-config/route
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError, parseJson } from "@/lib/middleware/route-handler";
import { LlmConfigRepo } from "@/lib/repos/llm-config.repo";
import { saveLlmConfig } from "@/lib/services/ai-summary";
import { extractClientIp } from "@/lib/utils/ip";

/** 出站 URL 校验：仅允许 https 公网地址（拒绝环回/私有/保留段）；供子路由（/test）复用同一合规口径 */
export const OutboundUrl = z.string().url().refine(
  (u) => /^https:\/\/(?!localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)[a-zA-Z0-9.-]+(:\d+)?/.test(u),
  { message: "Base URL 必须为 HTTPS 公网地址" },
);

const putSchema = z.object({
  providerName: z.string().min(1).max(100).default("Custom"),
  baseUrl: OutboundUrl,
  apiKey: z.string().min(1).max(500),
  model: z.string().min(1).max(100),
  // 合规：BYOK 模式下公告原文与企业/工厂画像将发送至用户自配的第三方端点，必须显式授权（fail-closed）
  outboundConsent: z.boolean().refine((v) => v === true, { message: "请先勾选数据出站授权" }),
});

export const GET = withRoute(async (req) => {
  const auth = await requireUserKeyOrThrow(req);
  const pool = getContext().dbPool;
  const repo = new LlmConfigRepo(pool);
  const row = await repo.findActiveByUser(auth.userId);
  if (!row) {
    return NextResponse.json({ code: 0, message: "ok", data: { configured: false } });
  }
  // api_key 掩码：仅保留末 4 位（密文本身不可逆推明文）
  const masked = `****${row.api_key.slice(-4)}`;
  return NextResponse.json({
    code: 0, message: "ok",
    data: {
      configured: true,
      providerName: row.provider_name,
      baseUrl: row.base_url,
      model: row.model,
      apiKeyMasked: masked,
      isActive: row.is_active === 1,
    },
  });
});

export const PUT = withRoute(async (req) => {
  const auth = await requireUserKeyOrThrow(req);
  const body = await parseJson(req, putSchema);
  const pool = getContext().dbPool;
  try {
    await saveLlmConfig(pool, auth.userId, body.providerName, body.baseUrl, body.apiKey, body.model);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "LLM_KEY_SECRET_NOT_CONFIGURED") {
      routeError(500, 50000, "服务端未配置加密密钥，无法保存");
    }
    throw err;
  }

  // 合规审计：出站授权同意留痕（crm_consent_log）；失败不阻断主流程
  try {
    await getContext().user.authRepo.recordConsentLog({
      userId: auth.userId,
      consentType: "llm_outbound_data",
      documentVersion: "V1.0",
      action: "agree",
      ipAddress: extractClientIp(req),
      userAgent: req.headers.get("user-agent") || "",
    });
  } catch (err) {
    console.error("[llm-config] 出站授权审计记录失败:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ code: 0, message: "ok" });
});
