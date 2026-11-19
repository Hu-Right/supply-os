/**
 * 公告分享渠道定义（自 ShareModal.tsx 拆出）。
 *
 * 2026-11-19 渠道收敛：只保留 微信 / WhatsApp / Gmail 三个（业务方拍板，
 * 其余渠道无实际使用量）；复制链接与二维码仍在面板里，不属于渠道网格。
 * 微信无网页分享意图 → 复制链接并提示扫码/粘贴；WhatsApp/Gmail 走标准网页意图。
 *
 * @module features/procurement/components/NoticeDetail/share/channels
 */
import { AtSign, MessageCircle, MessageSquare } from "lucide-react";

/** 打开分享窗口（弹窗尺寸，noopener 防反向控制） */
export function openShareWindow(url: string) {
  window.open(url, "_blank", "noopener,noreferrer,width=680,height=560");
}

export interface ShareChannel {
  key: string;
  label: string;
  icon: typeof MessageCircle;
  className: string;
  onClick: () => void;
}

/**
 * 构建渠道列表。
 * @param translate 文案函数（保留给后续渠道文案 i18n）
 * @param shareText 分享文案（标题 + 平台名）
 * @param shareUrl 规范深链
 * @param onCopyWechat 微信渠道：复制链接并提示扫码/粘贴
 */
export function buildShareChannels({
  translate: _translate,
  shareText,
  shareUrl,
  onCopyWechat,
}: {
  translate: (key: string) => string;
  shareText: string;
  shareUrl: string;
  onCopyWechat: () => void;
}): ShareChannel[] {
  const enc = encodeURIComponent;
  return [
    {
      key: "wechat",
      label: "微信",
      icon: MessageCircle,
      className: "bg-[#07c160] hover:bg-[#06ad56]",
      // 微信无网页分享意图：复制链接并提示扫码/粘贴发送
      onClick: onCopyWechat,
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      icon: MessageSquare,
      className: "bg-[#25d366] hover:bg-[#1ebe5b]",
      onClick: () => openShareWindow(`https://api.whatsapp.com/send?text=${enc(`${shareText} ${shareUrl}`)}`),
    },
    {
      key: "gmail",
      label: "Gmail",
      icon: AtSign,
      className: "bg-[#ea4335] hover:bg-[#d33426]",
      onClick: () => openShareWindow(`https://mail.google.com/mail/?view=cm&fs=1&su=${enc(shareText)}&body=${enc(shareUrl)}`),
    },
  ];
}
