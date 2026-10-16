/**
 * 公告分享渠道定义（自 ShareModal.tsx 拆出，渠道与意图 URL 逐字不变）。
 *
 * 纯数据工厂（无 React 依赖）：各分享渠道改用标准网页分享意图
 * （WhatsApp/Facebook/X/LinkedIn/邮件/Gmail/Outlook），微信走「复制链接 + 扫码」。
 * navigator.share 仅作为主面板的可选「系统分享」，不在渠道网格内。
 *
 * @module features/procurement/components/NoticeDetail/share/channels
 */
import {
  AtSign,
  Facebook,
  Inbox,
  Linkedin,
  MessageCircle,
  Send,
  Twitter,
  Mail,
  Link2,
} from "lucide-react";

/** 打开分享窗口（弹窗尺寸，noopener 防反向控制） */
export function openShareWindow(url: string) {
  window.open(url, "_blank", "noopener,noreferrer,width=680,height=560");
}

export interface ShareChannel {
  key: string;
  label: string;
  icon: typeof Link2;
  className: string;
  onClick: () => void;
}

/**
 * 构建渠道列表。
 * @param translate 文案函数（邮件标签需 i18n）
 * @param shareText 分享文案（标题 + 平台名）
 * @param shareUrl 规范深链
 * @param onCopyWechat 微信渠道：复制链接并提示扫码/粘贴
 */
export function buildShareChannels({
  translate,
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
      icon: MessageCircle,
      className: "bg-[#25d366] hover:bg-[#1ebe5b]",
      onClick: () => openShareWindow(`https://api.whatsapp.com/send?text=${enc(`${shareText} ${shareUrl}`)}`),
    },
    {
      key: "facebook",
      label: "Facebook",
      icon: Facebook,
      className: "bg-[#1877f2] hover:bg-[#0f65d8]",
      onClick: () => openShareWindow(`https://www.facebook.com/sharer/sharer.php?u=${enc(shareUrl)}`),
    },
    {
      key: "twitter",
      label: "X / Twitter",
      icon: Twitter,
      className: "bg-black hover:bg-neutral-800",
      onClick: () => openShareWindow(`https://twitter.com/intent/tweet?text=${enc(shareText)}&url=${enc(shareUrl)}`),
    },
    {
      key: "linkedin",
      label: "LinkedIn",
      icon: Linkedin,
      className: "bg-[#0a66c2] hover:bg-[#0857a6]",
      onClick: () => openShareWindow(`https://www.linkedin.com/sharing/share-offsite/?url=${enc(shareUrl)}`),
    },
    {
      key: "telegram",
      label: "Telegram",
      icon: Send,
      className: "bg-[#229ed9] hover:bg-[#1c8bc0]",
      onClick: () => openShareWindow(`https://t.me/share/url?url=${enc(shareUrl)}&text=${enc(shareText)}`),
    },
    {
      key: "email",
      label: translate("detail_shareEmail") || "邮件",
      icon: Mail,
      className: "bg-slate-600 hover:bg-slate-700",
      onClick: () => {
        window.location.href = `mailto:?subject=${enc(shareText)}&body=${enc(shareUrl)}`;
      },
    },
    {
      key: "gmail",
      label: "Gmail",
      icon: AtSign,
      className: "bg-[#ea4335] hover:bg-[#d33426]",
      onClick: () => openShareWindow(`https://mail.google.com/mail/?view=cm&fs=1&su=${enc(shareText)}&body=${enc(shareUrl)}`),
    },
    {
      key: "outlook",
      label: "Outlook",
      icon: Inbox,
      className: "bg-[#0f6cbd] hover:bg-[#0d5aa0]",
      onClick: () => openShareWindow(`https://outlook.live.com/mail/0/deeplink/compose?subject=${enc(shareText)}&body=${enc(shareUrl)}`),
    },
  ];
}
