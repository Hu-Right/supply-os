/**
 * 权益升级引导弹窗 — 前端主动门控的统一呈现
 * Upgrade Gate Modal
 *
 * @module features/procurement/components/UpgradeGateModal
 * @description 无权益用户触发受控功能（高级关键词行 / 产品关键词库）时弹出，
 *              取代此前"内嵌锁定态 + 后端静默降级横幅"的被动提示。
 *              门控判定由服务端 gates（/api/membership/status）驱动，本组件只呈现文案，
 *              不含任何档位常量——避免前端硬编码档位与 crm_plan_benefits 漂移。
 *              配色对齐 AiEvaluationPanel 的琥珀引导卡（amber-200/50/600）。
 */
import { Lock } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { Modal } from "@/shared/ui";

export interface UpgradeGateModalProps {
  open: boolean;
  onClose: () => void;
  /** 弹窗标题（已按语言解析） */
  title: string;
  /** 正文：说明需升级到哪一档才可用（已按语言解析） */
  description: string;
  /** 前往会员页的 CTA 文案 */
  ctaLabel: string;
}

export function UpgradeGateModal({ open, onClose, title, description, ctaLabel }: UpgradeGateModalProps) {
  const { t } = useLocale();
  return (
    <Modal open={open} onClose={onClose} title={title} className="max-w-md">
      <div className="text-center pt-2" data-testid="upgrade-gate-modal">
        <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <Lock className="h-6 w-6 text-amber-600" />
        </span>
        <p className="text-sm text-amber-700 mb-5 leading-relaxed">{description}</p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {t("procurement_upgradeGateCancel")}
          </button>
          <a
            href="/membership"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 text-sm font-bold transition-colors"
          >
            {ctaLabel}
          </a>
        </div>
      </div>
    </Modal>
  );
}
