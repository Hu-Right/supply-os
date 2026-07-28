import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { fetchUnspscIndustries, fetchUnspscChildren } from "@/features/procurement/api";
import { server } from "@/__tests__/mocks/server";

// UNSPSC 级联 API 的 lang 查询参数策略：fr/ru/es/ar 需要后端译文才传 lang，
// zh/en 直接用类目表原列不传（与 UNSPSC_API_LANGS 白名单一致）
describe("procurement api — UNSPSC lang query param", () => {
  it("appends lang for fr/ru/es/ar and omits it for zh/en", async () => {
    const urls: string[] = [];
    server.use(
      http.get("/api/unspsc/industries", ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json([]);
      }),
      http.get("/api/unspsc/children", ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json([]);
      })
    );

    await fetchUnspscIndustries("fr");
    expect(urls.at(-1)).toContain("/api/unspsc/industries?lang=fr");

    await fetchUnspscIndustries("zh");
    expect(urls.at(-1)).not.toContain("lang=");

    await fetchUnspscChildren("42", "ar");
    expect(urls.at(-1)).toContain("parent_id=42");
    expect(urls.at(-1)).toContain("lang=ar");

    // en 同 zh：原文语言不请求译文
    await fetchUnspscChildren("42", "en");
    expect(urls.at(-1)).toContain("parent_id=42");
    expect(urls.at(-1)).not.toContain("lang=");
  });
});
