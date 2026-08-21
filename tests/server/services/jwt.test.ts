/**
 * server/services/jwt.ts 测试
 */
import { describe, it, expect, beforeAll } from "vitest";

// 在导入 jwt 模块前设置环境变量（模块级常量在导入时读取）
process.env.JWT_SECRET = "test-secret-key-for-unit-tests-only";

// 动态导入确保环境变量在模块加载前设置
const jwtModule = await import("../../../server/services/jwt");
const {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
  extractBearerToken,
  getRefreshTokenExpiresAt,
} = jwtModule;

describe("signAccessToken / verifyAccessToken", () => {
  it("签发并可验证 access token", () => {
    const token = signAccessToken({ user_key: "u1", email: "u@test.com" });
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3); // JWT 三段

    const payload = verifyAccessToken(token);
    expect(payload.user_key).toBe("u1");
    expect(payload.email).toBe("u@test.com");
    expect(payload.type).toBe("access");
  });

  it("过期/无效 token 抛出异常", () => {
    expect(() => verifyAccessToken("invalid.token.here")).toThrow();
  });

  it("refresh token 不能当作 access token 使用", () => {
    const { token } = signRefreshToken({ user_key: "u1" });
    expect(() => verifyAccessToken(token)).toThrow("INVALID_TOKEN_TYPE");
  });
});

describe("signRefreshToken / verifyRefreshToken", () => {
  it("签发并可验证 refresh token", () => {
    const { token, tokenHash } = signRefreshToken({ user_key: "u1" });
    expect(typeof token).toBe("string");
    expect(typeof tokenHash).toBe("string");
    expect(tokenHash.length).toBe(64); // SHA-256 hex

    const payload = verifyRefreshToken(token);
    expect(payload.user_key).toBe("u1");
    expect(payload.type).toBe("refresh");
  });

  it("access token 不能当作 refresh token 使用", () => {
    const token = signAccessToken({ user_key: "u1", email: "a@b.com" });
    expect(() => verifyRefreshToken(token)).toThrow("INVALID_TOKEN_TYPE");
  });
});

describe("hashRefreshToken", () => {
  it("相同输入产生相同哈希", () => {
    expect(hashRefreshToken("abc")).toBe(hashRefreshToken("abc"));
  });

  it("不同输入产生不同哈希", () => {
    expect(hashRefreshToken("abc")).not.toBe(hashRefreshToken("def"));
  });
});

describe("extractBearerToken", () => {
  it("正确提取 Bearer token", () => {
    expect(extractBearerToken("Bearer abc123")).toBe("abc123");
    expect(extractBearerToken("bearer xyz")).toBe("xyz");
  });

  it("格式错误返回 null", () => {
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken("")).toBeNull();
    expect(extractBearerToken("Basic abc")).toBeNull();
    expect(extractBearerToken("Bearer")).toBeNull();
  });
});

describe("getRefreshTokenExpiresAt", () => {
  it("返回未来 7 天的 Date", () => {
    const now = Date.now();
    const expires = getRefreshTokenExpiresAt();
    const diffDays = (expires.getTime() - now) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(6.9);
    expect(diffDays).toBeLessThan(7.1);
  });
});
