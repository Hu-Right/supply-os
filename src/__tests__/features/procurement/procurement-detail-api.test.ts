import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { fetchNoticeDetail, fetchUnlockedNoticeIds } from "@/features/procurement/api";
import { server } from "@/__tests__/mocks/server";

// 注意：fetchNoticeDetail 现按 URL 缓存成功结果，各用例必须使用不同 noticeId

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
    await expect(fetchNoticeDetail(43, "uk_test")).rejects.toThrow("NOTICE_DETAIL_403");
  });

  it("caches successful results per notice/user (single request)", async () => {
    let hits = 0;
    server.use(
      http.get("/api/notices/:id/detail", () => {
        hits += 1;
        return HttpResponse.json({ id: 44, core_locked: false });
      })
    );
    await fetchNoticeDetail(44, "uk_cache");
    await fetchNoticeDetail(44, "uk_cache");
    expect(hits).toBe(1);
  });

  it("does not cache failures: refetches after 403 then succeeds", async () => {
    server.use(
      http.get("/api/notices/:id/detail", () =>
        HttpResponse.json({ error: "NOTICE_LOCKED" }, { status: 403 })
      )
    );
    await expect(fetchNoticeDetail(45, "uk_retry")).rejects.toThrow("NOTICE_DETAIL_403");

    server.use(
      http.get("/api/notices/:id/detail", () =>
        HttpResponse.json({ id: 45, core_locked: false })
      )
    );
    const result = await fetchNoticeDetail(45, "uk_retry");
    expect(result.core_locked).toBe(false);
  });
});

describe("fetchUnlockedNoticeIds", () => {
  it("maps unlock rows to notice ids", async () => {
    server.use(
      http.get("/api/notices/unlocks", () =>
        HttpResponse.json([
          { notice_id: 7, unlock_type: "free" },
          { notice_id: 9, unlock_type: "single" },
          { notice_id: null, unlock_type: "free" },
        ])
      )
    );
    await expect(fetchUnlockedNoticeIds("uk_a")).resolves.toEqual([7, 9]);
  });

  it("returns empty array on server error", async () => {
    server.use(
      http.get("/api/notices/unlocks", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 })
      )
    );
    await expect(fetchUnlockedNoticeIds("uk_b")).resolves.toEqual([]);
  });
});
