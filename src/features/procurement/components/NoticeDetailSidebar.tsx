/**
 * 公告详情侧边栏（移动端固定底栏）
 * Notice Detail Sidebar — Mobile Action Bar
 *
 * @module features/procurement/components/NoticeDetailSidebar
 * @description 桌面端右栏内容（会员状态卡 + 下一步动作卡）已并入 NoticeDetail 主栅格，
 *              本组件仅承担移动端固定底栏升级 CTA（仅免费用户可见；2026-10-30
 *              感兴趣/订阅商机按钮退役，会员内容全可见 ⇒ 底栏整体不渲染）。
 *              桌面端（md 以上）隐藏，避免与 NextStepsPanel 重复渲染操作按钮。
 */
import { Crown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import type { NoticeItem, MembershipStatusView } from "../types";

export interface NoticeDetailSidebarProps {
  notice: NoticeItem;
  membership: MembershipStatusView | null;
  canUsePaidQuota: boolean;
  isVip: boolean;
  /** 总可用解锁次数 */
  totalRemaining: number;
  /** 是否已登录 */
  isLoggedIn: boolean;
}

export function NoticeDetailSidebar({
  notice,
  canUsePaidQuota,
}: NoticeDetailSidebarProps) {
  const router = useRouter();
  const { t } = useLocale();

  // 2026-10-30：感兴趣/订阅退役后底栏仅剩升级 CTA——会员（内容全可见）无可用动作，整条不渲染
  if (canUsePaidQuota) return null;

  // P3-13 修复：移动端 320px 窄屏下按钮文案溢出——flex-1 均分宽度 + min-w-0 允许
  // truncate 生效 + 文案包裹 truncate span。
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 flex gap-2 border-t border-slate-200 bg-white/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-lg backdrop-blur-md md:hidden">
      <Button
        onClick={() => router.push(`/membership?notice_id=${notice.noticePk}`)}
        variant="cta"
        className="flex-1 min-w-0 gap-1.5 px-2 text-xs py-2.5 font-semibold"
      >
        <Crown className="w-4 h-4 shrink-0" />
        <span className="truncate">{t("procurement_upgradeToUnlock")}</span>
      </Button>
    </div>
  );
}

