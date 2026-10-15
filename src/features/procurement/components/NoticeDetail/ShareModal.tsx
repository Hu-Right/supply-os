/**
 * 公告分享面板
 * Notice Share Modal — 自建分享入口（替代脆弱的 navigator.share）
 *
 * @module features/procurement/components/NoticeDetail/ShareModal
 * @description 修复两处分享缺陷：
 *   1) 链接直达具体公告：分享 URL 由公告数值 id 拼成规范公开详情页
 *      `/procurement/notice/{id}`（带 OG 标题/描述，登录/未登录都能看到这条公告，
 *      未登录点「打开公告详情」再引导登录解锁），不再依赖 window.location.href
 *      （SPA 详情在页内渲染、URL 恒为 /procurement 列表）。
 *   2) 渠道真实可点：各分享渠道改用标准网页分享意图（WhatsApp/Facebook/X/
 *      LinkedIn/邮件/Gmail/Outlook），微信走「复制链接 + 扫码」，复制用 sonner
 *      toast 反馈；navigator.share 仅作为可选「系统分享」并处理 AbortError。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AtSign,
  Check,
  Copy,
  Facebook,
  Inbox,
  Linkedin,
  Link2,
  Mail,
  MessageCircle,
  QrCode,
  Send,
  Twitter,
} from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { useLocale } from "@/core/i18n";
import { Modal } from "@/shared/ui";

export interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  /** 公告数值 id（用于拼规范深链，缺失时回落列表页） */
  noticeId: number | undefined;
  /** 分享标题（公告标题，已按语言解析） */
  title: string;
}

/** 打开分享窗口（弹窗尺寸，noopener 防反向控制） */
function openShareWindow(url: string) {
  window.open(url, "_blank", "noopener,noreferrer,width=680,height=560");
}

/**
 * 复制文本到剪贴板：安全上下文（HTTPS/localhost）优先用异步 Clipboard API；
 * 否则（如局域网 http://192.168.x.x）navigator.clipboard 不可用，回退到
 * document.execCommand("copy")。兜底优先选中弹窗内已渲染的元素（el）——
 * Radix Dialog 有焦点陷阱，挂到 document.body 的临时节点会被抢焦点导致选中失效。
 * 返回是否成功。
 */
async function copyToClipboard(text: string, el?: HTMLInputElement | null): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* Clipboard API 被拒（权限/失焦等），继续走 execCommand 兜底 */
    }
  }
  try {
    if (el) {
      el.focus();
      el.select();
      if (document.execCommand("copy")) return true;
    }
    // 末位兜底：无可用弹窗内元素时临时挂一个 textarea
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function ShareModal({ open, onClose, noticeId, title }: ShareModalProps) {
  const { t } = useLocale();
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  // 链接输入框（弹窗内可选中/手动复制，兼作 execCommand 兜底的选中目标）
  const linkRef = useRef<HTMLInputElement>(null);

  // 规范深链：SSR 安全（Modal 关闭时不渲染子树，此处仅客户端执行）
  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const origin = window.location.origin;
    return noticeId ? `${origin}/procurement/notice/${noticeId}` : `${origin}/procurement`;
  }, [noticeId]);

  const shareText = useMemo(() => `${title} — 云境·国际采购平台`, [title]);

  // 打开时生成二维码（qrcode 库浏览器可用）
  useEffect(() => {
    if (!open || !shareUrl) {
      setQrDataUrl("");
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(shareUrl, { width: 200, margin: 1 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [open, shareUrl]);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const handleCopy = async () => {
    const ok = await copyToClipboard(shareUrl, linkRef.current);
    if (ok) {
      setCopied(true);
      toast.success(t("detail_linkCopied") || "链接已复制");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error(t("detail_copyFailed") || "复制失败，请手动选择链接复制");
    }
  };

  const enc = encodeURIComponent;
  const channels: Array<{
    key: string;
    label: string;
    icon: typeof Link2;
    className: string;
    onClick: () => void;
  }> = [
    {
      key: "wechat",
      label: "微信",
      icon: MessageCircle,
      className: "bg-[#07c160] hover:bg-[#06ad56]",
      // 微信无网页分享意图：复制链接并提示扫码/粘贴发送
      onClick: () => {
        void handleCopy();
        toast.info(t("detail_shareWechatHint") || "链接已复制，可粘贴到微信；或让对方扫右侧二维码");
      },
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
      label: t("detail_shareEmail") || "邮件",
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

  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <Modal open={open} onClose={onClose} title={t("detail_share") || "分享"} className="max-w-md">
      <div className="space-y-5" data-testid="notice-share-modal">
        {/* ── 链接 + 复制 + 二维码 ── */}
        <div className="flex items-stretch gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <Link2 className="w-4 h-4 shrink-0 text-slate-400" />
              <input
                ref={linkRef}
                readOnly
                dir="ltr"
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                aria-label={t("detail_copyLink") || "链接"}
                className="min-w-0 flex-1 bg-transparent text-xs text-slate-600 outline-none"
                title={shareUrl}
              />
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 text-sm font-bold transition-colors"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? (t("detail_copied") || "已复制") : (t("detail_copyLink") || "复制链接")}
            </button>
            {canNativeShare && (
              <button
                type="button"
                onClick={() => {
                  navigator
                    .share({ title: shareText, url: shareUrl })
                    .catch((err) => {
                      if (err && err.name !== "AbortError") {
                        toast.error(t("detail_shareFailed") || "分享未完成");
                      }
                    });
                }}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 px-4 py-2 text-sm font-bold transition-colors"
              >
                <Send className="w-4 h-4" />
                {t("detail_systemShare") || "系统分享"}
              </button>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-center justify-center gap-1">
            {qrDataUrl ? (
              // 保留原生 <img>：qrDataUrl 为 data: 协议，next/image 不支持（与 PaymentModalCore 同口径）
              <img src={qrDataUrl} alt="QR" className="h-[92px] w-[92px] rounded-lg border border-slate-200 bg-white p-1" />
            ) : (
              <div className="flex h-[92px] w-[92px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
                <QrCode className="h-6 w-6 text-slate-300" />
              </div>
            )}
            <span className="text-2xs text-slate-400">{t("detail_scanToOpen") || "扫码打开"}</span>
          </div>
        </div>

        {/* ── 分享方式 ── */}
        <div>
          <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-slate-400">
            {t("detail_shareVia") || "分享到"}
          </p>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
            {channels.map((c) => {
              const Icon = c.icon;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={c.onClick}
                  title={c.label}
                  aria-label={c.label}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-3 text-white transition-colors ${c.className}`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-2xs font-semibold leading-none">{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}

ShareModal.displayName = "ShareModal";
