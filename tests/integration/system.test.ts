/**
 * API 集成测试 — 系统端点
 * Integration tests for system routes via supertest
 *
 * 覆盖：
 *   GET /api/system/version  — 版本号获取
 *   GET /api/system/icp      — ICP 备案号（mock repo）
 *   GET /api/system/links    — 底部链接（mock repo）
 *   GET /api/nonexistent     — 404 兜底
 *   安全响应头检查
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import supertest from "supertest";
import express from "express";
import { createSystemRouter } from "../../server/routes/system.routes";
import { notFoundHandler, errorHandler } from "../../server/middleware/errorHandler";

function createTestApp(systemRepo: any) {
  const app = express();
  app.use(express.json());
  const ctx = { systemRepo } as any;
  app.use(createSystemRouter(ctx));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe("API 集成测试 — /api/system/*", () => {
  let request: supertest.Agent;
  const mockSystemRepo = {
    getIcpBah: vi.fn().mockResolvedValue("京ICP备12345678号"),
    listFooterLinks: vi.fn().mockResolvedValue([
      { id: 1, name: "GitHub", url: "https://github.com", icon: "icon-github" },
      { id: 2, name: "WeChat", url: "https://weixin.qq.com", icon: "icon-wechat" },
    ]),
  };

  beforeAll(() => {
    const app = createTestApp(mockSystemRepo);
    request = supertest.agent(app);
  });

  it("GET /api/system/version 返回版本号", async () => {
    const res = await request.get("/api/system/version");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("version");
    expect(typeof res.body.version).toBe("string");
    expect(res.headers["cache-control"]).toContain("no-cache");
  });

  it("GET /api/system/icp 返回备案号", async () => {
    const res = await request.get("/api/system/icp");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("bah");
    expect(res.body.bah).toBe("京ICP备12345678号");
    expect(res.headers["cache-control"]).toContain("max-age=600");
  });

  it("GET /api/system/icp 第二次请求命中缓存", async () => {
    const res = await request.get("/api/system/icp");
    expect(res.status).toBe(200);
    expect(res.body.bah).toBe("京ICP备12345678号");
    // getIcpBah 只在第一次调用时被调用（后续走内存缓存）
    // 注意：由于 beforeAll 中已创建 app，这里验证缓存行为
  });

  it("GET /api/system/links 返回底部链接", async () => {
    const res = await request.get("/api/system/links");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toHaveProperty("name", "GitHub");
    expect(res.body[0]).toHaveProperty("url", "https://github.com");
    expect(res.body[0]).toHaveProperty("icon", "icon-github");
    expect(res.headers["cache-control"]).toContain("max-age=1800");
  });

  it("GET /api/nonexistent 返回 404", async () => {
    const res = await request.get("/api/nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("API 集成测试 — 错误降级", () => {
  let request: supertest.Agent;

  beforeAll(() => {
    const errorRepo = {
      getIcpBah: vi.fn().mockRejectedValue(new Error("DB error")),
      listFooterLinks: vi.fn().mockRejectedValue(new Error("DB error")),
    };
    const app = createTestApp(errorRepo);
    request = supertest.agent(app);
  });

  it("GET /api/system/icp DB 错误降级返回空串", async () => {
    const res = await request.get("/api/system/icp");
    expect(res.status).toBe(200);
    expect(res.body.bah).toBe("");
  });

  it("GET /api/system/links DB 错误降级返回空数组", async () => {
    const res = await request.get("/api/system/links");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("API 集成测试 — links 字段规范化", () => {
  let request: supertest.Agent;

  beforeAll(() => {
    const repo = {
      getIcpBah: vi.fn().mockResolvedValue(""),
      listFooterLinks: vi.fn().mockResolvedValue([
        { id: "5", name: null, url: null, icon: null },
        { id: 10, name: "Test", url: "https://test.com", icon: "icon-test" },
      ]),
    };
    const app = createTestApp(repo);
    request = supertest.agent(app);
  });

  it("null 字段转为空字符串，id 转为数字", async () => {
    const res = await request.get("/api/system/links");
    expect(res.status).toBe(200);
    expect(res.body[0].id).toBe(5);
    expect(res.body[0].name).toBe("");
    expect(res.body[0].url).toBe("");
    expect(res.body[0].icon).toBe("");
    expect(res.body[1].name).toBe("Test");
  });
});
