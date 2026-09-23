import { describe, it, expect } from "vitest";
import {
  parseLicenseUid,
  resolveLicenseFilePath,
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

describe("resolveLicenseFilePath", () => {
  it("非执照前缀 URL 直接返回 null", () => {
    expect(resolveLicenseFilePath("/api/something/else.jpg")).toBeNull();
    expect(resolveLicenseFilePath("/uploads/other/x.jpg")).toBeNull();
    expect(resolveLicenseFilePath("https://evil/x.jpg")).toBeNull();
  });

  it("执照 URL 但磁盘不存在时返回 null（不抛异常）", () => {
    // 全新时间戳文件必然不存在
    const url = `${LICENSE_URL_PREFIX}/license_999999_1.jpg`;
    expect(resolveLicenseFilePath(url)).toBeNull();
    const legacy = `/uploads/license/license_999999_1.jpg`;
    expect(resolveLicenseFilePath(legacy)).toBeNull();
  });

  it("执照 URL 中夹带穿越片段被白名单拒绝", () => {
    expect(resolveLicenseFilePath(`${LICENSE_URL_PREFIX}/..%2F..%2Fetc%2Fpasswd`)).toBeNull();
    expect(resolveLicenseFilePath(`${LICENSE_URL_PREFIX}/../../etc/passwd`)).toBeNull();
  });
});
