/**
 * 员工推广二维码生成器
 * Employee Promotion QR Code Generator
 *
 * @module features/crm/components/PromotionQRCode
 * @description 员工自助生成推广二维码，编码内容为本站 /r/[code] 链接，
 *              扫码后直接写入 ref_code Cookie 并跳转落地页，不依赖任何第三方服务。
 *              Uses the existing `qrcode` npm package (already in dependencies).
 */
"use client";

import { useCallback, useRef, useState } from "react";
import { Download, QrCode, CheckCircle2, Link2 } from "lucide-react";
import { Button } from "@/shared/ui";

/** 员工邀请码格式（与 /r/[code] 路由的 CODE_PATTERN 一致） */
const CODE_PATTERN = /^EMP-[A-Z0-9]{4,12}$/i;

/** 站点 URL（与 server 端 SITE_URL 保持同源） */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://osneosmart.com";

export default function PromotionQRCode() {
  const [code, setCode] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [fullUrl, setFullUrl] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleGenerate = useCallback(async () => {
    setError("");
    setQrDataUrl(null);
    setCopied(false);

    const trimmed = code.trim().toUpperCase();
    if (!CODE_PATTERN.test(trimmed)) {
      setError("邀请码格式不正确，应为 EMP-XXXXXXXX（4~12 位字母数字）");
      return;
    }

    const url = `${SITE_URL}/r/${trimmed}`;
    setFullUrl(url);

    try {
      const QRCode = (await import("qrcode")).default;
      // 生成 canvas 以便后续下载高清 PNG
      const canvas = document.createElement("canvas");
      await QRCode.toCanvas(canvas, url, {
        width: 480,
        margin: 2,
        color: { dark: "#1e293b", light: "#ffffff" },
      });
      canvasRef.current = canvas;
      setQrDataUrl(canvas.toDataURL("image/png"));
    } catch {
      setError("二维码生成失败，请重试");
    }
  }, [code]);

  const handleDownload = useCallback(() => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `推广码-${code.trim().toUpperCase()}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  }, [code]);

  const handleCopyUrl = useCallback(async () => {
    if (!fullUrl) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const input = document.createElement("input");
      input.value = fullUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [fullUrl]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleGenerate();
    },
    [handleGenerate],
  );

  return (
    <div className="rounded-2xl border-2 border-slate-200 bg-white p-5 space-y-5">
      {/* 标题 */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
          <QrCode className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900">推广二维码生成</h3>
          <p className="text-xs text-slate-500">
            输入您的员工邀请码，生成专属推广二维码。扫码后用户直接进入资质表单页，自动绑定推荐关系。
          </p>
        </div>
      </div>

      {/* 输入区 */}
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="请输入邀请码，如 EMP-XCAO26A1"
          className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-mono placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          maxLength={20}
        />
        <Button
          type="button"
          variant="primary"
          onClick={handleGenerate}
          className="rounded-xl px-5 py-2.5 text-sm font-bold"
        >
          生成二维码
        </Button>
      </div>

      {/* 错误提示 */}
      {error && (
        <p className="text-sm font-bold text-rose-600">{error}</p>
      )}

      {/* 二维码展示 */}
      {qrDataUrl && (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-xl border-2 border-slate-200 bg-white p-3">
              {/* data URL 无法使用 next/image，用原生 img */}
              <img
                src={qrDataUrl}
                alt={`推广二维码 - ${code.trim().toUpperCase()}`}
                className="h-56 w-56 object-contain"
              />
            </div>
            <p className="text-xs text-slate-500">
              扫码直达：<span className="font-mono text-teal-700">{fullUrl}</span>
            </p>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="primary"
              onClick={handleDownload}
              className="flex-1 rounded-xl py-2.5 text-sm font-bold"
            >
              <Download className="me-1.5 h-4 w-4" />
              下载二维码图片
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleCopyUrl}
              className="rounded-xl px-4 py-2.5 text-sm font-bold"
            >
              {copied ? (
                <CheckCircle2 className="me-1.5 h-4 w-4 text-teal-600" />
              ) : (
                <Link2 className="me-1.5 h-4 w-4" />
              )}
              {copied ? "已复制" : "复制链接"}
            </Button>
          </div>

          {/* 使用说明 */}
          <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
            <p className="font-bold text-slate-700">使用说明：</p>
            <p>• 下载二维码图片后，可印刷在海报、传单、名片等推广物料上</p>
            <p>• 用户扫码后直接打开资质表单页，自动绑定您的邀请码</p>
            <p>• 用户提交表单后，即计入您的业绩</p>
            <p>• 「复制链接」可直接在微信、邮件等线上渠道分享</p>
          </div>
        </div>
      )}
    </div>
  );
}
