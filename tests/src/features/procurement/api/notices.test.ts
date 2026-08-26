/**
 * src/features/procurement/api/notices — API 函数测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock api / apiCached / buildQuery / getAuthToken / ApiError / downloadFile
vi.mock("@/core/http", () => ({
  api: vi.fn(),
  apiCached: vi.fn(),
  buildQuery: vi.fn((params: Record<string, any>) => {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") parts.push(`${k}=${encodeURIComponent(String(v))}`);
    }
    return parts.join("&");
  }),
  getAuthToken: vi.fn(),
  downloadFile: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(public status: number, msg: string) { super(msg); }
  },
}));

import {
  fetchNoticeCountries,
  fetchNoticeAgencies,
  viewNotice,
  unlockNotice,
  expressInterest,
  fetchNoticeDetail,
  fetchNoticePreview,
  fetchNoticeContent,
  fetchUnlockedNoticeIds,
  fetchNoticeTranslation,
  fetchUnifiedSearch,
  downloadNoticeReport,
} from "@/features/procurement/api/notices";
import { api, apiCached, downloadFile } from "@/core/http";

const mockApi = vi.mocked(api);
const mockApiCached = vi.mocked(apiCached);
const mockDownloadFile = vi.mocked(downloadFile);

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("fetchNoticeCountries", () => {
  it("调用 apiCached /api/notices/countries", () => {
    mockApiCached.mockResolvedValue([]);
    fetchNoticeCountries();
    expect(mockApiCached).toHaveBeenCalledWith("/api/notices/countries");
  });
});

describe("fetchNoticeAgencies", () => {
  it("无 locale 时不带参数", () => {
    mockApiCached.mockResolvedValue([]);
    fetchNoticeAgencies();
    expect(mockApiCached).toHaveBeenCalledWith("/api/notices/agencies");
  });

  it("有 locale 时附带参数", () => {
    mockApiCached.mockResolvedValue([]);
    fetchNoticeAgencies("zh");
    expect(mockApiCached).toHaveBeenCalledWith("/api/notices/agencies?locale=zh");
  });
});

describe("viewNotice", () => {
  it("POST /api/notices/:id/view", () => {
    mockApi.mockResolvedValue(undefined);
    viewNotice(42);
    expect(mockApi).toHaveBeenCalledWith("/api/notices/42/view", { method: "POST", body: {} });
  });

  it("失败静默吞没", async () => {
    mockApi.mockRejectedValue(new Error("network"));
    const result = await viewNotice(42);
    expect(result).toBeUndefined();
  });
});

describe("unlockNotice", () => {
  it("POST /api/notices/:id/unlock", () => {
    mockApi.mockResolvedValue({});
    unlockNotice(42, "free", 0);
    expect(mockApi).toHaveBeenCalledWith("/api/notices/42/unlock", {
      method: "POST",
      body: { unlock_type: "free", price: 0 },
    });
  });
});

describe("expressInterest", () => {
  it("POST /api/notices/:id/interest", () => {
    mockApi.mockResolvedValue({});
    expressInterest(42, "interested");
    expect(mockApi).toHaveBeenCalledWith("/api/notices/42/interest", {
      method: "POST",
      body: { interest_type: "interested" },
    });
  });
});

describe("fetchNoticeDetail", () => {
  it("apiCached 10 分钟 TTL", () => {
    mockApiCached.mockResolvedValue({});
    fetchNoticeDetail(42);
    expect(mockApiCached).toHaveBeenCalledWith("/api/notices/42/detail", 600000);
  });
});

describe("fetchNoticePreview", () => {
  it("apiCached 10 分钟 TTL", () => {
    mockApiCached.mockResolvedValue({});
    fetchNoticePreview(42);
    expect(mockApiCached).toHaveBeenCalledWith("/api/notices/42/preview", 600000);
  });
});

describe("fetchNoticeContent", () => {
  it("apiCached 10 分钟 TTL", () => {
    mockApiCached.mockResolvedValue({ description: "", title: "", description_cn: "" });
    fetchNoticeContent(42);
    expect(mockApiCached).toHaveBeenCalledWith("/api/notices/42/content", 600000);
  });
});

describe("fetchUnlockedNoticeIds", () => {
  it("正常返回 notice_id 数组", async () => {
    mockApiCached.mockResolvedValue([{ notice_id: 1 }, { notice_id: 2 }, { notice_id: "abc" }]);
    const result = await fetchUnlockedNoticeIds();
    expect(result).toEqual([1, 2]); // "abc" → NaN → 被 filter 掉
  });

  it("非数组返回空", async () => {
    mockApiCached.mockResolvedValue("error" as any);
    const result = await fetchUnlockedNoticeIds();
    expect(result).toEqual([]);
  });

  it("异常返回空", async () => {
    mockApiCached.mockRejectedValue(new Error("network"));
    const result = await fetchUnlockedNoticeIds();
    expect(result).toEqual([]);
  });
});

describe("fetchNoticeTranslation", () => {
  it("使用 api（非 apiCached）", () => {
    mockApi.mockResolvedValue({});
    fetchNoticeTranslation(42, "zh");
    expect(mockApi).toHaveBeenCalledWith("/api/notices/42/translation?lang=zh");
  });
});

describe("fetchUnifiedSearch", () => {
  it("构造查询字符串并调用 apiCached", () => {
    mockApiCached.mockResolvedValue({ list: [], total: 0 });
    fetchUnifiedSearch({ mode: "default", page: 1, pageSize: 20, q: "water" });
    expect(mockApiCached).toHaveBeenCalledWith(
      expect.stringContaining("/api/notices/unified-search?"),
      60000,
      undefined,
    );
  });

  it("传入 AbortSignal", () => {
    mockApiCached.mockResolvedValue({});
    const controller = new AbortController();
    fetchUnifiedSearch({ mode: "default", page: 1, pageSize: 10 }, controller.signal);
    expect(mockApiCached).toHaveBeenCalledWith(expect.any(String), 60000, controller.signal);
  });
});

// ── downloadNoticeReport：委托 api-client 的 downloadFile 通道 ──
describe("downloadNoticeReport", () => {
  it("委托 downloadFile(url, report.docx)", async () => {
    mockDownloadFile.mockResolvedValue(undefined);
    await downloadNoticeReport("/api/report/1");
    expect(mockDownloadFile).toHaveBeenCalledWith("/api/report/1", "report.docx");
  });
});
