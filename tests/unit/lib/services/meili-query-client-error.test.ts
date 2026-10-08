/**
 * Meilisearch 错误分类 — 单元测试
 *
 * 关键契约：4xx「请求本身不被接受」绝不能被当成「服务不可用」。
 * 现网 Meilisearch 只接受 last/all/frequency，一次 allOptional 的 400 若触发
 * markUnhealthy()，就会把全部搜索（含正常的 all 模式）整体降级到 MySQL FULLTEXT。
 */
import { describe, expect, it } from "vitest";
import { isClientRequestError } from "@/lib/services/search-orchestrator/meili-query";

/** 造一个 SDK 的 MeilisearchApiError 形态（透传 response.status） */
function apiError(status: number, message: string): Error {
  const err = new Error(message) as Error & { name: string; response: { status: number } };
  err.name = "MeilisearchApiError";
  err.response = { status };
  return err;
}

describe("isClientRequestError", () => {
  it("400 参数校验错误（allOptional 不被接受）判定为请求错误", () => {
    const err = apiError(
      400,
      "Unknown value `allOptional` at `matchingStrategy`: expected one of `last`, `all`, `frequency`",
    );
    expect(isClientRequestError(err)).toBe(true);
  });

  it("404 索引不存在同样属于请求层面错误", () => {
    expect(isClientRequestError(apiError(404, "Index `notices` not found"))).toBe(true);
  });

  it("5xx 是服务端故障，不得判定为请求错误（应走健康降级）", () => {
    expect(isClientRequestError(apiError(502, "Bad Gateway"))).toBe(false);
    expect(isClientRequestError(apiError(500, "Internal Server Error"))).toBe(false);
  });

  it("连接类错误（无 response）判定为服务不可用", () => {
    const connErr = new Error("fetch failed: ECONNREFUSED 127.0.0.1:7700");
    connErr.name = "TypeError";
    expect(isClientRequestError(connErr)).toBe(false);
  });

  it("超时错误判定为服务不可用一侧（由调用方按 timeout 文案另行豁免）", () => {
    const timeoutErr = new Error("Meilisearch search timeout after 5000ms");
    timeoutErr.name = "MeilisearchRequestTimeOutError";
    expect(isClientRequestError(timeoutErr)).toBe(false);
  });

  it("SDK 未透传 response 时按错误名兜底识别 API 错误", () => {
    const bare = new Error("filter parse error") as Error & { name: string };
    bare.name = "MeilisearchApiError";
    expect(isClientRequestError(bare)).toBe(true);
  });

  it("非 Error 值不抛异常", () => {
    expect(isClientRequestError(undefined)).toBe(false);
    expect(isClientRequestError("boom")).toBe(false);
  });
});
