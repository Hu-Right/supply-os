/**
 * server/utils/http-error.ts 测试
 */
import { describe, it, expect, vi } from "vitest";
import { sendError, ApiErrorCode } from "../../../server/utils/http-error";

describe("ApiErrorCode", () => {
  it("错误码为数字", () => {
    expect(typeof ApiErrorCode.USER_REQUIRED).toBe("number");
    expect(typeof ApiErrorCode.VIP_REQUIRED).toBe("number");
    expect(typeof ApiErrorCode.INTERNAL_ERROR).toBe("number");
  });

  it("错误码值正确", () => {
    expect(ApiErrorCode.USER_REQUIRED).toBe(40001);
    expect(ApiErrorCode.VIP_REQUIRED).toBe(41001);
    expect(ApiErrorCode.RATE_LIMITED).toBe(42001);
    expect(ApiErrorCode.INTERNAL_ERROR).toBe(50000);
  });
});

describe("sendError", () => {
  it("发送正确格式的错误响应", () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const res = { status, json } as any;

    sendError(res, 400, ApiErrorCode.INVALID_PARAMS, "参数错误");

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      code: 40002,
      message: "参数错误",
      error: "参数错误",
    });
  });

  it("extra 字段平铺进响应体", () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const res = { status, json } as any;

    sendError(res, 429, ApiErrorCode.RATE_LIMITED, "请求过于频繁", {
      retry_after_seconds: 60,
    });

    expect(json).toHaveBeenCalledWith({
      code: 42001,
      message: "请求过于频繁",
      error: "请求过于频繁",
      retry_after_seconds: 60,
    });
  });
});
