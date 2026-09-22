/**
 * 下一步动作面板
 * Next Steps Panel — 4-Step Action Guide
 *
 * @module features/procurement/components/NextStepsPanel
 * @description 详情页右侧 4 步引导面板：上传资料 → 解锁内容 → 预约顾问 → CRM 跟进。
 *              每步标注权益层级（免费/会员/专业服务），点击触发对应动作。
 *              面板固定在首屏可视区域，无需滚动即可操作。
 */
import {
  Upload,
  FileText,
  UserCheck,
  MessageSquareText,
  Crown,
  Briefcase,
  Heart,
  Bell,
  Lock,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import type { NoticeItem } from "../types";

/** 步骤权益层级 */
type StepTier = "free" | "member" | "professional";

export interface NextStep {
  icon: typeof Upload;
  titleKey: string;
  titleDefault: string;
  tier: StepTier;
  tierLabelKey: string;
  tierLabelDefault: string;
}

export interface NextStepsPanelProps {
  notice: NoticeItem;
  /** 是否已登录 */
  isLoggedIn: boolean;
  /** 是否为 VIP 会员 */
  isVip: boolean;
  /** 是否可使用付费配额 */
  canUsePaidQuota?: boolean;
  /** 点击"上传资料"的回调 */
  onUploadMaterials?: () => void;
  /** 点击"解锁内容"的回调 */
  onUnlock?: () => void;
  /** 点击"预约顾问"的回调 */
  onBookConsultant?: () => void;
  /** 点击"加入 CRM"的回调 */
  onJoinCrm?: () => void;
  /** 点击"感兴趣"的回调 */
  onExpressInterest?: (type: "interested" | "subscribed") => void;
}

const TIER_STYLES: Record<StepTier, { bg: string; text: string; border: string }> = {
  free: { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200" },
  member: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  professional: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
};

/** 下一步动作面板 */
export function NextStepsPanel({
  notice,
  isLoggedIn,
  isVip,
  canUsePaidQuota,
  onUploadMaterials,
  onUnlock,
  onBookConsultant,
  onJoinCrm,
  onExpressInterest,
}: NextStepsPanelProps) {
  const { t } = useLocale();
  const router = useRouter();

  const steps: Array<NextStep & { onClick: () => void }> = [
    {
      icon: Upload,
      titleKey: "detail_stepUpload",
      titleDefault: "上传企业资料 → 匹配能力",
      tier: "free",
      tierLabelKey: "detail_tierFree",
      tierLabelDefault: "免费",
      onClick: () => {
        if (onUploadMaterials) {
          onUploadMaterials();
        } else if (!isLoggedIn) {
          router.push(`/auth/login?redirect=/procurement/qualification%3Fnotice_id%3D${notice.id}`);
        } else {
          router.push(`/procurement/qualification?notice_id=${notice.id}`);
        }
      },
    },
    {
      icon: FileText,
      titleKey: "detail_stepUnlock",
      titleDefault: "解锁原始文件与附件",
      tier: "member",
      tierLabelKey: "detail_tierMember",
      tierLabelDefault: "会员",
      onClick: () => {
        if (onUnlock) {
          onUnlock();
        } else if (!isLoggedIn) {
          router.push(`/auth/login?redirect=/procurement?notice_id=${notice.id}`);
        } else {
          router.push(`/membership?notice_id=${notice.id}`);
        }
      },
    },
    {
      icon: UserCheck,
      titleKey: "detail_stepConsultant",
      titleDefault: "预约标书顾问",
      tier: "professional",
      tierLabelKey: "detail_tierPro",
      tierLabelDefault: "专业服务",
      onClick: () => {
        if (onBookConsultant) {
          onBookConsultant();
        } else {
          router.push(`/services?notice_id=${notice.id}`);
        }
      },
    },
    {
      icon: MessageSquareText,
      titleKey: "detail_stepCrm",
      titleDefault: "加入CRM跟进",
      tier: "free",
      tierLabelKey: "detail_tierFree",
      tierLabelDefault: "免费",
      onClick: () => {
        if (onJoinCrm) {
          onJoinCrm();
        } else if (!isLoggedIn) {
          router.push(`/auth/login?redirect=/crm`);
        } else {
          router.push(`/crm`);
        }
      },
    },
  ];

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-extrabold text-slate-900 mb-3">
        {t("detail_nextStepsTitle") || "下一步动作"}
      </h3>
      <div className="space-y-2">
        {steps.map((step) => {
          const tierStyle = TIER_STYLES[step.tier];
          const Icon = step.icon;
          return (
            <button
              key={step.titleDefault}
              onClick={step.onClick}
              className="w-full flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50 p-2.5 hover:border-teal-200 hover:bg-teal-50/50 transition-colors text-left group"
            >
              <div className="shrink-0 w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center group-hover:border-teal-300 transition-colors">
                <Icon className="w-4 h-4 text-slate-600 group-hover:text-teal-700 transition-colors" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate">
                  {t(step.titleKey) || step.titleDefault}
                </p>
              </div>
              <span
                className={`shrink-0 px-2 py-0.5 rounded border text-2xs font-bold ${tierStyle.bg} ${tierStyle.text} ${tierStyle.border}`}
              >
                {t(step.tierLabelKey) || step.tierLabelDefault}
              </span>
            </button>
          );
        })}
      </div>

      {/* 操作按钮组：仅桌面右列显示；移动端由固定底栏（NoticeDetailSidebar）承担，隐藏避免重复 */}
      <div className="mt-3 pt-3 border-t border-slate-200 hidden md:flex gap-2">
        <Button onClick={() => onExpressInterest?.("interested")} variant="primary" className="flex-1 min-w-0 gap-1.5 px-2 py-2 text-xs">
          <Heart className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{t("procurement_interested") || "感兴趣"}</span>
        </Button>
        <Button onClick={() => onExpressInterest?.("subscribed")} variant="dark" className="flex-1 min-w-0 gap-1.5 px-2 py-2 text-xs">
          <Bell className="w-3.5 h-3.5 shrink-0 text-amber-300" />
          <span className="truncate">{t("procurement_subscribeNotice") || "订阅商机"}</span>
        </Button>
        <Button
          onClick={() => (canUsePaidQuota ? onUnlock?.() : router.push(`/membership?notice_id=${notice.id}`))}
          variant={canUsePaidQuota ? "secondary" : "cta"}
          className="flex-1 min-w-0 gap-1.5 px-2 py-2 text-xs"
        >
          {canUsePaidQuota ? <Lock className="w-3.5 h-3.5 shrink-0" /> : <Crown className="w-3.5 h-3.5 shrink-0" />}
          <span className="truncate">{canUsePaidQuota ? (t("procurement_memberUnlock") || "会员查看") : (t("procurement_upgradeToUnlock") || "升级会员解锁")}</span>
        </Button>
      </div>

      {/* 非 VIP 用户：底部升级提示（移动端由固定底栏承担，隐藏） */}
      {!isVip && (
        <div className="mt-3 pt-3 border-t border-slate-200 hidden md:block">
          <Button
            onClick={() => router.push(`/membership?notice_id=${notice.id}`)}
            variant="dark"
            className="w-full rounded-xl py-3 text-sm"
          >
            <Crown className="w-4 h-4" />
            <Briefcase className="w-4 h-4" />
            {t("detail_upgradeUnlock") || "升级会员，解锁完整执行信息"}
          </Button>
        </div>
      )}
    </aside>
  );
}
