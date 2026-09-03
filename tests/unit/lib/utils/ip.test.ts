import { describe, it, expect } from "vitest";
import { extractClientIp } from "@/lib/utils/ip";

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/test", {
    headers: new Headers(headers),
  });
}

describe("extractClientIp", () => {
  it("无 XFF 头 → 回退 127.0.0.1", () => {
    const req = makeRequest();
    expect(extractClientIp(req)).toBe("127.0.0.1");
  });

  it("单条目 XFF → 返回该 IP", () => {
    const req = makeRequest({ "x-forwarded-for": "203.0.113.50" });
    expect(extractClientIp(req)).toBe("203.0.113.50");
  });

  it("多条目 XFF → 取最右侧条目（最近可信代理）", () => {
    const req = makeRequest({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 203.0.113.50" });
    expect(extractClientIp(req)).toBe("203.0.113.50");
  });

  it("IPv6 映射前缀自动剥离", () => {
    const req = makeRequest({ "x-forwarded-for": "::ffff:203.0.113.50" });
    expect(extractClientIp(req)).toBe("203.0.113.50");
  });

  it("空白 XFF → 回退 127.0.0.1", () => {
    const req = makeRequest({ "x-forwarded-for": "  " });
    expect(extractClientIp(req)).toBe("127.0.0.1");
  });

  it("TRUSTED_PROXY_HOPS 环境变量控制回跳数", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "2");
    const req = makeRequest({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.10.11.12" });
    // hops=2 → 取 parts[length-2] = 5.6.7.8
    expect(extractClientIp(req)).toBe("5.6.7.8");
    vi.unstubAllEnvs();
  });
});
