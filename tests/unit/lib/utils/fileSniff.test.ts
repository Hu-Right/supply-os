/**
 * 上传文件内容嗅探测试
 * @module lib/utils/fileSniff.test
 */
import { describe, it, expect } from "vitest";
import { sniffFileKind, checkUploadFile } from "@/lib/utils/fileSniff";

describe("sniffFileKind", () => {
  it("识别 JPEG magic bytes", () => {
    const buf = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
    expect(sniffFileKind(buf)).toBe("jpeg");
  });

  it("识别 PNG magic bytes", () => {
    const buf = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]), Buffer.alloc(20)]);
    expect(sniffFileKind(buf)).toBe("png");
  });

  it("识别 PDF", () => {
    const buf = Buffer.concat([Buffer.from("%PDF-1.7"), Buffer.alloc(20)]);
    expect(sniffFileKind(buf)).toBe("pdf");
  });

  it("识别 ZIP 容器（docx/xlsx）", () => {
    const buf = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(20)]);
    expect(sniffFileKind(buf)).toBe("zip");
  });

  it("识别 CFB（旧版 Office）", () => {
    const buf = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), Buffer.alloc(20)]);
    expect(sniffFileKind(buf)).toBe("cfb");
  });

  it("纯文本内容识别为 text", () => {
    expect(sniffFileKind(Buffer.from("hello, world this is plain text"))).toBe("text");
  });

  it("二进制乱码返回 null", () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b]);
    expect(sniffFileKind(buf)).toBeNull();
  });

  it("识别 RAR", () => {
    const buf = Buffer.concat([Buffer.from("Rar!\x1a\x07"), Buffer.alloc(20)]);
    expect(sniffFileKind(buf)).toBe("rar");
  });
});

describe("checkUploadFile", () => {
  const pngMagic = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(20)]);

  it("扩展名 + 内容匹配时通过", () => {
    expect(checkUploadFile("photo.png", pngMagic)).toEqual({ ok: true, safeExt: "png" });
  });

  it("拒绝白名单外扩展名（html/svg 等）", () => {
    expect(checkUploadFile("evil.html", Buffer.from("<script>x</script>")).ok).toBe(false);
    expect(checkUploadFile("evil.svg", Buffer.from("<svg/>")).ok).toBe(false);
    expect(checkUploadFile("noext", Buffer.from("text")).ok).toBe(false);
  });

  it("内容与扩展名不符时拒绝（伪装上传）", () => {
    expect(checkUploadFile("fake.png", Buffer.from("just plain text")).ok).toBe(false);
    expect(checkUploadFile("fake.jpg", pngMagic).ok).toBe(false);
  });

  it("docx 接受 zip 内容", () => {
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(20)]);
    expect(checkUploadFile("doc.docx", zip).ok).toBe(true);
  });

  it("txt/csv 拒绝脚本内容", () => {
    expect(checkUploadFile("a.txt", Buffer.from("<script>alert(1)</script>")).ok).toBe(false);
    expect(checkUploadFile("a.csv", Buffer.from("<svg onload=x>")).ok).toBe(false);
    expect(checkUploadFile("b.csv", Buffer.from("id,name\n1,foo")).ok).toBe(true);
  });
});
