/**
 * 企业信息卡 — 智谱极简风（展示组件，数据源 crm_suppliers 企业表）
 * Enterprise Info Card
 *
 * @module features/auth/components/EnterpriseInfoCard
 * @description 展示当前用户绑定企业（crm_suppliers）的信息：label:value 内联网格；
 *              未绑定显示引导+立即绑定；加载中骨架屏；加载失败错误+重试。
 *              纯展示，数据由 useEnterpriseInfo 提供，动作经 props 回调。
 */
import { Building2 } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { EnterpriseInfo } from "../hooks/useEnterpriseInfo";

const btnBlue = "px-4 py-1.5 rounded-md bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors shrink-0";
const btnPlain = "px-4 py-1.5 rounded-md bg-white border border-border text-xs font-medium text-foreground hover:bg-secondary-50 transition-colors shrink-0";

export interface EnterpriseInfoCardProps {
  enterprise: EnterpriseInfo | null;
  /** 绑定/审核状态（crm_users.supplier_link_status） */
  linkStatus?: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
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
  enterprise, linkStatus, loading, error, onRetry, onBind,
}: EnterpriseInfoCardProps) {
  const { t } = useLocale();

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
  if (!enterprise) {
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

  // ── 已绑定：企业表字段 label:value 网格 ──
  const regDate = enterprise.createdAt ? enterprise.createdAt.slice(0, 10) : "";
  const score = enterprise.dataQualityScore != null ? String(enterprise.dataQualityScore) : "";

  return (
    <div className="bg-secondary-50 border border-border rounded-lg px-6 py-5">
      <div className="flex items-start gap-4">
        <span className="w-10 h-10 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center shrink-0">
          <Building2 className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-3">
            <InfoItem label={t("authEnterpriseName") || "企业名称"} value={enterprise.companyName} />
            <InfoItem label={t("authEnterpriseNature") || "企业性质"} value={enterprise.enterpriseNature} />
            <InfoItem label={t("authEnterpriseGrade") || "供应商等级"} value={enterprise.supplierGrade} />
            <InfoItem label={t("authEnterpriseStatus") || "绑定状态"} value={linkStatus || (t("authEnterpriseStatusLinked") || "已绑定")} />
            <InfoItem label={t("authEnterpriseIndustry") || "所属行业"} value={enterprise.industry} />
            <InfoItem label={t("authEnterpriseCountry") || "所在国家"} value={enterprise.country} />
            <InfoItem label={t("authEnterpriseProducts") || "主营产品"} value={enterprise.mainProduct} />
            <InfoItem label={t("authEnterpriseCertifications") || "认证资质"} value={enterprise.certification} />
            <InfoItem label={t("authEnterpriseExport") || "出口经验"} value={enterprise.exportExperience} />
            <InfoItem label={t("authEnterpriseScore") || "资料评分"} value={score} />
            <InfoItem label={t("authEnterpriseRegisteredAt") || "注册时间"} value={regDate} />
          </div>
        </div>
      </div>
    </div>
  );
}

EnterpriseInfoCard.displayName = "EnterpriseInfoCard";
