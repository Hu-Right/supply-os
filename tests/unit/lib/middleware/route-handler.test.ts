/**
 * withRoute 统一包装器测试（架构评估 E1/TY2 配套）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";
import { withRoute, routeError, parseJson, RouteError } from "@/lib/middleware/route-handler";

vi.mock("server-only", () => ({}));

function makeReq(url = "http://localhost/api/test", init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(url, init);
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("withRoute 错误映射", () => {
  it("成功路径：原样返回 handler 响应", async () => {
    const handler = withRoute(async () => new Response('{"ok":true}'));
    const res = await handler(makeReq(), {} as never);
    expect(res.status).toBe(200);
  });

  it("RouteError → 标准 { code, message } envelope", async () => {
    const handler = withRoute(async () => routeError(409, 40031, "已绑定手机号"));
    const res = await handler(makeReq(), {} as never);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: 40031, message: "已绑定手机号" });
  });

  it("ZodError → 400/40000，message 取首个 issue", async () => {
    const handler = withRoute(async () => {
      z.object({ phone: z.string().regex(/^1\d{10}$/, "请输入有效的手机号") }).parse({ phone: "abc" });
      return new Response("{}");
    });
    const res = await handler(makeReq(), {} as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe(40000);
    expect(body.message).toBe("请输入有效的手机号");
  });

  it("未预期异常 → 500/50000 且输出服务端日志", async () => {
    const errSpy = vi.spyOn(console, "error");
    const handler = withRoute(async () => {
      throw new Error("boom");
    });
    const res = await handler(makeReq("http://localhost/api/boom", { method: "POST" }), {} as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ code: 50000, message: "服务器内部错误" });
    expect(errSpy).toHaveBeenCalledWith("[route] POST /api/boom", expect.any(Error));
  });

  it("RouteError 可作为异常类被 instanceof 识别", () => {
    const err = new RouteError(404, 40004, "不存在");
    expect(err).toBeInstanceOf(RouteError);
    expect(err.status).toBe(404);
  });
});

describe("parseJson", () => {
  it("合法 body → 返回解析结果", async () => {
    const req = makeReq("http://localhost/x", {
      method: "POST",
      body: JSON.stringify({ phone: "13800000000", code: "123456" }),
      headers: { "content-type": "application/json" },
    });
    const schema = z.object({ phone: z.string(), code: z.string() });
    expect(await parseJson(req, schema)).toEqual({ phone: "13800000000", code: "123456" });
  });

  it("非法 JSON → 400/40000 RouteError", async () => {
    const req = makeReq("http://localhost/x", {
      method: "POST",
      body: "not-json",
      headers: { "content-type": "application/json" },
    });
    await expect(parseJson(req, z.object({}))).rejects.toThrow(RouteError);
    await expect(parseJson(req, z.object({}))).rejects.toMatchObject({ status: 400, code: 40000 });
  });

  it("校验失败 → 400 RouteError（默认 code 40000）", async () => {
    const req = makeReq("http://localhost/x", {
      method: "POST",
      body: JSON.stringify({ phone: "bad" }),
      headers: { "content-type": "application/json" },
    });
    await expect(parseJson(req, z.object({ phone: z.string().regex(/^1\d{10}$/) }))).rejects.toMatchObject({
      status: 400,
      code: 40000,
    });
  });

  it("校验失败 → codeByPath 命中字段业务码", async () => {
    // 失败字段不在 map 中 → 默认 40000
    const req1 = makeReq("http://localhost/x", {
      method: "POST",
      body: JSON.stringify({ other: "" }),
      headers: { "content-type": "application/json" },
    });
    await expect(
      parseJson(req1, z.object({ other: z.string().min(1) }), { identifier: 40011 }),
    ).rejects.toMatchObject({ status: 400, code: 40000 });
    // 失败字段命中 map → 业务码 + 原文案
    const req2 = makeReq("http://localhost/x", {
      method: "POST",
      body: JSON.stringify({ password: "x" }),
      headers: { "content-type": "application/json" },
    });
    await expect(
      parseJson(req2, z.object({ identifier: z.string({ error: "请输入手机号或邮箱" }).min(1, "请输入手机号或邮箱") }), { identifier: 40011 }),
    ).rejects.toMatchObject({ code: 40011, message: "请输入手机号或邮箱" });
  });
});
