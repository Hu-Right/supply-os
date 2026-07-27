import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import {
  fetchIndustryPrefs,
  saveIndustryPrefs,
  fetchRecommendedNotices,
} from "@/features/procurement/api";
import { server } from "@/__tests__/mocks/server";

describe("fetchIndustryPrefs", () => {
  it("returns prefs object with user_key in query", async () => {
    let capturedUrl = "";
    server.use(
      http.get("/api/user/industry-prefs", ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          prefs: { level1_id: 102, level2_id: 1548, level3_id: null, level4_id: null, level5_id: null },
        });
      })
    );
    const prefs = await fetchIndustryPrefs("vip@qq.com");
    expect(capturedUrl).toContain("user_key=vip%40qq.com");
    expect(prefs).toMatchObject({ level1_id: 102, level2_id: 1548 });
  });

  it("returns null when user has no prefs", async () => {
    server.use(
      http.get("/api/user/industry-prefs", () => HttpResponse.json({ prefs: null }))
    );
    await expect(fetchIndustryPrefs("free@qq.com")).resolves.toBeNull();
  });

  it("returns null on server error (never blocks the page)", async () => {
    server.use(
      http.get("/api/user/industry-prefs", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 })
      )
    );
    await expect(fetchIndustryPrefs("uk_err")).resolves.toBeNull();
  });
});

describe("saveIndustryPrefs", () => {
  it("posts user_key with level ids", async () => {
    let capturedBody: any = null;
    server.use(
      http.post("/api/user/industry-prefs", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ success: true }, { status: 201 });
      })
    );
    const res = await saveIndustryPrefs("vip@qq.com", { level1_id: 102, level2_id: 1548 });
    expect(res.ok).toBe(true);
    expect(capturedBody).toMatchObject({
      user_key: "vip@qq.com",
      level1_id: 102,
      level2_id: 1548,
    });
  });

  it("clears prefs when level1_id is null", async () => {
    let capturedBody: any = null;
    server.use(
      http.post("/api/user/industry-prefs", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ success: true, cleared: true });
      })
    );
    await saveIndustryPrefs("vip@qq.com", { level1_id: null });
    expect(capturedBody).toMatchObject({ user_key: "vip@qq.com", level1_id: null });
  });
});

describe("fetchRecommendedNotices", () => {
  it("requests recommended endpoint with user_key and pagination", async () => {
    let capturedUrl = "";
    server.use(
      http.get("/api/notices/recommended", ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          items: [{ id: 1, title: "Match", match_score: 3 }],
          total: 1,
          page: 1,
          pageSize: 9,
        });
      })
    );
    const json = await fetchRecommendedNotices({ userKey: "vip@qq.com", page: 1, pageSize: 9 });
    expect(capturedUrl).toContain("user_key=vip%40qq.com");
    expect(capturedUrl).toContain("page=1");
    expect(capturedUrl).toContain("page_size=9");
    expect(json.total).toBe(1);
    expect(json.items?.[0]?.match_score).toBe(3);
  });

  it("throws on server error", async () => {
    server.use(
      http.get("/api/notices/recommended", () =>
        HttpResponse.json({ error: "USER_REQUIRED" }, { status: 400 })
      )
    );
    await expect(
      fetchRecommendedNotices({ userKey: "", page: 1, pageSize: 9 })
    ).rejects.toThrow("Request failed: 400");
  });

  it("is not cached: each call hits the server (interest codes evolve)", async () => {
    let hits = 0;
    server.use(
      http.get("/api/notices/recommended", () => {
        hits += 1;
        return HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 9 });
      })
    );
    await fetchRecommendedNotices({ userKey: "uk_fresh", page: 1, pageSize: 9 });
    await fetchRecommendedNotices({ userKey: "uk_fresh", page: 1, pageSize: 9 });
    expect(hits).toBe(2);
  });
});
