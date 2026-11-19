// i18n-allow-file: 供应商企业主页首版为 zh 路由服务端渲染（英文站点尚无供应商详情路由），
// 页面文案统一中文口径；接入 /en/supplier/[id] 时再按 locale 拆键，勿在本文件新增英文硬编码。
/**
 * 供应商企业主页 — 页头
 *
 * @module features/supplier-profile/components/SupplierProfileHeader
 * @description 企业身份区：名称、真实核验/认领状态、所在地、行业定位、主营摘要与主 CTA。
 *              所有徽章都来自真实字段（verify_status / info_review_status / claimed / license_url），
 *              不再使用旧版无条件渲染的「已核验」占位徽章。
 */
import { BadgeCheck, Building2, Globe2, MapPin, ShieldCheck } from "lucide-react";
import type { SupplierProfileView } from "@/lib/services/supplier-profile";
import { SupplierProfileActions } from "./SupplierProfileActions";

export interface SupplierProfileHeaderProps {
  profile: SupplierProfileView;
  claimed: boolean;
}

export function SupplierProfileHeader({ profile, claimed }: SupplierProfileHeaderProps) {
  const location = [profile.country, profile.province, profile.city].filter(Boolean).join(" · ");
  const industryLabel = profile.industry.primary?.nameZh ?? profile.products[0] ?? "";
  const initials = profile.company.replace(/\s+/g, "").slice(0, 2) || "企";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4 sm:gap-5">
          <div
            aria-hidden
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 text-xl font-black text-slate-500 sm:h-20 sm:w-20"
          >
            {initials}
          </div>
          <div className="min-w-0">
            <h1 className="break-words text-xl font-extrabold leading-tight text-slate-900 md:text-2xl">
              {profile.company}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {profile.verifyStatus === "done" ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-2xs font-bold text-teal-700">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  平台认证企业
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-2xs font-bold text-slate-600">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  信息已审核
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-2xs font-bold text-slate-600">
                <Globe2 className="h-3.5 w-3.5" />
                {profile.type === "domestic" ? "国内供应商" : "国际供应商"}
              </span>
              {claimed && (
                <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-2xs font-bold text-blue-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  已认领
                </span>
              )}
              {profile.hasLicense && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-2xs font-bold text-amber-700">
                  营业执照已上传
                </span>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-500">
              {location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {location}
                </span>
              )}
              {industryLabel && (
                <span className="inline-flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {industryLabel}
                </span>
              )}
            </div>
            {profile.products.length > 0 && (
              <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                主营：{profile.products.slice(0, 5).join(" / ")}
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0">
          <SupplierProfileActions
            supplier={profile.supplier}
            dbId={profile.dbId}
            claimed={claimed}
            variant="header"
          />
        </div>
      </div>
    </section>
  );
}
