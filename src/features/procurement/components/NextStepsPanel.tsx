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
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";
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
  /** 点击"上传资料"的回调 */
  onUploadMaterials?: () => void;
  /** 点击"解锁内容"的回调 */
  onUnlock?: () => void;
  /** 点击"预约顾问"的回调 */
  onBookConsultant?: () => void;
  /** 点击"加入 CRM"的回调 */
  onJoinCrm?: () => void;
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
  onUploadMaterials,
  onUnlock,
  onBookConsultant,
  onJoinCrm,
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
          router.push(`/auth/login?redirect=/supplier-qualification?notice_id=${notice.id}`);
        } else {
          router.push(`/supplier-qualification?notice_id=${notice.id}`);
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
    <aside className="rounded-2xl border border-slate-200 bg-white p-5 sticky top-24">
      <h3 className="text-base font-extrabold text-slate-900 mb-4">
        {t("detail_nextStepsTitle") || "下一步动作"}
      </h3>
      <div className="space-y-3">
        {steps.map((step) => {
          const tierStyle = TIER_STYLES[step.tier];
          const Icon = step.icon;
          return (
            <button
              key={step.titleDefault}
              onClick={step.onClick}
              className="w-full flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3.5 hover:border-teal-200 hover:bg-teal-50/50 transition-colors text-left group"
            >
              <div className="shrink-0 w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center group-hover:border-teal-300 transition-colors">
                <Icon className="w-5 h-5 text-slate-600 group-hover:text-teal-700 transition-colors" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">
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

      {/* 非 VIP 用户：底部升级提示 */}
      {!isVip && (
        <div className="mt-4 pt-4 border-t border-slate-200">
          <button
            onClick={() => router.push(`/membership?notice_id=${notice.id}`)}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white py-3 font-bold text-sm transition-colors"
          >
            <Crown className="w-4 h-4" />
            <Briefcase className="w-4 h-4" />
            {t("detail_upgradeUnlock") || "升级会员，解锁完整执行信息"}
          </button>
        </div>
      )}
    </aside>
  );
}
