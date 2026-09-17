/**
 * 企业信息卡 — 智谱极简风（展示组件）
 * Enterprise Info Card
 *
 * @module features/auth/components/EnterpriseInfoCard
 * @description 展示已绑定供应商的企业信息（label:value 内联网格）+ 右侧操作按钮；
 *              未绑定显示引导+立即绑定；加载中骨架屏；加载失败错误+重试。
 *              纯展示，数据由 useEnterpriseInfo 提供，动作经 props 回调。
 */
import { Building2 } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { Supplier } from "@/types";

const btnBlue = "px-4 py-1.5 rounded-md bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors shrink-0";
const btnPlain = "px-4 py-1.5 rounded-md bg-white border border-border text-xs font-medium text-foreground hover:bg-secondary-50 transition-colors shrink-0";

export interface EnterpriseInfoCardProps {
  supplier: Supplier | null;
  /** 绑定/审核状态（crm_users.supplier_link_status） */
  bindingStatus?: string;
  /** 会员等级（crm_users.membership_tier） */
  membershipTier?: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onManage: () => void;
  onBind: () => void;
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5 min-w-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}：</span>
      <span className="text-sm text-foreground truncate" title={value}>{value || "-"}</span>
    </div>
  );
}

export function EnterpriseInfoCard({
  supplier, bindingStatus, membershipTier,
  loading, error, onRetry, onManage, onBind,
}: EnterpriseInfoCardProps) {
  const { t, locale } = useLocale();
  const zh = locale === "zh";

  // ── 加载中：骨架屏 ──
  if (loading) {
    return (
      <div className="bg-secondary-50 border border-border rounded-lg px-6 py-5 animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-secondary-200" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-secondary-200 rounded w-1/3" />
            <div className="h-3 bg-secondary-200 rounded w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  // ── 加载失败：错误 + 重试 ──
  if (error) {
    return (
      <div className="bg-secondary-50 border border-border rounded-lg px-6 py-5 flex items-center gap-4">
        <span className="w-10 h-10 rounded-full bg-secondary-200 text-secondary-500 flex items-center justify-center shrink-0">
          <Building2 className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{t("authEnterpriseTitle") || "企业信息"}</p>
          <p className="text-xs text-danger-600 mt-1">{t("authEnterpriseLoadError") || "企业信息加载失败"}</p>
        </div>
        <button type="button" onClick={onRetry} className={btnPlain}>
          {t("authEnterpriseRetry") || "重试"}
        </button>
      </div>
    );
  }

  // ── 未绑定：引导 + 立即绑定 ──
  if (!supplier) {
    return (
      <div className="bg-secondary-50 border border-border rounded-lg px-6 py-5 flex items-center gap-4">
        <span className="w-10 h-10 rounded-full bg-secondary-200 text-secondary-500 flex items-center justify-center shrink-0">
          <Building2 className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{t("authEnterpriseTitle") || "企业信息"}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t("authEnterpriseNotBoundDesc") || "绑定企业后即可展示企业信息并参与国际采购撮合"}
          </p>
        </div>
        <button type="button" onClick={onBind} className={btnBlue}>
          {t("authEnterpriseBindNow") || "立即绑定"}
        </button>
      </div>
    );
  }

  // ── 已绑定：label:value 网格 + 右侧管理按钮 ──
  const name = supplier.nameZh || "-";
  const typeLabel = supplier.type === "international"
    ? (t("authEnterpriseTypeIntl") || "国际")
    : (t("authEnterpriseTypeDomestic") || "国内");
  const certs = (supplier.complianceLabelsZh || []).join("、");
  const products = (zh ? supplier.mainProductsZh : supplier.mainProductsEn || supplier.mainProductsZh || []).join("、");
  const location = [zh ? supplier.countryZh : supplier.countryEn, zh ? supplier.cityZh : supplier.cityEn]
    .filter(Boolean).join(" / ");

  return (
    <div className="bg-secondary-50 border border-border rounded-lg px-6 py-5">
      <div className="flex items-start gap-4">
        <span className="w-10 h-10 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center shrink-0">
          <Building2 className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-3">
            <InfoItem label={t("authEnterpriseName") || "企业名称"} value={name} />
            <InfoItem label={t("authEnterpriseType") || "企业类型"} value={typeLabel} />
            <InfoItem label={t("authEnterpriseMembership") || "会员等级"} value={membershipTier || "-"} />
            <InfoItem label={t("authEnterpriseStatus") || "绑定状态"} value={bindingStatus || (t("authEnterpriseStatusLinked") || "已绑定")} />
            <InfoItem label={t("authEnterpriseIndustry") || "所属行业"} value={zh ? supplier.industryZh : supplier.industryEn} />
            <InfoItem label={t("authEnterpriseLocation") || "国家/城市"} value={location} />
            <InfoItem label={t("authEnterpriseCertifications") || "认证资质"} value={certs} />
            <InfoItem label={t("authEnterpriseProducts") || "主营产品"} value={products} />
          </div>
        </div>
        <button type="button" onClick={onManage} className={btnBlue}>
          {t("authEnterpriseManage") || "管理企业信息"}
        </button>
      </div>
    </div>
  );
}

EnterpriseInfoCard.displayName = "EnterpriseInfoCard";
