/**
 * GET /api/internal/supplier-license/[filename] — 后台内部令牌取图端点测试
 * @module tests/unit/api/internal-supplier-license-route.test.ts
 * @description 钉住三道闸口：① ADMIN_INTERNAL_TOKEN 未配置时端点整体关闭（一律 403）；
 *              ② 令牌恒时比较，不符即 403；③ 文件名白名单 + 落盘查找失败 404，
 *              命中则回二进制（Content-Type 按扩展名、private no-store）。
 *              命中用例走真实临时文件（node:fs 内建模块 mock 不可靠，真实读盘更贴近实际）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import nodePath from "node:path";

vi.mock("@/lib/services/file-upload", () => ({
  findLicenseFileByFilename: vi.fn(),
  LICENSE_FILENAME_RE: /^license_[0-9a-zA-Z_-]{1,80}\.(jpg|jpeg|png|webp)$/,
}));

import { GET } from "@/app/api/internal/supplier-license/[filename]/route";
import { findLicenseFileByFilename } from "@/lib/services/file-upload";

const TOKEN = "test-shared-token-0123456789abcdef";

function req(filename: string, token?: string) {
  return new NextRequest(`http://localhost/api/internal/supplier-license/${filename}`, {
    headers: token ? { "x-internal-license-token": token } : {},
  });
}

const call = (filename: string, token?: string) =>
  GET(req(filename, token), { params: Promise.resolve({ filename }) } as never);

describe("GET /api/internal/supplier-license/[filename]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_INTERNAL_TOKEN = TOKEN;
  });

  it("未配置 ADMIN_INTERNAL_TOKEN → 端点整体关闭，带对令牌也 403", async () => {
    delete process.env.ADMIN_INTERNAL_TOKEN;
    const res = await call("license_113_1791943258896.jpg", TOKEN);
    expect(res.status).toBe(403);
    expect(findLicenseFileByFilename).not.toHaveBeenCalled();
  });

  it("令牌缺失 / 不符 → 403", async () => {
    expect((await call("license_113_1791943258896.jpg")).status).toBe(403);
    expect((await call("license_113_1791943258896.jpg", "wrong-token")).status).toBe(403);
    expect(findLicenseFileByFilename).not.toHaveBeenCalled();
  });

  it("文件名不过白名单 → 404（不触达磁盘）", async () => {
    const res = await call("../etc/passwd.jpg", TOKEN);
    expect(res.status).toBe(404);
    expect(findLicenseFileByFilename).not.toHaveBeenCalled();
  });

  it("落盘文件缺失 → 404", async () => {
    vi.mocked(findLicenseFileByFilename).mockReturnValue(null);
    const res = await call("license_113_1791943258896.jpg", TOKEN);
    expect(res.status).toBe(404);
  });

  it("命中文件 → 200 回二进制，Content-Type 按扩展名且禁缓存", async () => {
    const dir = mkdtempSync(nodePath.join(tmpdir(), "internal-license-test-"));
    const filePath = nodePath.join(dir, "license_113_1791943258896.jpg");
    writeFileSync(filePath, Buffer.from("jpeg-bytes"));
    try {
      vi.mocked(findLicenseFileByFilename).mockReturnValue(filePath);
      const res = await call("license_113_1791943258896.jpg", TOKEN);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/jpeg");
      expect(res.headers.get("Cache-Control")).toBe("private, no-store");
      expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("jpeg-bytes");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
