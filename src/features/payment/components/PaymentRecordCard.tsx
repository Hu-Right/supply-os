/**
 * 采购记录卡片（订单/解锁列表复用）
 * Purchase record card (shared by order & unlock lists)
 *
 * @module features/payment/components/PaymentRecordCard
 * @description 纯展示组件：标题 + 状态徽章 + 元信息网格 + 可选关联公告链接
 *              Presentational: title + status badge + meta grid + optional notice link
 */

import { ArrowRight, ExternalLink } from "lucide-react";
import { Badge, Card, type BadgeProps } from "@/shared/ui";

export interface PaymentRecordMeta {
  label: string;
  value: string;
}

export interface PaymentRecordCardProps {
  /** 主标题 */
  title: string;
  /** 右上角状态文案 */
  statusLabel: string;
  /** 状态徽章变体 */
  statusVariant?: BadgeProps["variant"];
  /** 金额展示（可选，如 ¥8800） */
  amountLabel?: string;
  /** 元信息网格 */
  meta: PaymentRecordMeta[];
  /** 关联公告标题（可选） */
  noticeTitle?: string | null;
  /** 关联公告外链（可选） */
  noticeUrl?: string | null;
  /** "查看公告"链接文案 */
  noticeLinkLabel: string;
  /** 点击"打开详情"回调（可选，存在时渲染站内跳转按钮） */
  onOpenNotice?: () => void;
  /** "打开详情"按钮文案 */
  openLabel?: string;
}

export function PaymentRecordCard({
  title,
  statusLabel,
  statusVariant = "default",
  amountLabel,
  meta,
  noticeTitle,
  noticeUrl,
  noticeLinkLabel,
  onOpenNotice,
  openLabel,
}: PaymentRecordCardProps) {
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-extrabold text-slate-900 break-words min-w-0">{title}</h4>
        <Badge variant={statusVariant} className="shrink-0">
          {statusLabel}
        </Badge>
      </div>

      {amountLabel && (
        <p className="text-lg font-black text-teal-700">{amountLabel}</p>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        {meta.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="font-black text-slate-400 uppercase">{row.label}</dt>
            <dd className="font-bold text-slate-700 mt-0.5 break-words">{row.value}</dd>
          </div>
        ))}
      </dl>

      {noticeTitle && (
        <div className="border-t border-slate-100 pt-3 space-y-2">
          {noticeUrl ? (
            <a
              href={noticeUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:underline break-words"
            >
              {noticeLinkLabel}：{noticeTitle}
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </a>
          ) : (
            <p className="text-xs font-bold text-slate-600 break-words">
              {noticeLinkLabel}：{noticeTitle}
            </p>
          )}
          {onOpenNotice && (
            <button
              onClick={onOpenNotice}
              className="inline-flex items-center gap-1.5 text-xs font-black text-teal-700 hover:text-teal-800 cursor-pointer"
            >
              {openLabel}
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

PaymentRecordCard.displayName = "PaymentRecordCard";
