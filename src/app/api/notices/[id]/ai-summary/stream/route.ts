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
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { getOrGenerateAiSummary, streamAiSummary } from "@/lib/services/ai-summary";
import { AI_SUMMARY_BENEFIT, AI_SUMMARY_FULL_LEVEL, maskSummaryForFree } from "@/lib/services/benefit-matrix";

export const POST = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);
    const { id } = await params;
    const noticeId = Number(id);
    if (!Number.isFinite(noticeId) || noticeId <= 0) {
      routeError(400, EC_INVALID_PARAMS, "无效的公告 ID");
    }

    const ctx = getContext();

    // 部分脱敏档：非流式生成 + 整体脱敏 + 单条推送（按矩阵 ai_summary 层级判定）
    const summaryLevel = await ctx.benefitSystemRepo.levelForUser(auth.userId, AI_SUMMARY_BENEFIT);
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
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
          } finally {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          }
        },
      });
      return sseResponse(stream);
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
