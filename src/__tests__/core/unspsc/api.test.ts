import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { fetchUnspscIndustries, fetchUnspscChildren } from "@/core/unspsc/api";
import { clearApiCache } from "@/core/http";
import { server } from "@/__tests__/mocks/server";

const options = [{ value: "10", label: "Live Plant & Animal Material" }];

describe("UNSPSC API", () => {
  beforeEach(() => {
    // apiCached 有模块级 TTL 缓存，每个用例前清空避免互相污染
    clearApiCache();
  });

  describe("fetchUnspscIndustries", () => {
    it("appends lang for translatable locales", async () => {
      let capturedUrl = "";
      server.use(
        http.get("/api/unspsc/industries", ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(options);
        })
      );

      await fetchUnspscIndustries("fr");
      expect(capturedUrl).toContain("/api/unspsc/industries?lang=fr");

      clearApiCache();
      await fetchUnspscIndustries("ar");
      expect(capturedUrl).toContain("lang=ar");
    });

    it.each(["zh", "en", undefined])("omits lang for locale=%s", async (locale) => {
      let capturedUrl = "";
      server.use(
        http.get("/api/unspsc/industries", ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(options);
        })
      );

      await fetchUnspscIndustries(locale);
      expect(capturedUrl).not.toContain("lang=");
    });

    it("returns parsed options", async () => {
      server.use(
        http.get("/api/unspsc/industries", () => HttpResponse.json(options))
      );
      await expect(fetchUnspscIndustries()).resolves.toEqual(options);
    });

    it("hits the cache on repeated calls within TTL", async () => {
      const handler = vi.fn(() => HttpResponse.json(options));
      server.use(http.get("/api/unspsc/industries", handler));

      await fetchUnspscIndustries("ru");
      await fetchUnspscIndustries("ru");
      expect(handler).toHaveBeenCalledTimes(1);

      // 不同语言是不同的缓存键
      await fetchUnspscIndustries("es");
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe("fetchUnspscChildren", () => {
    it("always sends parent_id and appends lang only for translatable locales", async () => {
      const capturedUrls: string[] = [];
      server.use(
        http.get("/api/unspsc/children", ({ request }) => {
          capturedUrls.push(request.url);
          return HttpResponse.json(options);
        })
      );

      await fetchUnspscChildren("10", "ru");
      expect(capturedUrls[0]).toContain("parent_id=10");
      expect(capturedUrls[0]).toContain("lang=ru");

      await fetchUnspscChildren("10", "zh");
      expect(capturedUrls[1]).toContain("parent_id=10");
      expect(capturedUrls[1]).not.toContain("lang=");

      await fetchUnspscChildren("10");
      expect(capturedUrls[2]).toContain("parent_id=10");
      expect(capturedUrls[2]).not.toContain("lang=");
    });

    it("caches per parent_id and locale", async () => {
      const handler = vi.fn(() => HttpResponse.json(options));
      server.use(http.get("/api/unspsc/children", handler));

      await fetchUnspscChildren("10", "es");
      await fetchUnspscChildren("10", "es");
      expect(handler).toHaveBeenCalledTimes(1);

      await fetchUnspscChildren("20", "es");
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("throws on failure", async () => {
      server.use(
        http.get("/api/unspsc/children", () =>
          HttpResponse.json({ error: "boom" }, { status: 500 })
        )
      );
      await expect(fetchUnspscChildren("10")).rejects.toThrow();
    });
  });
});
