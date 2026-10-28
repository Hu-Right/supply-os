/**
 * file-upload（字节入库版）单元测试
 * @module tests/unit/lib/services/file-upload.test.ts
 * @description 2026-10-14 起执照字节统一存 upload_files（双端共享库，不落磁盘）。
 *              钉住：纯函数层（uid 提取/文件名白名单/URL 解析）+ DB 层
 *              （save 幂等 upsert、get 命中与未命中、delete 按 URL 删行且非执照 URL 静默忽略）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { poolExecute } = vi.hoisted(() => ({ poolExecute: vi.fn() }));
vi.mock("@/lib/db/pool", () => ({ getPool: () => ({ execute: poolExecute }) }));

import {
  parseLicenseUid,
  licenseFilenameFromUrl,
  licenseContentType,
  saveLicenseFile,
  getLicenseFile,
  deleteFile,
  LICENSE_FILENAME_RE,
  LICENSE_URL_PREFIX,
} from "@/lib/services/file-upload";

describe("parseLicenseUid", () => {
  it("从合法文件名提取归属 userId", () => {
    expect(parseLicenseUid("license_42_1690000000000.jpg")).toBe(42);
    expect(parseLicenseUid("license_7_1690000000000.png")).toBe(7);
    expect(parseLicenseUid("license_123_1690000000000.webp")).toBe(123);
    expect(parseLicenseUid("license_1_1690000000000.jpeg")).toBe(1);
  });

  it("非法/非执照格式返回 0", () => {
    expect(parseLicenseUid("other_42_1.jpg")).toBe(0);
    expect(parseLicenseUid("license_a_1.jpg")).toBe(0); // uid 非数字
    expect(parseLicenseUid("license_42.jpg")).toBe(0); // 缺时间戳
    expect(parseLicenseUid("../../etc/passwd")).toBe(0);
    expect(parseLicenseUid("")).toBe(0);
  });
});

describe("LICENSE_FILENAME_RE（文件名白名单/防穿越）", () => {
  it("接受规范执照文件名", () => {
    expect(LICENSE_FILENAME_RE.test("license_1_1700000000000.jpg")).toBe(true);
    expect(LICENSE_FILENAME_RE.test("license_9_1700000000000.png")).toBe(true);
  });
  it("拒绝穿越、异前缀、非法扩展名", () => {
    expect(LICENSE_FILENAME_RE.test("../license_1_1.jpg")).toBe(false);
    expect(LICENSE_FILENAME_RE.test("license_1_1.txt")).toBe(false);
    expect(LICENSE_FILENAME_RE.test("foo_1_1.jpg")).toBe(false);
    expect(LICENSE_FILENAME_RE.test("license_1_1.jpg/../../x")).toBe(false);
  });
});

describe("licenseFilenameFromUrl（新旧前缀解析）", () => {
  it("新式鉴权前缀 → 文件名", () => {
    expect(licenseFilenameFromUrl(`${LICENSE_URL_PREFIX}/license_42_1.jpg`)).toBe("license_42_1.jpg");
  });
  it("存量 /uploads/license/ 前缀 → 文件名", () => {
    expect(licenseFilenameFromUrl("/uploads/license/license_42_1.jpg")).toBe("license_42_1.jpg");
  });
  it("非执照 URL → null", () => {
    expect(licenseFilenameFromUrl("/api/something/else.jpg")).toBeNull();
    expect(licenseFilenameFromUrl("https://evil/x.jpg")).toBeNull();
    expect(licenseFilenameFromUrl("")).toBeNull();
  });
});

describe("licenseContentType", () => {
  it("按扩展名映射 MIME", () => {
    expect(licenseContentType("license_1_1.jpg")).toBe("image/jpeg");
    expect(licenseContentType("license_1_1.png")).toBe("image/png");
    expect(licenseContentType("license_1_1.bin")).toBe("application/octet-stream");
  });
});

describe("saveLicenseFile（字节入库）", () => {
  beforeEach(() => {
    poolExecute.mockReset().mockResolvedValue([{ affectedRows: 1 }]);
  });

  it("白名单通过 → upsert 入库并返回鉴权 URL", async () => {
    const buffer = Buffer.from("jpeg-bytes");
    const res = await saveLicenseFile({ filename: "license_42_1.jpg", buffer, contentType: "image/jpeg", uploadedBy: 42 });
    expect(res).toEqual({ url: `${LICENSE_URL_PREFIX}/license_42_1.jpg`, filename: "license_42_1.jpg" });
    const [sql, params] = poolExecute.mock.calls[0];
    expect(String(sql)).toContain("INSERT INTO upload_files");
    expect(String(sql)).toContain("ON DUPLICATE KEY UPDATE");
    expect(params[0]).toBe("license_42_1.jpg");
    expect(params[1]).toBe(buffer);
    expect(params[3]).toBe(buffer.length);
    expect(params[4]).toBe(42);
  });

  it("文件名不过白名单 → 抛错且不触库", async () => {
    await expect(
      saveLicenseFile({ filename: "../evil.jpg", buffer: Buffer.from("x"), contentType: "image/jpeg", uploadedBy: 42 }),
    ).rejects.toThrow("非法的执照文件名");
    expect(poolExecute).not.toHaveBeenCalled();
  });
});

describe("getLicenseFile（按名取字节）", () => {
  beforeEach(() => {
    poolExecute.mockReset();
  });

  it("命中 → 返回 buffer + contentType", async () => {
    const content = Buffer.from("png-bytes");
    poolExecute.mockResolvedValue([[{ content, content_type: "image/png" }]]);
    const res = await getLicenseFile("license_42_1.png");
    expect(res).toEqual({ buffer: content, contentType: "image/png" });
    const [sql, params] = poolExecute.mock.calls[0];
    expect(String(sql)).toContain("FROM upload_files WHERE filename = ?");
    expect(params).toEqual(["license_42_1.png"]);
  });

  it("未命中 / 文件名非法 → null", async () => {
    poolExecute.mockResolvedValue([[]]);
    expect(await getLicenseFile("license_999999_1.jpg")).toBeNull();
    expect(await getLicenseFile("../../etc/passwd")).toBeNull();
  });
});

describe("deleteFile（按 URL 删记录）", () => {
  beforeEach(() => {
    poolExecute.mockReset().mockResolvedValue([{ affectedRows: 1 }]);
  });

  it("执照 URL → DELETE 对应文件名", async () => {
    await deleteFile(`${LICENSE_URL_PREFIX}/license_42_1.jpg`);
    const [sql, params] = poolExecute.mock.calls[0];
    expect(String(sql)).toContain("DELETE FROM upload_files WHERE filename = ?");
    expect(params).toEqual(["license_42_1.jpg"]);
  });

  it("存量前缀 URL 同样可删", async () => {
    await deleteFile("/uploads/license/license_42_1.jpg");
    expect(poolExecute.mock.calls[0][1]).toEqual(["license_42_1.jpg"]);
  });

  it("非执照 URL → 静默忽略不触库", async () => {
    await deleteFile("/api/something/else.jpg");
    expect(poolExecute).not.toHaveBeenCalled();
  });
});
