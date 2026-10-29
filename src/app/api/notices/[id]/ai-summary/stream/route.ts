/**
 * POST /api/notices/:id/ai-summary/stream — AI 拆标摘要流式输出（SSE）
 *
 * @module app/api/notices/[id]/ai-summary/stream/route
 * @description SSE 逐 token 推送 AI 分析结果。缓存命中时一次性推送完整 JSON。
 *              V2 权益（2026-09-21）：摘要不再要求解锁；免费档（rank0）不走逐 token
 *              流式（避免未脱敏片段直达前端），改走非流式生成后整体脱敏、
 *              以单条 SSE 消息推送（前端解析协议不变）。
 */
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS, EC_PAID_QUOTA_REQUIRED } from "@/shared/constants/api";
import { getOrGenerateAiSummary, streamAiSummary } from "@/lib/services/ai-summary";
import { AiSummaryRepo } from "@/lib/repos/ai-summary.repo";
import { consumeAiActionQuota, AiQuotaExceededError } from "@/lib/services/ai-quota";
import {
  AI_SUMMARY_BENEFIT, AI_SUMMARY_FULL_LEVEL, AI_SUMMARY_MIN_VIEW_LEVEL, AI_SUMMARY_QUOTA_BENEFIT,
  maskSummaryForFree,
} from "@/lib/services/benefit-matrix";

export const POST = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);
    const { id } = await params;
    const noticeId = Number(id);
    if (!Number.isFinite(noticeId) || noticeId <= 0) {
      routeError(400, EC_INVALID_PARAMS, "无效的公告 ID");
    }

    const ctx = getContext();

    const summaryLevel = await ctx.benefitSystemRepo.levelForUser(auth.userId, AI_SUMMARY_BENEFIT);

    // 低档（level<1）：不生成不推送摘要，只回 locked（只看原文），不消耗 LLM
    if (summaryLevel < AI_SUMMARY_MIN_VIEW_LEVEL) {
      const enc = new TextEncoder();
      const lockedStream = new ReadableStream({
        start(controller) {
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ locked: true })}\n\n`));
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return sseResponse(lockedStream);
    }

    // 部分脱敏档：非流式生成 + 整体脱敏 + 单条推送（按矩阵 ai_summary 层级判定）
    if (summaryLevel < AI_SUMMARY_FULL_LEVEL) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const result = await getOrGenerateAiSummary(ctx.dbPool, auth.userId, noticeId);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ ...maskSummaryForFree(result), masked: true })}\n\n`),
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : "未知错误";
            console.error(`[ai-summary/stream] 脱敏生成失败 notice=${noticeId} user=${auth.userId}:`, msg);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
          } finally {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          }
        },
      });
      return sseResponse(stream);
    }

    // 完整档逐 token 流式：生成前扣月度计量（ai_summary_quota，个人 30/月、企业/人工/内部不限）。
    // 计量要在开流**之前**做完——额度不足直接回 402 HTTP 错误（前端客户端读 body.message 呈现），
    // 而不是流内 error 消息。缓存命中（有非空结果，与 streamAiSummary 命中口径一致）不产生
    // LLM 成本，同样不扣；脱敏档（level=1，free）路径不计量。
    const cachedRow = await new AiSummaryRepo(ctx.dbPool).find(auth.userId, noticeId);
    const willGenerate = !cachedRow || !String(cachedRow.core_deliverables || "").trim();
    if (willGenerate) {
      try {
        await consumeAiActionQuota(ctx.dbPool, { catalog: ctx.benefitSystemRepo, write: ctx.benefitWriteRepo }, {
          userId: auth.userId,
          benefitCode: AI_SUMMARY_QUOTA_BENEFIT,
        });
      } catch (err) {
        if (err instanceof AiQuotaExceededError) {
          routeError(402, EC_PAID_QUOTA_REQUIRED, "本月 AI 摘要生成次数已用完，请升级套餐或下月再试", {
            feature: AI_SUMMARY_BENEFIT,
            benefit_code: AI_SUMMARY_QUOTA_BENEFIT,
          });
        }
        throw err;
      }
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamAiSummary(ctx.dbPool, auth.userId, noticeId)) {
            controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          const msg = err instanceof Error ? err.message : "未知错误";
          console.error(`[ai-summary/stream] 流式生成失败 notice=${noticeId} user=${auth.userId}:`, msg);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return sseResponse(stream);
  },
);

function sseResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
