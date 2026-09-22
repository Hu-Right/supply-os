/**
 * 状态标签组件
 * Status Badge Component
 *
 * @module shared/ui/StatusBadge
 * @description 采购公告状态标签：NEW / 即将截止 / 已更新 / 含附件 / 会员解锁。
 *              颜色与图标按变体区分，closing-soon 时显示剩余天数。
 */
import { Flame, Clock, RefreshCw, Paperclip, Lock } from "lucide-react";
import type { BadgeVariant } from "@/shared/utils/dataQuality";

export interface StatusBadgeProps {
  variant: BadgeVariant;
  /** 截止日期 Unix 秒（closing-soon 时计算剩余天数） */
  deadlineSec?: number;
}

const VARIANT_CONFIG: Record<BadgeVariant, {
  label: string;
  bg: string;
  border: string;
  text: string;
  icon: typeof Flame;
}> = {
  "new": {
    label: "NEW",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    icon: Flame,
  },
  "closing-soon": {
    label: "即将截止",
    bg: "bg-rose-50",
    border: "border-rose-200",
    text: "text-rose-700",
    icon: Clock,
  },
  "updated": {
    label: "已更新",
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    icon: RefreshCw,
  },
  "has-attachment": {
    label: "含附件",
    bg: "bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-600",
    icon: Paperclip,
  },
  "member-unlock": {
    label: "会员解锁",
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    icon: Lock,
  },
};

/** 状态标签 */
export function StatusBadge({ variant, deadlineSec }: StatusBadgeProps) {
  const config = VARIANT_CONFIG[variant];
  const Icon = config.icon;

  // closing-soon 时计算剩余天数追加到标签
  let label = config.label;
  if (variant === "closing-soon" && deadlineSec && deadlineSec > 0) {
    const daysLeft = Math.ceil((deadlineSec - Date.now() / 1000) / (24 * 3600));
    if (daysLeft > 0 && daysLeft <= 7) {
      label = `剩 ${daysLeft} 天`;
    }
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-2xs font-bold ${config.bg} ${config.border} ${config.text}`}
      title={config.label}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}
