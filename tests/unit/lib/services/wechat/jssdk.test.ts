/**
 * 微信公众号 JS-SDK 签名 — 单测
 * 覆盖：未配置降级、token/ticket 换取与签名形状、微信错误码透传。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildJsapiSignature, isWechatMpConfigured } from "@/lib/services/wechat/jssdk";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  delete (globalThis as unknown as { __wxMpCache?: unknown }).__wxMpCache;
});

describe("wechat jssdk", () => {
  it("未配置公众号时返回 null（前端走降级引导）", async () => {
    vi.stubEnv("WECHAT_MP_APP_ID", "");
    vi.stubEnv("WECHAT_MP_APP_SECRET", "");
    expect(isWechatMpConfigured()).toBe(false);
    await expect(buildJsapiSignature("https://osneosmart.com/p?notice_id=1")).resolves.toBeNull();
  });

  it("配置后换 token/ticket 并生成 40 位 sha1 签名", async () => {
    vi.stubEnv("WECHAT_MP_APP_ID", "wx_test_app");
    vi.stubEnv("WECHAT_MP_APP_SECRET", "wx_test_secret");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token_1", expires_in: 7200 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ticket: "ticket_1", expires_in: 7200 })));
    vi.stubGlobal("fetch", fetchMock);

    const result = await buildJsapiSignature("https://osneosmart.com/procurement?notice_id=1");

    expect(result).not.toBeNull();
    expect(result!.appId).toBe("wx_test_app");
    expect(result!.signature).toMatch(/^[0-9a-f]{40}$/);
    expect(typeof result!.timestamp).toBe("number");
    expect(result!.nonceStr.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 第二次调用必须是 jsapi_ticket（而不是重复取 token）
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/cgi-bin/ticket/getticket");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("access_token=token_1");
  });

  it("微信返回错误码时抛出可读错误", async () => {
    vi.stubEnv("WECHAT_MP_APP_ID", "wx_bad_app");
    vi.stubEnv("WECHAT_MP_APP_SECRET", "wx_bad_secret");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ errcode: 40013, errmsg: "invalid appid" }))),
    );

    await expect(buildJsapiSignature("https://osneosmart.com/p?notice_id=1")).rejects.toThrow(
      /WECHAT_TOKEN_FAILED/,
    );
  });
});
