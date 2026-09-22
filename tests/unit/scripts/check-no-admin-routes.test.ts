// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();
const SCRIPT = path.join(REPO_ROOT, "scripts/check-no-admin-routes.mjs");
let root: string;

beforeEach(() => {
  const resultsDir = path.join(REPO_ROOT, "test-results");
  fs.mkdirSync(resultsDir, { recursive: true });
  root = fs.mkdtempSync(path.join(resultsDir, "no-admin-gate-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeSource(relativePath: string, content: string): void {
  const file = path.join(root, "src", relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

function runGate(cwd = root) {
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd,
    encoding: "utf8",
    timeout: 15_000,
  });
  expect(result.error).toBeUndefined();
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

describe("管理员功能禁止回流门禁", () => {
  it.each([
    "app/api/admin/users/route.ts",
    "app/api/open/v1/keys/route.ts",
  ])("拒绝管理端路由文件：%s", (file) => {
    writeSource(file, "export const GET = () => new Response('管理端');");
    const result = runGate();
    expect(result.code).toBe(1);
    expect(result.output).toContain("管理员");
  });

  it.each([
    "/api/admin/users",
    "/api/open/v1/keys",
    "/api/open/v1/keys?status=active",
  ])("拒绝源码继续调用管理接口：%s", (endpoint) => {
    writeSource("core/http/retired.ts", `export const endpoint = "${endpoint}";`);
    const result = runGate();
    expect(result.code).toBe(1);
    expect(result.output).toContain(endpoint);
  });

  it("保留开放数据查询与附件代理路径", () => {
    writeSource("app/api/open/v1/notices/route.ts", "export const GET = () => new Response('查询');");
    writeSource("app/api/notices/proxy/route.ts", "export const GET = () => new Response('附件');");
    writeSource("core/http/allowed.ts", [
      'export const notices = "/api/open/v1/notices";',
      'export const proxy = "/api/notices/proxy";',
    ].join("\n"));
    expect(runGate().code).toBe(0);
  });

  it("真实仓库已移除 Key 管理路由且通过门禁", () => {
    expect(fs.existsSync(path.join(REPO_ROOT, "src/app/api/open/v1/keys/route.ts"))).toBe(false);
    expect(runGate(REPO_ROOT).code).toBe(0);
  });
});
