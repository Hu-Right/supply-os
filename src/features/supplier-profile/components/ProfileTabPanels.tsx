/**
 * 供应商企业主页 — Tab 面板组件集
 * Supplier Profile — Tab Panel Components
 *
 * @module features/supplier-profile/components/ProfileTabPanels
 * @description 从 SupplierProfilePage.tsx 提取的 6 个 Tab 面板 + InfoRow 工具组件。
 *              降低主文件认知负荷（465→217 行）。
 */
import { type ReactNode } from "react";
import {
  Building2, Globe, Crown, FileText, Award, TrendingUp, Target,
  ArrowRight, ExternalLink, Lock,
} from "lucide-react";
import { Button, Card, Badge, EmptyState } from "@/shared/ui";
import type { Supplier } from "@/types";

// ── 工具组件 ──

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="shrink-0 w-24 text-slate-500 font-medium text-sm">{label}</span>
      <span className="text-slate-800 font-bold text-sm flex-1">{value}</span>
    </div>
  );
}

interface PanelProps { t: (key: string, params?: Record<string, string | number>) => string; }

// ── 企业能力总览 ──

export function CapabilityPanel({ supplier, products, completeness, certs, country, t }: PanelProps & {
  supplier: Supplier; products: string[]; completeness: number; certs: string[]; country: string;
}) {
  const unspsc = supplier?.unspscCode || supplier?.ungmCode || "";
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <section className="rounded-2xl border border-teal-200 bg-white p-5">
        <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-teal-600" />{t("profile_capabilityTitle")}
        </h3>
        <div className="space-y-1">
          <InfoRow label={t("profile_companyScale")} value={supplier.companyType === "factory" ? t("supplierFactory") : t("supplierTrader")} />
          <InfoRow label={t("profile_annualCapacity")} value="—" />
          <InfoRow label={t("profile_mainProducts")} value={products.length > 0 ? products.join(" / ") : <span className="text-slate-300">—</span>} />
          <InfoRow label={t("profile_exportCountries")} value={country || <span className="text-slate-300">—</span>} />
          <InfoRow label={t("profile_overseasNodes")} value={<span className="text-slate-300">—</span>} />
          <div className="flex items-center gap-3 py-1.5">
            <span className="shrink-0 w-24 text-slate-500 font-medium text-sm">{t("profile_dataCompleteness")}</span>
            <div className="flex-1 flex items-center gap-2">
              <span className="text-teal-600 font-extrabold text-sm">{completeness}%</span>
              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${completeness}%` }} />
              </div>
            </div>
          </div>
          <InfoRow label={t("profile_certCount")} value={`${certs.length} 项`} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-700 text-xs font-bold">
            {t("profile_dataCompleteness")} {completeness}%
          </span>
          <span className="px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold">
            {t("profile_certCount")} {certs.length} 项
          </span>
        </div>
        <button className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-900">
          {t("profile_exportable")} <ExternalLink className="w-3 h-3" />
        </button>
      </section>

      <section className="rounded-2xl border border-blue-200 bg-white p-5">
        <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
          <Globe className="w-5 h-5 text-blue-600" />{t("profile_complianceTitle")}
        </h3>
        <div className="space-y-1">
          <InfoRow label={t("profile_unspscMatch")} value={unspsc ? `${t("profile_unspscMatched")}（92%）` : <span className="text-slate-300">—</span>} />
          <InfoRow label={t("profile_complianceStandards")} value={certs.length > 0 ? certs.join(" / ") : <span className="text-slate-300">—</span>} />
          <InfoRow label={t("profile_qualificationPre")} value={completeness >= 80 ? t("profile_verified") : <span className="text-slate-300">—</span>} />
          <InfoRow label={t("profile_restrictionAssess")} value={completeness >= 70 ? "合规（低风险）" : <span className="text-slate-300">—</span>} />
          <InfoRow label={t("profile_docSupport")} value={completeness >= 60 ? "中英双语齐全" : <span className="text-slate-300">—</span>} />
          <InfoRow label={t("profile_suggestOptimize")} value={completeness < 90 ? "完善售后服务文件" : <span className="text-teal-600">已完善</span>} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold hover:bg-blue-100">
            {t("profile_aiDiagnosis")}
          </button>
          <button className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-100">
            {t("profile_memberFunction")}
          </button>
        </div>
        <button className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-900">
          {t("profile_diagnoseNow")} <ArrowRight className="w-3 h-3" />
        </button>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-white p-5">
        <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
          <Crown className="w-5 h-5 text-amber-600" />{t("profile_benefitsTitle")}
        </h3>
        <div className="space-y-1">
          {[
            [t("profile_platformCert"), t("profile_certifiedSupplier")],
            [t("profile_exposureBoost"), t("profile_industryPlacement")],
            [t("profile_leadPriority"), t("profile_inquiryPriority")],
            [t("profile_eventParticipation"), t("profile_overseasExhibition")],
            [t("profile_contentDistribution"), t("profile_seoCollection")],
            [t("profile_effectTracking"), t("profile_visitorDashboard")],
          ].map(([label, value]) => (
            <div key={label} className="flex items-start gap-3 py-1.5">
              <span className="shrink-0 w-24 text-slate-500 font-medium text-sm">{label}</span>
              <span className="flex items-center gap-1 text-slate-800 font-bold text-sm">
                <Lock className="w-3 h-3 text-amber-400" />{value}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <span className="px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold">
            {t("profile_supplierMember")}
          </span>
        </div>
        <button className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-900">
          {t("profile_upgradePlan")} <ArrowRight className="w-3 h-3" />
        </button>
      </section>
    </div>
  );
}

// ── 产品目录 ──

export function ProductsPanel({ products, unspsc: _unspsc, t }: PanelProps & { products: string[]; unspsc: string }) {
  if (products.length === 0) {
    return <div className="py-10"><EmptyState title="暂无产品信息" description="该供应商尚未录入产品目录" /></div>;
  }
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100">
        <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
          <FileText className="w-5 h-5 text-teal-600" />{t("profile_tabProducts")}
        </h3>
      </div>
      <div className="divide-y divide-slate-100">
        {products.map((p, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3">
            <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
            <span className="text-sm text-slate-700">{p}</span>
          </div>
        ))}
      </div>
      {_unspsc && (
        <div className="px-5 py-3 border-t border-slate-100">
          <Badge variant="info" shape="tag">UNSPSC: {_unspsc}</Badge>
        </div>
      )}
    </Card>
  );
}

// ── 资质证书 ──

export function CertsPanel({ certs, t }: PanelProps & { certs: string[] }) {
  if (certs.length === 0) {
    return <div className="py-10"><EmptyState title="暂无资质证书" description="该供应商尚未上传认证信息" /></div>;
  }
  return (
    <Card className="p-5">
      <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
        <Award className="w-5 h-5 text-teal-600" />{t("profile_tabCerts")}
      </h3>
      <div className="flex flex-wrap gap-2">
        {certs.map((c, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-xs">
            <Award className="w-4 h-4 text-teal-500 shrink-0" />{c}
          </span>
        ))}
      </div>
    </Card>
  );
}

// ── 公采适配 ──

export function ProcurementPanel({ unspsc: _unspsc, certs, completeness, t }: PanelProps & { unspsc: string; certs: string[]; completeness: number }) {
  return (
    <Card className="p-5">
      <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
        <Globe className="w-5 h-5 text-blue-600" />{t("profile_complianceTitle")}
      </h3>
      <div className="space-y-1">
        <InfoRow label={t("profile_unspscMatch")} value={_unspsc ? `${t("profile_unspscMatched")}（92%）` : <span className="text-slate-300">—</span>} />
        <InfoRow label={t("profile_complianceStandards")} value={certs.length > 0 ? certs.join(" / ") : <span className="text-slate-300">—</span>} />
        <InfoRow label={t("profile_qualificationPre")} value={completeness >= 80 ? t("profile_verified") : <span className="text-slate-300">—</span>} />
        <InfoRow label={t("profile_restrictionAssess")} value={completeness >= 70 ? "合规（低风险）" : <span className="text-slate-300">—</span>} />
        <InfoRow label={t("profile_docSupport")} value={completeness >= 60 ? "中英双语齐全" : <span className="text-slate-300">—</span>} />
        <InfoRow label={t("profile_suggestOptimize")} value={completeness < 90 ? "完善售后服务文件" : <span className="text-teal-600">已完善</span>} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="gap-1.5 text-xs font-bold"><Target className="w-3.5 h-3.5" />{t("profile_aiDiagnosis")}</Button>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs font-bold"><Lock className="w-3.5 h-3.5" />{t("profile_memberFunction")}</Button>
      </div>
    </Card>
  );
}

// ── 海外展厅 ──

export function OverseasPanel({ country, city, t }: PanelProps & { country: string; city: string }) {
  return (
    <Card className="p-5">
      <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-teal-600" />{t("profile_tabOverseas")}
      </h3>
      <div className="space-y-1">
        <InfoRow label={t("profile_exportCountries")} value={country || <span className="text-slate-300">—</span>} />
        <InfoRow label={t("profile_overseasNodes")} value={<span className="text-slate-300">—</span>} />
      </div>
      {country === "—" && <div className="mt-4"><EmptyState title="暂无海外信息" description="该供应商尚未填写海外履约信息" /></div>}
    </Card>
  );
}

// ── 商机匹配 + 推广权益 ──

export function OpportunitiesPanel({ t, onUpgrade }: PanelProps & { onUpgrade: () => void }) {
  return (
    <Card className="p-5">
      <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
        <Crown className="w-5 h-5 text-amber-600" />{t("profile_benefitsTitle")}
      </h3>
      <div className="space-y-1">
        {[
          [t("profile_platformCert"), t("profile_certifiedSupplier")],
          [t("profile_exposureBoost"), t("profile_industryPlacement")],
          [t("profile_leadPriority"), t("profile_inquiryPriority")],
          [t("profile_eventParticipation"), t("profile_overseasExhibition")],
          [t("profile_contentDistribution"), t("profile_seoCollection")],
          [t("profile_effectTracking"), t("profile_visitorDashboard")],
        ].map(([label, value]) => (
          <div key={label} className="flex items-start gap-3 py-1.5">
            <span className="shrink-0 w-24 text-slate-500 font-medium text-sm">{label}</span>
            <span className="flex items-center gap-1 text-slate-800 font-bold text-sm">
              <Lock className="w-3 h-3 text-amber-400" />{value}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 p-4 text-white shadow">
        <div>
          <p className="text-sm font-extrabold">{t("profile_supplierMember")}</p>
          <p className="text-xs text-amber-100">解锁全部供应商推广权益</p>
        </div>
        <Button onClick={onUpgrade} variant="outline" size="sm" className="bg-white text-amber-700 border-white font-extrabold gap-1.5 hover:bg-amber-50">
          {t("profile_upgradePlan")}<ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </Card>
  );
}
