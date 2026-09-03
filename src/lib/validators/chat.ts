/**
 * CRM 客服聊天输入校验 Schema
 *
 * @module lib/validators/chat
 * @description 审查 P0：chat 路由此前全部使用 `as` 类型断言，无输入校验、
 *              无长度上限。统一在此定义 zod schema，路由层与测试共用。
 */
import { z } from "zod";

/** 会话创建（转人工） */
export const chatSessionCreateSchema = z.object({
  customerName: z.string().max(100).optional(),
  leadId: z.string().max(64).optional(),
  locale: z.string().max(8).optional(),
  aiSummary: z.string().max(8000).optional(),
});

/** 消息发送（客户侧；role 由服务端强制为 customer，不接受客户端传入） */
export const chatMessageSendSchema = z.object({
  sessionId: z.number().int().positive(),
  content: z.string().trim().min(1).max(4000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** metadata 序列化后的体积上限（防止借 metadata 夹带大对象） */
export const METADATA_MAX_BYTES = 8 * 1024;

/** 校验 metadata 可序列化且不超限；不合法时返回 undefined */
export function sanitizeMetadata(
  metadata: unknown,
): Record<string, unknown> | undefined {
  if (metadata === null || metadata === undefined) return undefined;
  if (typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  try {
    if (JSON.stringify(metadata).length > METADATA_MAX_BYTES) return undefined;
  } catch {
    return undefined;
  }
  return metadata as Record<string, unknown>;
}
