import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { fetchNoticeDetail } from "@/features/procurement/api";
import { server } from "@/__tests__/mocks/server";

describe("fetchNoticeDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends user_key and returns unlocked detail", async () => {
    let capturedUrl = "";
    server.use(
      http.get("/api/notices/:id/detail", ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          id: 42,
          title: "Unlocked",
          core_locked: false,
          unlock_type: "subscription",
          contacts: [{ name: "Jane" }],
        });
      })
    );

    const result = await fetchNoticeDetail(42, "uk_test");
    expect(capturedUrl).toContain("user_key=uk_test");
    expect(result.id).toBe(42);
    expect(result.core_locked).toBe(false);
  });

  it("throws when notice is locked (403)", async () => {
    server.use(
      http.get("/api/notices/:id/detail", () =>
        HttpResponse.json({ error: "NOTICE_LOCKED", core_locked: true }, { status: 403 })
      )
    );
    await expect(fetchNoticeDetail(42, "uk_test")).rejects.toThrow();
  });
});
