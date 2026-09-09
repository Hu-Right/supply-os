/**
 * 数字人客服类型定义与工具函数
 * Digital Assistant Types & Utilities
 *
 * @module features/crm/hooks/chat-types
 * @description 从 useDigitalAssistant.ts 提取的类型定义和纯工具函数，
 *              降低主 hook 文件认知负荷，同时提供独立可测试的工具函数。
 */

// ── 类型定义 ──

/** 消息角色 */
export type MessageRole = "user" | "assistant" | "system";

/** 单条聊天消息 */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  /** 是否为历史消息（AI → 人工转接时保留） */
  isHistory?: boolean;
}

/** 附件元数据（上传接口返回值子集） */
export interface AttachmentMeta {
  url: string;
  name: string;
  type: string;
}

/** 客服会话模式 */
export type AssistantMode = "ai" | "waiting" | "human";

/** 快捷操作类型 */
export type QuickActionType = "match" | "query_leads" | "lead_status" | "opp_help" | "request_human";

/** 撮合阶段 */
export type MatchPhase = "idle" | "selecting" | "matching" | "done";

/** Hook 入参 */
export interface UseDigitalAssistantOptions {
  /** 当前线索数（用于上下文） */
  leadCount?: number;
  /** 当前活跃线索数 */
  activeLeadCount?: number;
  /** 供应商列表（AI 撮合用） */
  suppliers?: import("@/types").Supplier[];
  /** 商机列表（AI 撮合用） */
  opportunities?: import("@/types").Opportunity[];
}

// ── 工具函数 ──

let _msgCounter = 0;

/** 生成唯一消息 ID */
export function genMsgId(): string {
  return `msg_${Date.now()}_${++_msgCounter}`;
}

/** 从消息 metadata（DB JSON 列，可能是字符串）中提取附件内容标记 */
export function attachmentMarkerFromMetadata(metadata: unknown): string {
  let meta: unknown = metadata;
  if (typeof metadata === "string") {
    try {
      meta = JSON.parse(metadata);
    } catch {
      return "";
    }
  }
  const att = (meta as { attachment?: unknown } | null)?.attachment;
  if (!att || typeof att !== "object") return "";
  try {
    return ` [attachment:${JSON.stringify(att)}]`;
  } catch {
    return "";
  }
}
