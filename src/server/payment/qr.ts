import "server-only";
import QRCode from "qrcode";

/**
 * 将支付链接渲染为二维码图片 data URL（服务端统一实现）
 * Render a payment link as a QR-code data URL (shared server-side helper)
 *
 * @module server/payment/qr
 * @description 零跳转弹窗支付：会员与研修班下单响应中的二维码均出自本函数，
 *              失败时返回 null，前端降级为支付链接按钮。
 */
export async function toQrDataUrl(text: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(text, { width: 240, margin: 1 });
  } catch {
    return null;
  }
}
