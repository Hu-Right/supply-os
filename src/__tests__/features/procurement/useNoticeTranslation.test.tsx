import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { act } from "react";
import { server } from "../../mocks/server";
import { useNoticeTranslation } from "@/features/procurement/hooks/useNoticeTranslation";

// 注意：fetchJsonCached 按 URL 做模块级缓存，各用例必须使用不同 noticeId

describe("useNoticeTranslation", () => {
  it("fetches translation for non-en locale", async () => {
    server.use(
      http.get("/api/notices/501/translation", () =>
        HttpResponse.json({ lang: "zh", title: "标题", description: "说明", cached: true })
      )
    );
    const { result } = renderHook(() => useNoticeTranslation(501, "zh"));
    await waitFor(() => expect(result.current.translation).not.toBeNull());
    expect(result.current.translation?.title).toBe("标题");
    expect(result.current.translating).toBe(false);
  });

  it("skips fetch entirely when locale is en", async () => {
    let called = false;
    server.use(
      http.get("/api/notices/502/translation", () => {
        called = true;
        return HttpResponse.json({ lang: "en", title: "x", description: "y", cached: true });
      })
    );
    const { result } = renderHook(() => useNoticeTranslation(502, "en"));
    expect(result.current.translating).toBe(false);
    await new Promise((r) => setTimeout(r, 50));
    expect(called).toBe(false);
    expect(result.current.translation).toBeNull();
  });

  it("falls back silently on server error", async () => {
    server.use(
      http.get("/api/notices/503/translation", () =>
        HttpResponse.json({ error: "TRANSLATION_UNAVAILABLE" }, { status: 503 })
      )
    );
    const { result } = renderHook(() => useNoticeTranslation(503, "ru"));
    await waitFor(() => expect(result.current.translating).toBe(false));
    expect(result.current.translation).toBeNull();
  });

  it("exposes failed=true when translation request fails", async () => {
    server.use(
      http.get("/api/notices/507/translation", () =>
        HttpResponse.json({ error: "TRANSLATION_UNAVAILABLE" }, { status: 503 })
      )
    );
    const { result } = renderHook(() =>
      useNoticeTranslation(507, "ru", "Supply of laptops for regional office")
    );
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.translation).toBeNull();
    expect(result.current.translating).toBe(false);
  });

  it("toggleOriginal flips showOriginal", async () => {
    server.use(
      http.get("/api/notices/504/translation", () =>
        HttpResponse.json({ lang: "fr", title: "t", description: "d", cached: true })
      )
    );
    const { result } = renderHook(() => useNoticeTranslation(504, "fr"));
    await waitFor(() => expect(result.current.translation).not.toBeNull());
    expect(result.current.showOriginal).toBe(false);
    act(() => result.current.toggleOriginal());
    expect(result.current.showOriginal).toBe(true);
  });

  it("never exposes a previous notice's translation after switching", async () => {
    server.use(
      http.get("/api/notices/505/translation", () =>
        HttpResponse.json({ lang: "zh", title: "旧公告", description: "旧说明", cached: true })
      ),
      http.get("/api/notices/506/translation", async () => {
        await new Promise((r) => setTimeout(r, 30));
        return HttpResponse.json({ lang: "zh", title: "新公告", description: "新说明", cached: true });
      })
    );
    const { result, rerender } = renderHook(({ id }) => useNoticeTranslation(id, "zh"), {
      initialProps: { id: 505 },
    });
    await waitFor(() => expect(result.current.translation?.title).toBe("旧公告"));

    rerender({ id: 506 });
    // 切换公告的当帧旧译文即失效（渲染期键匹配），不会闪现在新公告上
    expect(result.current.translation).toBeNull();
    await waitFor(() => expect(result.current.translation?.title).toBe("新公告"));
  });
});
