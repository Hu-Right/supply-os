import { describe, it, expect, beforeAll } from "vitest";

// 在导入 jwt 模块之前设置 JWT_SECRET（模块加载时即读取环境变量）
beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-key-for-unit-tests-only";
});

// 动态导入确保在 JWT_SECRET 设置后才加载模块
async function getJwt() {
  return import("./jwt");
}

describe("signAccessToken / verifyAccessToken", () => {
  it("签发后验证 → 返回正确 payload", async () => {
    const jwt = await getJwt();
    const token = jwt.signAccessToken({ user_key: "test@test.com", email: "test@test.com" });
    const payload = jwt.verifyAccessToken(token);
    expect(payload.user_key).toBe("test@test.com");
    expect(payload.email).toBe("test@test.com");
    expect(payload.type).toBe("access");
  });

  it("篡改 token → 抛出错误", async () => {
    const jwt = await getJwt();
    const token = jwt.signAccessToken({ user_key: "test@test.com", email: "test@test.com" });
    expect(() => jwt.verifyAccessToken(token + "tampered")).toThrow();
  });
});

describe("signRefreshToken / verifyRefreshToken", () => {
  it("签发返回 token 和 tokenHash", async () => {
    const jwt = await getJwt();
    const { token, tokenHash } = jwt.signRefreshToken({ user_key: "user@test.com" });
    expect(token).toBeTruthy();
    expect(tokenHash).toBeTruthy();
    expect(tokenHash).not.toBe(token);
  });

  it("签发后验证 → 返回正确 payload", async () => {
    const jwt = await getJwt();
    const { token } = jwt.signRefreshToken({ user_key: "user@test.com" });
    const payload = jwt.verifyRefreshToken(token);
    expect(payload.user_key).toBe("user@test.com");
    expect(payload.type).toBe("refresh");
  });

  it("用 access token 验证 refresh → 抛出 INVALID_TOKEN_TYPE", async () => {
    const jwt = await getJwt();
    const accessToken = jwt.signAccessToken({ user_key: "test@test.com", email: "test@test.com" });
    expect(() => jwt.verifyRefreshToken(accessToken)).toThrow("INVALID_TOKEN_TYPE");
  });
});

describe("hashRefreshToken", () => {
  it("相同输入 → 相同哈希", async () => {
    const jwt = await getJwt();
    const hash1 = jwt.hashRefreshToken("test-token");
    const hash2 = jwt.hashRefreshToken("test-token");
    expect(hash1).toBe(hash2);
  });

  it("不同输入 → 不同哈希", async () => {
    const jwt = await getJwt();
    const hash1 = jwt.hashRefreshToken("token-a");
    const hash2 = jwt.hashRefreshToken("token-b");
    expect(hash1).not.toBe(hash2);
  });

  it("输出为 64 字符十六进制（SHA-256）", async () => {
    const jwt = await getJwt();
    const hash = jwt.hashRefreshToken("test");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("extractBearerToken", () => {
  it("标准 Bearer 头 → 提取 token", async () => {
    const jwt = await getJwt();
    expect(jwt.extractBearerToken("Bearer abc123")).toBe("abc123");
  });

  it("大小写不敏感", async () => {
    const jwt = await getJwt();
    expect(jwt.extractBearerToken("bearer abc123")).toBe("abc123");
  });

  it("无 Bearer → null", async () => {
    const jwt = await getJwt();
    expect(jwt.extractBearerToken("Basic abc123")).toBeNull();
    expect(jwt.extractBearerToken(undefined)).toBeNull();
    expect(jwt.extractBearerToken("")).toBeNull();
  });
});

describe("getRefreshTokenExpiresAt", () => {
  it("返回未来 7 天的 Date", async () => {
    const jwt = await getJwt();
    const now = Date.now();
    const expires = jwt.getRefreshTokenExpiresAt();
    const diffDays = (expires.getTime() - now) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(7, 0);
  });
});
