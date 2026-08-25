/**
 * server/utils/ip.ts 测试
 */
import { describe, it, expect } from "vitest";
import { extractClientIp } from "../../../server/utils/ip";
import type { Request } from "express";

function makeReq(overrides: {
  socketIp?: string;
  ip?: string;
  xff?: string;
}): Request {
  return {
    socket: { remoteAddress: overrides.socketIp || "" },
    ip: overrides.ip || "",
    headers: overrides.xff ? { "x-forwarded-for": overrides.xff } : {},
  } as unknown as Request;
}

describe("extractClientIp", () => {
  it("直连回环地址无 XFF", () => {
    const req = makeReq({ socketIp: "127.0.0.1", ip: "127.0.0.1" });
    expect(extractClientIp(req)).toBe("127.0.0.1");
  });

  it("可信代理（回环）+ XFF → 取 XFF 最近条目", () => {
    const req = makeReq({
      socketIp: "127.0.0.1",
      xff: "203.0.113.50, 70.41.3.18",
    });
    expect(extractClientIp(req)).toBe("70.41.3.18");
  });

  it("不可信公网来源 + 伪造 XFF → 忽略 XFF", () => {
    const req = makeReq({
      socketIp: "203.0.113.50",
      ip: "203.0.113.50",
      xff: "1.2.3.4",
    });
    expect(extractClientIp(req)).toBe("203.0.113.50");
  });

  it("内网代理 + 多跳 XFF", () => {
    const req = makeReq({
      socketIp: "10.0.0.1",
      xff: "1.1.1.1, 2.2.2.2, 3.3.3.3",
    });
    // 默认 hops=1，取最后一个
    expect(extractClientIp(req)).toBe("3.3.3.3");
  });

  it("IPv6 映射前缀剥离", () => {
    const req = makeReq({
      socketIp: "::ffff:192.168.1.1",
      ip: "::ffff:192.168.1.1",
    });
    expect(extractClientIp(req)).toBe("192.168.1.1");
  });

  it("全空回退 127.0.0.1", () => {
    const req = makeReq({});
    expect(extractClientIp(req)).toBe("127.0.0.1");
  });

  it("仅 socket IP 无 XFF", () => {
    const req = makeReq({ socketIp: "8.8.8.8", ip: "8.8.8.8" });
    expect(extractClientIp(req)).toBe("8.8.8.8");
  });

  it("可信代理 + XFF hops 超出数组长度回退", () => {
    const orig = process.env.TRUSTED_PROXY_HOPS;
    process.env.TRUSTED_PROXY_HOPS = "5";
    const req = makeReq({
      socketIp: "127.0.0.1",
      xff: "1.1.1.1",
    });
    // hops=5 但只有 1 个条目，idx=max(0, 1-5)=0，返回 parts[0]
    expect(extractClientIp(req)).toBe("1.1.1.1");
    if (orig !== undefined) process.env.TRUSTED_PROXY_HOPS = orig;
    else delete process.env.TRUSTED_PROXY_HOPS;
  });

  it("IPv6 ULA 地址识别为可信代理", () => {
    const req = makeReq({
      socketIp: "fd00::1",
      xff: "203.0.113.50",
    });
    expect(extractClientIp(req)).toBe("203.0.113.50");
  });

  it("172.16-31 内网段识别为可信", () => {
    const req = makeReq({
      socketIp: "172.16.0.1",
      xff: "8.8.4.4",
    });
    expect(extractClientIp(req)).toBe("8.8.4.4");
  });

  it("172.32 不在内网范围", () => {
    const req = makeReq({
      socketIp: "172.32.0.1",
      ip: "172.32.0.1",
      xff: "8.8.4.4",
    });
    // 不可信来源，忽略 XFF
    expect(extractClientIp(req)).toBe("172.32.0.1");
  });

  it("XFF 含 IPv6 映射前缀自动剥离", () => {
    const req = makeReq({
      socketIp: "10.0.0.1",
      xff: "::ffff:1.2.3.4",
    });
    expect(extractClientIp(req)).toBe("1.2.3.4");
  });
});
