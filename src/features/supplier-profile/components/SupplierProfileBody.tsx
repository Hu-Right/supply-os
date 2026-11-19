/**
 * 供应商企业主页 — 正文信息区
 *
 * @module features/supplier-profile/components/SupplierProfileBody
 * @description 关键工商信息 / 主营产品 / 行业定位 / 资质认证 / 投标能力成绩单 / 联系方式。
 *              原则是「有数据才渲染」：空字段整段隐藏，不再输出 "—" 或按完整度推导出的合规结论。
 */
import { Award, Building2, FileCheck2, Globe2, Mail, Phone, Target, UserRound } from "lucide-react";
import type { SupplierScorecard } from "@/shared/api/supplier";
import type { SupplierProfileView } from "@/lib/services/supplier-profile";
import type { SupplierProfileCopy, SupplierProfileLocale } from "../copy";
import { SupplierProfileActions } from "./SupplierProfileActions";

export interface SupplierProfileBodyProps {
  profile: SupplierProfileView;
  claimed: boolean;
  scorecard: SupplierScorecard | null;
  copy: SupplierProfileCopy;
  locale: SupplierProfileLocale;
}

function FactItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs font-bold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 break-words text-sm font-bold text-slate-800">{children}</dd>
    </div>
  );
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
        {icon}
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ScorecardSection({
  scorecard,
  copy,
  locale,
}: {
  scorecard: SupplierScorecard;
  copy: SupplierProfileCopy;
  locale: SupplierProfileLocale;
}) {
  const tone =
    scorecard.grade === "A"
      ? { text: "text-teal-600", bar: "bg-teal-500", badge: "bg-teal-50 border-teal-200 text-teal-700" }
      : scorecard.grade === "B"
        ? { text: "text-amber-600", bar: "bg-amber-500", badge: "bg-amber-50 border-amber-200 text-amber-700" }
        : { text: "text-slate-500", bar: "bg-slate-400", badge: "bg-slate-50 border-slate-200 text-slate-600" };
  return (
    <SectionCard title={copy.scorecardTitle} icon={<Target className="h-5 w-5 text-teal-600" />}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex shrink-0 items-baseline gap-2 sm:w-44 sm:flex-col sm:items-center sm:border-r sm:border-slate-100 sm:pr-6">
          <div className="flex items-baseline gap-1">
            <span className={`text-4xl font-black leading-none ${tone.text}`}>{scorecard.totalScore}</span>
            <span className="text-xs text-slate-400">/ 100</span>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${tone.badge}`}>
            {scorecard.gradeLabel}
          </span>
          <span className="text-2xs text-slate-400">
            {copy.scorecardEvaluated}{" "}
            {new Date(scorecard.evaluatedAt).toLocaleDateString(locale === "en" ? "en-US" : "zh-CN")}
          </span>
        </div>
        <div className="grid flex-1 grid-cols-1 gap-x-8 gap-y-2.5 md:grid-cols-2">
          {scorecard.dimensions.map((d) => {
            const pct = d.max > 0 ? Math.round((d.score / d.max) * 100) : 0;
            return (
              <div key={d.name} className="flex items-center gap-2.5">
                <span className="w-36 shrink-0 truncate text-xs text-slate-500" title={d.name}>
                  {d.name}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${tone.bar}`}
                    style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-xs font-bold tabular-nums text-slate-600">
                  {d.score}/{d.max}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}

export function SupplierProfileBody({ profile, claimed, scorecard, copy, locale }: SupplierProfileBodyProps) {
  const { contact } = profile;
  const hasAnyContact = Boolean(contact.person || contact.position || contact.email || contact.phone);
  const hasIndustry = Boolean(profile.industry.primary || profile.industry.tags.length > 0);
  const industryTags = profile.industry.tags.length > 0
    ? profile.industry.tags
    : profile.industry.primary
      ? [{ code: profile.industry.primary.code, nameZh: profile.industry.primary.nameZh, nameEn: profile.industry.primary.nameEn }]
      : [];
  const industryName = (t: { nameZh: string; nameEn: string }) =>
    locale === "en" ? t.nameEn : t.nameZh;
  const registrationLabel =
    copy.creditCodeLabels[profile.creditCodeType] ?? copy.creditCodeLabels.other ?? copy.registrationNo;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="space-y-5">
        {/* 关键工商事实：空值不渲染，不再出现 "—" */}
        <SectionCard title={copy.fileTitle} icon={<FileCheck2 className="h-5 w-5 text-slate-500" />}>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3">
            {profile.establishedAt && <FactItem label={copy.established}>{profile.establishedAt}</FactItem>}
            {profile.registeredCapital && (
              <FactItem label={copy.registeredCapital}>{profile.registeredCapital}</FactItem>
            )}
            {profile.creditCodeMasked && (
              <FactItem label={registrationLabel}>{profile.creditCodeMasked}</FactItem>
            )}
            <FactItem label={copy.companyType}>
              {profile.type === "domestic" ? copy.domestic : copy.international}
            </FactItem>
            <FactItem label={copy.completeness}>
              <span className="inline-flex items-center gap-2">
                <span className="tabular-nums text-teal-700">{profile.dataCompleteness}%</span>
                <span className="inline-block h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 align-middle">
                  <span
                    className="block h-full rounded-full bg-teal-500"
                    style={{ width: `${Math.min(100, Math.max(0, profile.dataCompleteness))}%` }}
                  />
                </span>
              </span>
            </FactItem>
            {profile.website && (
              <FactItem label={copy.website}>
                <a
                  href={profile.website}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="break-all text-teal-700 underline-offset-2 hover:underline"
                >
                  {profile.website.replace(/^https?:\/\//i, "").replace(/\/$/, "")}
                </a>
              </FactItem>
            )}
          </dl>
          {profile.address && (
            <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-500">
              {copy.address}：{profile.address}
            </p>
          )}
        </SectionCard>

        {profile.products.length > 0 && (
          <SectionCard title={copy.productsTitle} icon={<Building2 className="h-5 w-5 text-teal-600" />}>
            <div className="flex flex-wrap gap-2">
              {profile.products.map((p) => (
                <span
                  key={p}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700"
                >
                  {p}
                </span>
              ))}
            </div>
          </SectionCard>
        )}

        {hasIndustry && (
          <SectionCard title={copy.industryTitle} icon={<Globe2 className="h-5 w-5 text-blue-600" />}>
            {profile.industry.path.length > 0 && (
              <p className="text-sm text-slate-600">
                {profile.industry.path.join(" / ")}
                {profile.industry.primary && (
                  <span className="ml-1 font-bold text-slate-800">{industryName(profile.industry.primary)}</span>
                )}
              </p>
            )}
            {industryTags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {industryTags.map((t) => (
                  <span
                    key={t.code}
                    className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700"
                  >
                    {industryName(t)}
                  </span>
                ))}
              </div>
            )}
          </SectionCard>
        )}

        {profile.certifications.length > 0 && (
          <SectionCard title={copy.certificationsTitle} icon={<Award className="h-5 w-5 text-teal-600" />}>
            <div className="flex flex-wrap gap-2">
              {profile.certifications.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-sm font-semibold text-teal-800"
                >
                  <Award className="h-4 w-4 text-teal-500" />
                  {c}
                </span>
              ))}
            </div>
            <p className="mt-3 text-2xs text-slate-400">{copy.certificationNote}</p>
          </SectionCard>
        )}

        {scorecard && <ScorecardSection scorecard={scorecard} copy={copy} locale={locale} />}
      </div>

      {/* 侧栏：联系方式 + 认领引导 */}
      <aside className="space-y-4 lg:sticky lg:top-24">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <h2 className="text-base font-extrabold text-slate-900">{copy.contactTitle}</h2>
          {hasAnyContact ? (
            <dl className="mt-3 space-y-2.5 text-sm">
              {contact.person && (
                <div className="flex items-center gap-2 text-slate-700">
                  <UserRound className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="font-semibold">{contact.person}</span>
                  {contact.position && <span className="text-xs text-slate-400">{contact.position}</span>}
                </div>
              )}
              {contact.email && (
                <div className="flex items-center gap-2 text-slate-700">
                  <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="font-semibold">{contact.email}</span>
                </div>
              )}
              {contact.phone && (
                <div className="flex items-center gap-2 text-slate-700">
                  <Phone className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="font-semibold">{contact.phone}</span>
                </div>
              )}
            </dl>
          ) : (
            <p className="mt-3 text-sm text-slate-500">{copy.contactEmpty}</p>
          )}
          <p className="mt-3 text-2xs text-slate-400">{copy.contactMaskedNote}</p>
          <div className="mt-4">
            <SupplierProfileActions
              supplier={profile.supplier}
              dbId={profile.dbId}
              claimed={claimed}
              variant="contact"
            />
          </div>
        </section>

        {!claimed && (
          <section className="rounded-2xl border border-teal-200 bg-teal-50/60 p-5">
            <h2 className="text-sm font-extrabold text-teal-900">{copy.ownerTitle}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-teal-800">{copy.ownerDesc}</p>
            <div className="mt-3">
              <SupplierProfileActions
                supplier={profile.supplier}
                dbId={profile.dbId}
                claimed={claimed}
                variant="header"
              />
            </div>
          </section>
        )}
      </aside>
    </div>
  );
}
