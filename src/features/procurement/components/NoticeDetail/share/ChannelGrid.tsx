"use client";

/**
 * 公告分享 — 渠道网格（自 ShareModal.tsx 拆出，JSX 逐字不变）。
 * 展示组件：渠道数据由 share/channels 工厂构建后经 props 下传。
 *
 * @module features/procurement/components/NoticeDetail/share/ChannelGrid
 */
import { memo } from "react";
import { useLocale } from "@/core/i18n";
import type { ShareChannel } from "./channels";

export const ChannelGrid = memo(function ChannelGrid({ channels }: { channels: ShareChannel[] }) {
  const { t } = useLocale();
  return (
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
  );
});
