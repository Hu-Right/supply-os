import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { act } from "react";
import { server } from "../../mocks/server";
import { useNoticeTranslation } from "@/features/procurement/hooks/useNoticeTranslation";

// 注意：fetchJsonCached 按 URL 做模块级缓存，各用例必须使用不同 noticeId
// hook 第三参 sourceText 用于内容语言检测：缺省空串→unknown→不请求，
// 因此需要发起翻译的用例必须传与目标 locale 不同文字系统的原文（如英文原文 + zh）
const EN_SOURCE = "Supply of diesel generators for field operations";

describe("useNoticeTranslation", () => {
  it("fetches translation for non-en locale", async () => {
    server.use(
      http.get("/api/notices/501/translation", () =>
        HttpResponse.json({ lang: "zh", title: "标题", description: "说明", cached: true })
      )
    );
    const { result } = renderHook(() => useNoticeTranslation(501, "zh", EN_SOURCE));
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
    const { result } = renderHook(() => useNoticeTranslation(502, "en", EN_SOURCE));
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
    const { result } = renderHook(() => useNoticeTranslation(503, "ru", EN_SOURCE));
    await waitFor(() => expect(result.current.translating).toBe(false));
    expect(result.current.translation).toBeNull();
  });

  it("toggleOriginal flips showOriginal", async () => {
    server.use(
      http.get("/api/notices/504/translation", () =>
        HttpResponse.json({ lang: "fr", title: "t", description: "d", cached: true })
      )
    );
    const { result } = renderHook(() => useNoticeTranslation(504, "fr", "中文原文公告内容"));
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
    const { result, rerender } = renderHook(({ id }) => useNoticeTranslation(id, "zh", EN_SOURCE), {
      initialProps: { id: 505 },
    });
    await waitFor(() => expect(result.current.translation?.title).toBe("旧公告"));

    rerender({ id: 506 });
    // 切换公告的当帧旧译文即失效（渲染期键匹配），不会闪现在新公告上
    expect(result.current.translation).toBeNull();
    await waitFor(() => expect(result.current.translation?.title).toBe("新公告"));
  });
});
