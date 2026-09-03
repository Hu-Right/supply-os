/**
 * 推荐反馈采集 API
 * Recommendation feedback API functions
 */
import { api } from "@/core/http";

/** 反馈动作类型 */
export type NoticeFeedbackAction =
  | "impression"
  | "click"
  | "dismiss"
  | "favorite"
  | "dwell"
  | "scroll_end"
  | "quick_exit"
  | "revisit";

/** 单条反馈 */
export interface NoticeFeedbackItem {
  notice_id: number;
  action: NoticeFeedbackAction;
  variant?: string;
  dwell_ms?: number;
}

const SESSION_ID_KEY = "supply-os:feedback-session-id";
export const getFeedbackSessionId = (): string => {
  try {
    let sid = sessionStorage.getItem(SESSION_ID_KEY);
    if (!sid) {
      sid = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_ID_KEY, sid);
    }
    return sid;
  } catch {
    return fallbackSessionId;
  }
};
const fallbackSessionId = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

export const sendNoticeFeedback = (
  userId: number,
  actions: NoticeFeedbackItem[]
): Promise<void> => {
  // userId 仅作登录态门控；身份归属由 JWT 承载（后端忽略 body 中的身份参数）
  if (!userId || actions.length === 0) return Promise.resolve();
  return api("/api/notices/feedback", {
    method: "POST",
    body: {
      session_id: getFeedbackSessionId(),
      actions: actions.slice(0, 50),
    },
  })
    .then(() => undefined)
    .catch(() => undefined);
};
