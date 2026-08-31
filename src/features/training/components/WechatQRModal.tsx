/**
 * 企业微信二维码弹窗 — 向后兼容 re-export
 * WeChat Work QR Code Modal — Backward-compatible re-export
 *
 * @module features/training/components/WechatQRModal
 * @description ARCH-P1a（2026-08-31）：权威实现已迁至 shared/ui/WechatQRModal.tsx，
 *              本文件改为 re-export 保持存量导入路径兼容。
 *              新代码应直接从 @/shared/ui 导入。
 */
export { default } from "@/shared/ui/WechatQRModal";
export type { WechatQRModalProps } from "@/shared/ui/WechatQRModal";
