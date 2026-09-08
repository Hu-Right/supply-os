/**
 * 供应商卡片组件（模块05 设计图还原）
 * Supplier Card — Module 05 Design Mockup
 *
 * @module features/supplier/components/SupplierCard
 * @description 按「5-全球供应商库」样图重排：公司图片 + 会员标签 + 收藏/分享 +
 *              公司名/类型 + 核心产品 + 认证 + 资料完整度进度条 + UNSPSC +
 *              能力标签 + 双按钮（查看企业主页/发询盘）。
 */
import { Bookmark, Share2, Factory, Store } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { Button, Card, Badge } from "@/shared/ui";
import type { Supplier } from "@/types";

export interface SupplierCardProps {
  supplier: Supplier;
  onAiMatch: (supplier: Supplier) => void;
  onContact: (supplier: Supplier) => void;
  onViewProfile?: (supplier: Supplier) => void;
}

/** 会员标签样式映射 */
const TIER_BADGE: Record<string, { bg: string; text: string; border: string; labelKey: string }> = {
  certified: { bg: "bg-teal-500", text: "text-white", border: "border-teal-500", labelKey: "supplierCertifiedMember" },
  gold: { bg: "bg-amber-500", text: "text-white", border: "border-amber-500", labelKey: "supplierGoldMember" },
  recommended: { bg: "bg-rose-500", text: "text-white", border: "border-rose-500", labelKey: "supplierRecommended" },
};

export function SupplierCard({ supplier, onAiMatch, onContact, onViewProfile }: SupplierCardProps) {
  const { t, locale } = useLocale();

  const name = pickLocale(locale, supplier.nameZh, supplier.nameEn);
  const products = pickLocale(locale, supplier.mainProductsZh, supplier.mainProductsEn) ?? [];
  const certs = supplier.certifications ?? supplier.complianceLabelsZh ?? [];
  const tags = supplier.capabilityTags ?? [];
  const completeness = supplier.dataCompleteness ?? 0;
  const unspsc = supplier.unspscCode || supplier.ungmCode || "";
  const companyType = supplier.companyType || (supplier.type === "domestic" ? "factory" : "trader");
  const tier = supplier.membershipTier;
  const tierStyle = tier ? TIER_BADGE[tier] : null;

  return (
    <Card interactive className="flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden p-0">
      {/* ─ 顶部图片区 ── */}
      <div className="relative h-36 bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden">
        {supplier.imageUrl ? (
          <img src={supplier.imageUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300">
            <Factory className="w-12 h-12" />
          </div>
        )}
        {/* 会员标签（左上角） */}
        {tierStyle && (
          <span className={`absolute top-2 left-2 px-2 py-0.5 rounded text-2xs font-bold ${tierStyle.bg} ${tierStyle.text}`}>
            {t(tierStyle.labelKey)}
          </span>
        )}
        {/* 收藏 + 分享（右上角） */}
        <div className="absolute top-2 right-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); alert(t("procurement_comingSoon")); }}
            className="p-1.5 rounded-full bg-white/80 backdrop-blur-sm text-slate-500 hover:text-rose-500 transition-colors"
            aria-label={t("detail_collect")}
          >
            <Bookmark className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); alert(t("procurement_comingSoon")); }}
            className="p-1.5 rounded-full bg-white/80 backdrop-blur-sm text-slate-500 hover:text-teal-600 transition-colors"
            aria-label={t("detail_share")}
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── 内容区 ── */}
      <div className="flex-1 p-4 space-y-3">
        {/* 公司名 + 类型 */}
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-extrabold text-slate-900 line-clamp-1 flex-1">{name}</h4>
          <span className="shrink-0 text-2xs text-slate-500 font-medium flex items-center gap-1">
            {companyType === "factory" ? <Factory className="w-3 h-3" /> : <Store className="w-3 h-3" />}
            {companyType === "factory" ? t("supplierFactory") : t("supplierTrader")}
          </span>
        </div>

        {/* 核心产品 */}
        {products.length > 0 && (
          <p className="text-xs text-slate-600 line-clamp-1">
            <span className="font-bold text-slate-400">{t("supplierCoreProducts")}</span>
            {products.slice(0, 3).join("、")}
          </p>
        )}

        {/* 认证 */}
        {certs.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <span className="text-2xs font-bold text-slate-400 shrink-0">{t("supplierCertification")}</span>
            {certs.slice(0, 4).map((c, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded bg-slate-100 text-2xs text-slate-600 font-medium">{c}</span>
            ))}
          </div>
        )}

        {/* 资料完整度进度条 */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-2xs font-bold text-slate-400">{t("supplierDataCompleteness")}</span>
            <span className="text-2xs font-bold text-teal-600">{completeness}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-400 to-teal-600 transition-all"
              style={{ width: `${completeness}%` }}
            />
          </div>
        </div>

        {/* UNSPSC */}
        {unspsc && (
          <p className="text-2xs text-slate-400 font-mono">UNSPSC: {unspsc}</p>
        )}

        {/* 能力标签 */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded bg-teal-50 text-2xs text-teal-700 font-medium">{tag}</span>
            ))}
          </div>
        )}
      </div>

      {/* ── 底部按钮 ─ */}
      <div className="flex gap-2 p-4 pt-0">
        <Button
          onClick={() => onViewProfile ? onViewProfile(supplier) : onAiMatch(supplier)}
          variant="outline"
          size="sm"
          className="flex-1 text-xs font-bold text-slate-700 border-slate-300 hover:border-teal-400 hover:text-teal-700"
        >
          {t("supplierViewProfile")}
        </Button>
        <Button
          onClick={() => onContact(supplier)}
          variant="primary"
          size="sm"
          className="flex-1 text-xs font-bold"
        >
          {t("supplierSendInquiry")}
        </Button>
      </div>
    </Card>
  );
}

SupplierCard.displayName = "SupplierCard";
