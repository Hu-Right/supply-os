/**
 * 数字人客服 — 抽屉外框展示件（自 DigitalAssistant.tsx 拆出，JSX 逐字不变）。
 * 全部 React.memo：模式配置（headerConfig）随 Header 内聚，动作全部由容器回调驱动。
 *
 * @module features/crm/components/DigitalAssistant/parts
 */
import { memo } from "react";
import { MessageCircle, X, Sparkles, User } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";

/** 浮动触发按钮（含未读角标） */
export const FloatingTrigger = memo(function FloatingTrigger({
  unreadCount,
  onOpen,
}: {
  unreadCount: number;
  onOpen: () => void;
}) {
  const { t } = useLocale();
  return (
    <Button
      type="button"
      variant="primary"
      onClick={onOpen}
      className="fixed bottom-6 end-6 z-20 px-5 py-3 rounded-full shadow-lg
        hover:bg-teal-500 hover:shadow-xl hover:scale-105
        transition-all duration-200 group
        md:bottom-6 bottom-20"
      aria-label={t("crmAssistantOpen")}
    >
      <MessageCircle className="w-5 h-5 group-hover:animate-pulse" />
      <span className="text-sm font-bold">{t("crmAssistant")}</span>
      {/* 未读消息计数 */}
      {unreadCount > 0 && (
        <span className="absolute -top-2 -end-2 min-w-[20px] h-5 px-1 bg-red-500 text-white text-2xs font-bold rounded-full border-2 border-white flex items-center justify-center">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Button>
  );
});

/** 抽屉 Header：三模式（ai/waiting/human）配色/图标/状态 + 转人工/结束会话/关闭动作 */
export const AssistantHeader = memo(function AssistantHeader({
  mode,
  agentName,
  onRequestHuman,
  onEndHumanSession,
  onClose,
}: {
  mode: "ai" | "waiting" | "human";
  agentName: string | null;
  onRequestHuman: () => void;
  onEndHumanSession: () => void;
  onClose: () => void;
}) {
  const { t } = useLocale();

  // 根据模式决定 header 样式和文案
  const headerConfig = {
    ai: {
      bgClass: "bg-gradient-to-r from-slate-900 to-slate-950",
      iconBg: "bg-teal-500",
      Icon: Sparkles,
      title: t("crmAssistantTitle"),
      statusText: t("crmAssistantAiOnline"),
      statusDot: "bg-teal-400",
    },
    waiting: {
      bgClass: "bg-gradient-to-r from-amber-900 to-amber-950",
      iconBg: "bg-amber-500",
      Icon: Sparkles,
      title: t("crmAssistantTitle"),
      statusText: t("crmAssistantConnecting"),
      statusDot: "bg-amber-400 animate-pulse",
    },
    human: {
      bgClass: "bg-gradient-to-r from-emerald-900 to-emerald-950",
      iconBg: "bg-emerald-500",
      Icon: User,
      title: agentName || t("crmAssistantTitle"),
      statusText: t("crmAssistantHumanOnline"),
      statusDot: "bg-emerald-400 animate-pulse",
    },
  };

  const config = headerConfig[mode];
  const HeaderIcon = config.Icon;

  return (
    <div className={`flex items-center justify-between p-4 ${config.bgClass} text-white`}>
      <div className="flex items-center gap-3">
        {/* 头像 */}
        <div className={`w-10 h-10 rounded-full ${config.iconBg} flex items-center justify-center`}>
          <HeaderIcon className="w-5 h-5 text-white" />
        </div>
        {/* 标题 + 状态 */}
        <div>
          <p className="text-sm font-bold">{config.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`w-2 h-2 rounded-full ${config.statusDot}`} />
            <span className="text-3xs text-slate-300">{config.statusText}</span>
          </div>
        </div>
      </div>

      {/* 操作按钮组 */}
      <div className="flex items-center gap-2">
        {/* AI 模式：显示转人工按钮 */}
        {mode === "ai" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRequestHuman}
            className="text-3xs px-3 py-1 rounded-full text-white
              border border-slate-600 hover:bg-slate-800"
          >
            {t("crmRequestHuman")}
          </Button>
        )}
        {/* 人工模式：显示结束会话按钮 */}
        {mode === "human" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onEndHumanSession}
            className="text-3xs px-3 py-1 rounded-full text-white
              border border-slate-600 hover:bg-slate-800"
          >
            {t("crmEndHumanSession")}
          </Button>
        )}
        {/* 关闭按钮 */}
        <Button
          type="button"
          variant="ghost"
          size="iconSm"
          onClick={onClose}
          className="text-white hover:bg-slate-800"
          aria-label={t("uiClose")}
        >
          <X className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
});
