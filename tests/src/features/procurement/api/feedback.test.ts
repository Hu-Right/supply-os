/**
 * src/features/procurement/api/feedback.ts 测试
 * 覆盖 getFeedbackSessionId, sendNoticeFeedback
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/core/http", () => ({
  api: (...args: any[]) => apiMock(...args),
}));

import { getFeedbackSessionId, sendNoticeFeedback } from "@/features/procurement/api/feedback";

describe("getFeedbackSessionId", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("首次调用生成 session id", () => {
    const sid = getFeedbackSessionId();
    expect(sid).toMatch(/^s_/);
    expect(sid.length).toBeGreaterThan(5);
  });

  it("后续调用返回相同 id（缓存）", () => {
    const sid1 = getFeedbackSessionId();
    const sid2 = getFeedbackSessionId();
    expect(sid1).toBe(sid2);
  });

  it("sessionStorage 中已有值时直接使用", () => {
    sessionStorage.setItem("supply-os:feedback-session-id", "existing-sid");
    expect(getFeedbackSessionId()).toBe("existing-sid");
  });
});

describe("sendNoticeFeedback", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue(undefined);
  });

  it("空 userKey 不发送请求", async () => {
    await sendNoticeFeedback("", [{ notice_id: 1, action: "click" }]);
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("空 actions 不发送请求", async () => {
    await sendNoticeFeedback("user1", []);
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("有效参数发送 POST 请求", async () => {
    await sendNoticeFeedback("user1", [{ notice_id: 1, action: "click" }]);
    expect(apiMock).toHaveBeenCalledWith("/api/notices/feedback", {
      method: "POST",
      body: expect.objectContaining({
        session_id: expect.any(String),
        actions: [{ notice_id: 1, action: "click" }],
      }),
    });
  });

  it("actions 最多 50 条", async () => {
    const actions = Array.from({ length: 60 }, (_, i) => ({
      notice_id: i, action: "click" as const,
    }));
    await sendNoticeFeedback("user1", actions);
    const body = apiMock.mock.calls[0][1].body;
    expect(body.actions).toHaveLength(50);
  });

  it("异常静默吞没（不抛出）", async () => {
    apiMock.mockRejectedValue(new Error("Network error"));
    await expect(
      sendNoticeFeedback("user1", [{ notice_id: 1, action: "click" }]),
    ).resolves.toBeUndefined();
  });
});
