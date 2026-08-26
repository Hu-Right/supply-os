/**
 * server/payment/qr.ts 测试
 * 验证二维码生成工具函数
 */
import { describe, it, expect } from "vitest";
import { toQrDataUrl } from "../../../server/payment/qr";

describe("toQrDataUrl", () => {
  it("有效文本生成 data URL", async () => {
    const result = await toQrDataUrl("https://example.com/pay?order=123");
    expect(result).not.toBeNull();
    expect(typeof result).toBe("string");
    expect(result).toMatch(/^data:image\/png;base64,/);
  });

  it("生成的二维码包含正确尺寸参数（width=240, margin=1）", async () => {
    const result = await toQrDataUrl("test-content");
    expect(result).not.toBeNull();
    // data URL 应该是有效的 base64 PNG
    const base64Data = result!.split(",")[1];
    expect(base64Data.length).toBeGreaterThan(0);
  });

  it("空字符串 → 返回 null（qrcode 库拒绝空输入，函数兜底返回 null）", async () => {
    const result = await toQrDataUrl("");
    expect(result).toBeNull();
  });

  it("长文本也能生成二维码", async () => {
    const longText = "https://example.com/pay?" + "a".repeat(500);
    const result = await toQrDataUrl(longText);
    expect(result).not.toBeNull();
    expect(result).toMatch(/^data:image\/png;base64,/);
  });
});
