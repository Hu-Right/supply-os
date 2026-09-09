/**
 * 快捷操作回复映射与 AI 模拟回复逻辑
 * Quick Action Replies & AI Simulation
 *
 * @module features/crm/hooks/chat-replies
 * @description 从 useDigitalAssistant 提取的纯函数映射与模拟回复生成器，
 *              降低主 hook 认知负荷，便于单测覆盖。
 */
import type { QuickActionType } from "./chat-types";

/** 快捷操作 → 用户侧气泡文案工厂 */
export function quickActionUserMessage(
  action: QuickActionType,
  t: (key: string, vars?: Record<string, string>) => string,
  leadCount: number,
  activeLeadCount: number,
): string {
  const map: Record<QuickActionType, string> = {
    match: t("crmQuickActionMatch"),
    query_leads: t("crmQuickActionQueryLeads", { count: String(leadCount), active: String(activeLeadCount) }),
    lead_status: t("crmQuickActionLeadStatus", { active: String(activeLeadCount) }),
    opp_help: t("crmQuickActionOppHelp"),
    request_human: "",
  };
  return map[action];
}

/** 快捷操作 → AI 回复文案工厂 */
export function quickActionAiReply(
  action: Exclude<QuickActionType, "match">,
  t: (key: string, vars?: Record<string, string>) => string,
  leadCount: number,
): string {
  const map: Record<Exclude<QuickActionType, "match">, string> = {
    query_leads: t("crmAssistantReplyLeads", { count: String(leadCount) }),
    lead_status: t("crmAssistantReplyLeadStatus"),
    opp_help: t("crmAssistantReplyOpportunities"),
    request_human: "",
  };
  return map[action];
}

/** AI 模式关键词回复生成器 */
export function aiKeywordReply(
  text: string,
  t: (key: string, vars?: Record<string, string>) => string,
  leadCount: number,
): string {
  const lower = text.toLowerCase();
  if (lower.includes("线索") || lower.includes("lead")) {
    return t("crmAssistantReplyLeads", { count: String(leadCount) });
  }
  if (lower.includes("商机") || lower.includes("opportunity")) {
    return t("crmAssistantReplyOpportunities");
  }
  if (lower.includes("撮合") || lower.includes("match")) {
    return t("crmAssistantReplyMatch");
  }
  if (lower.includes("人工") || lower.includes("转接")) {
    return t("crmAssistantReplyHuman");
  }
  return t("crmAssistantReplyDefault");
}
