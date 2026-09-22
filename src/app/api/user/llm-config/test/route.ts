/**
 * POST /api/user/llm-config/test — LLM 连接测试探测
 * @module app/api/user/llm-config/test/route
 * @description 用一次 max_tokens=1 的最小调用验证配置可用性，把厂商错误码
 *              翻译成用户可自助修复的中文提示（详见 test-connection 服务）。
 *              两种模式：
 *              1) 携带 baseUrl/apiKey/model → 测试"未保存"的表单配置（首次保存前即可验证）；
 *              2) 不带 apiKey（或无 body）→ 复用已存配置的 Key/Base URL 重测。
 *              模式 1 属于新数据出站，须显式勾选授权（与 PUT 的 fail-closed 合规口径一致）。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { resolveLlmCredentials } from "@/lib/services/ai/shared/llm-credentials";
import { testLlmConnection } from "@/lib/services/ai-summary/test-connection";
import { OutboundUrl } from "../route";

const postSchema = z.object({
  baseUrl: OutboundUrl.optional(),
  apiKey: z.string().min(1).max(500).optional(),
  model: z.string().min(1).max(100).optional(),
  outboundConsent: z.boolean().optional(),
});

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  // 空 body 视为"重测已存配置"（前端按钮可不带任何字段）
  let body: z.infer<typeof postSchema>;
  try {
    const raw = await req.json();
    body = postSchema.parse(raw ?? {});
  } catch {
    body = {};
  }

  const pool = getContext().dbPool;
  let target: { baseUrl: string; apiKey: string; model: string };

  if (body.apiKey) {
    // 测试未保存的新配置：明文 Key 仅在本次请求内存中使用，不落库
    if (body.outboundConsent !== true) {
      return NextResponse.json(
        { code: 40001, message: "请先勾选数据出站授权" },
        { status: 400 },
      );
    }
    if (!body.baseUrl || !body.model) {
      return NextResponse.json(
        { code: 40002, message: "测试新配置需同时填写 Base URL 与模型名称" },
        { status: 400 },
      );
    }
    target = { baseUrl: body.baseUrl, apiKey: body.apiKey, model: body.model };
  } else {
    const creds = await resolveLlmCredentials(pool, auth.userId);
    target = {
      baseUrl: creds.baseUrl,
      apiKey: creds.apiKey,
      model: body.model?.trim() || creds.model,
    };
  }

  const result = await testLlmConnection(target);
  if (!result.ok) {
    return NextResponse.json({ code: 50201, message: result.error }, { status: 400 });
  }
  return NextResponse.json({
    code: 0,
    message: "ok",
    data: { ok: true, model: result.model, latencyMs: result.latencyMs },
  });
});
