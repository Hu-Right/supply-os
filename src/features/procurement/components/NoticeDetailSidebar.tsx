/**
 * 公告详情侧边栏（移动端固定底栏）
 * Notice Detail Sidebar — Mobile Action Bar
 *
 * @module features/procurement/components/NoticeDetailSidebar
 * @description 桌面端右栏内容（会员状态卡 + 下一步动作卡）已并入 NoticeDetail 主栅格，
 *              本组件仅承担移动端固定底栏三操作按钮（感兴趣/订阅/解锁）。
 *              桌面端（md 以上）隐藏，避免与 NextStepsPanel 重复渲染操作按钮。
 */
import { Bell, Heart, Lock, Crown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import type { NoticeItem, MembershipStatus } from "../types";

export interface NoticeDetailSidebarProps {
  notice: NoticeItem;
  membership: MembershipStatus | null;
  canUsePaidQuota: boolean;
  isVip: boolean;
  /** 总可用解锁次数 */
  totalRemaining: number;
  /** 是否已登录 */
  isLoggedIn: boolean;
  /** 骨架屏期间隐藏付费解锁按钮，防闪变 */
  showSkeleton: boolean;
  onExpressInterest: (notice: NoticeItem, type: "interested" | "subscribed") => void;
  onUnlock: (notice: NoticeItem) => void;
}

export function NoticeDetailSidebar({
  notice,
  canUsePaidQuota,
  onExpressInterest,
  onUnlock,
}: NoticeDetailSidebarProps) {
  const router = useRouter();
  const { t } = useLocale();

  // P3-13 修复：移动端 320px 窄屏下按钮文案溢出——flex-1 均分宽度 + min-w-0 允许
  // truncate 生效 + 文案包裹 truncate span。
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 flex gap-2 border-t border-slate-200 bg-white/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-lg backdrop-blur-md md:hidden">
      <Button
        onClick={() => onExpressInterest(notice, "interested")}
        variant="primary"
        className="flex-1 min-w-0 gap-1.5 px-2 text-xs py-2.5 font-semibold"
      >
        <Heart className="w-4 h-4 shrink-0" />
        <span className="truncate">{t("procurement_interested")}</span>
      </Button>
      <Button
        onClick={() => onExpressInterest(notice, "subscribed")}
        variant="dark"
        className="flex-1 min-w-0 gap-1.5 px-2 text-xs py-2.5 font-semibold"
      >
        <Bell className="w-4 h-4 shrink-0 text-amber-300" />
        <span className="truncate">{t("procurement_subscribeNotice")}</span>
      </Button>
      <Button
        onClick={() => (canUsePaidQuota ? onUnlock(notice) : router.push(`/membership?notice_id=${notice.id}`))}
        variant={canUsePaidQuota ? "secondary" : "cta"}
        className="flex-1 min-w-0 gap-1.5 px-2 text-xs py-2.5 font-semibold"
      >
        {canUsePaidQuota ? <Lock className="w-4 h-4 shrink-0" /> : <Crown className="w-4 h-4 shrink-0" />}
        <span className="truncate">
          {canUsePaidQuota ? t("procurement_memberUnlock") : t("procurement_upgradeToUnlock")}
        </span>
      </Button>
    </div>
  );
}
