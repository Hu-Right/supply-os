/**
 * 公告分享面板 — 容器
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
 *
 *   2026-10 组件化拆分（294→约 170 行）：剪贴板工具上收 shared/utils/clipboard，
 *   渠道定义见 ./share/channels，渠道网格见 ./share/ChannelGrid；本文件保留
 *   深链/二维码/复制状态编排。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Link2,
  Send,
  QrCode,
} from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { useLocale } from "@/core/i18n";
import { Modal } from "@/shared/ui";
import { copyToClipboard } from "@/shared/utils/clipboard";
import { buildShareChannels } from "./share/channels";
import { ChannelGrid } from "./share/ChannelGrid";

export interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  /** 公告数值 id（用于拼规范深链，缺失时回落列表页） */
  noticeId: number | undefined;
  /** 分享标题（公告标题，已按语言解析） */
  title: string;
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

  // 渠道列表：useMemo 稳定引用，ChannelGrid 的 memo 才有效
  const channels = useMemo(
    () => buildShareChannels({
      translate: t,
      shareText,
      shareUrl,
      onCopyWechat: () => {
        void handleCopy();
        toast.info(t("detail_shareWechatHint") || "链接已复制，可粘贴到微信；或让对方扫右侧二维码");
      },
    }),
    // handleCopy 仅消费 shareUrl/linkRef/toast，shareText/shareUrl 变化时重建即可
    [t, shareText, shareUrl], // eslint-disable-line react-hooks/exhaustive-deps
  );

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
        <ChannelGrid channels={channels} />
      </div>
    </Modal>
  );
}

ShareModal.displayName = "ShareModal";
