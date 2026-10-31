/**
 * 下一步动作面板
 * Next Steps Panel — Action Guide (benefit-matrix driven)
 *
 * @module features/procurement/components/NextStepsPanel
 * @description 详情页右侧动作区（2026-10-29 权益大一统）：
 *              每个动作标注它对应的套餐权益（evidence_library / original_file_access /
 *              concierge_service / order_crm），角标状态由服务端权益矩阵 gates 下发，
 *              与详情页 Tab 同源；不再硬编码「免费 / 会员 / 专业服务」档位标签。
 *              面板固定在首屏可视区域，无需滚动即可操作。
 */
import {
  Upload,
  FileText,
  UserCheck,
  MessageSquareText,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { emitAppEvent } from "@/core/events";
import { useLocale } from "@/core/i18n";
import { Badge } from "@/shared/ui";
import type { GateState } from "@/types";
import type { NoticeItem } from "../types";
import { GATE_BADGE_STYLE, GATE_LABEL_KEY } from "./NoticeDetail/utils";

export interface NextStep {
  icon: typeof Upload;
  titleKey: string;
  titleDefault: string;
  /** 该动作对应的套餐权益码（矩阵 SSOT）：角标状态 = gates[benefitCode]，与详情页 Tab 同源 */
  benefitCode: string;
  onClick: () => void;
}

export interface NextStepsPanelProps {
  notice: NoticeItem;
  /** 是否已登录 */
  isLoggedIn: boolean;
  /** 服务端按权益矩阵下发的门控状态（/api/membership/status） */
  gates?: Record<string, GateState> | undefined;
  /** 当前公告是否已解锁（会员打开即自动解锁）：决定「查看原始文件」是切 Tab 还是发起解锁 */
  coreUnlocked?: boolean;
  /** 点击"完善企业资料"的回调 */
  onUploadMaterials?: () => void;
  /** 点击"查看原始文件"且尚未解锁时的回调 */
  onUnlock?: () => void;
  /** 点击"查看原始文件"且已解锁的回调（切到原始文件 Tab） */
  onViewFiles?: () => void;
  /** 点击"预约顾问"的回调 */
  onBookConsultant?: () => void;
  /** 点击"加入跟进"的回调 */
  onJoinCrm?: () => void;
}

/** 下一步动作面板 */
export function NextStepsPanel({
  notice,
  isLoggedIn,
  gates,
  coreUnlocked,
  onUploadMaterials,
  onUnlock,
  onViewFiles,
  onBookConsultant,
  onJoinCrm,
}: NextStepsPanelProps) {
  const { t } = useLocale();
  const router = useRouter();
  const goMembership = () => router.push(`/membership?notice_id=${notice.noticePk}`);
  /** 与详情页 Tab 同一份门控：缺数据保守回退「需升级」 */
  const gateOf = (code: string): GateState => gates?.[code] ?? "upgrade";

  const steps: NextStep[] = [
    {
      icon: Upload,
      titleKey: "detail_stepUpload",
      titleDefault: "完善企业资料 → 生成能力画像",
      benefitCode: "evidence_library",
      onClick: () => {
        if (onUploadMaterials) {
          onUploadMaterials();
        } else if (!isLoggedIn) {
          // 全站登录是 layout-shell 里的 AuthModal 弹窗，没有 /auth/login 路由（历史写法会 404）。
          // 弹窗登录后用户仍停留在详情页，需再次点击「完善企业资料」进入诊断页。
          emitAppEvent("supply-os:require-login");
        } else {
          router.push("/procurement/diagnosis");
        }
      },
    },
    {
      icon: FileText,
      titleKey: "detail_stepUnlock",
      titleDefault: "查看 / 下载原始文件",
      benefitCode: "original_file_access",
      onClick: () => {
        if (!isLoggedIn) {
          emitAppEvent("supply-os:require-login");
          return;
        }
        const state = gateOf("original_file_access");
        const included = state === "included" || state === "free";
        if (!included) {
          goMembership();
          return;
        }
        // 会员打开详情会自动解锁，解锁后本动作改为「切到原始文件 Tab」而不是重复解锁
        if (coreUnlocked) {
          onViewFiles?.();
          return;
        }
        if (onUnlock) {
          onUnlock();
          return;
        }
        goMembership();
      },
    },
    {
      icon: UserCheck,
      titleKey: "detail_stepConsultant",
      titleDefault: "人工服务包 · 预约顾问",
      benefitCode: "concierge_service",
      onClick: () => {
        if (onBookConsultant) {
          onBookConsultant();
        } else {
          router.push(`/services?notice_id=${notice.noticePk}`);
        }
      },
    },
    {
      icon: MessageSquareText,
      titleKey: "detail_stepCrm",
      titleDefault: "履约台账 · 加入跟进",
      benefitCode: "order_crm",
      onClick: () => {
        if (onJoinCrm) {
          onJoinCrm();
        } else if (!isLoggedIn) {
          emitAppEvent("supply-os:require-login");
        } else {
          router.push("/crm");
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
          const state = gateOf(step.benefitCode);
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
              <Badge shape="tag" variant={GATE_BADGE_STYLE[state]} className="shrink-0 text-2xs font-bold px-2 py-0.5">
                {t(GATE_LABEL_KEY[state]) || state}
              </Badge>
            </button>
          );
        })}
      </div>
      {/* 2026-10-29 操作条大一统：感兴趣/订阅/升级会员上移至详情头操作条（DetailHeader），
          本面板回归纯「下一步动作」（权益推进路径）；移动端仍由固定底栏承担 */}
    </aside>
  );
}
