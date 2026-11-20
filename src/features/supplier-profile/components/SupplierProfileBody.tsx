/**
 * 供应商企业主页 — 正文信息区
 *
 * @module features/supplier-profile/components/SupplierProfileBody
 * @description 单栏信息流：关键工商信息 / 联系方式（脱敏，只读）/ 主营产品 / 行业定位 /
 *              资质认证 / 投标能力成绩单。
 *              原则：有数据才渲染；空字段整段隐藏，不再输出 "—" 或按完整度推导的合规结论。
 *
 *              2026-11-19 改版：移除右侧独立「联系方式」栏及其重复动作按钮——联系方式
 *              作为只读信息段并入主栏；卡片自身按会员状态展示脱敏/明文
 *              （SupplierContactCard），页头不再保留「查看联系方式」按钮。
 */
import { Award, Building2, FileCheck2, Globe2, Target, UserRound } from "lucide-react";
import type { SupplierScorecard } from "@/shared/api/supplier";
import type { SupplierProfileView } from "@/lib/services/supplier-profile";
import type { SupplierProfileCopy, SupplierProfileLocale } from "../copy";
import { SupplierContactCard } from "./SupplierContactCard";

export interface SupplierProfileBodyProps {
  profile: SupplierProfileView;
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
  badge,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
        {icon}
        {title}
        {badge}
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
    <SectionCard
      title={copy.scorecardTitle}
      icon={<Target className="h-5 w-5 text-teal-600" />}
      badge={
        <span
          className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-2xs font-semibold text-slate-500"
          title={copy.scorecardSelfDeclaredHint}
        >
          {copy.scorecardSelfDeclared}
        </span>
      }
    >
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

export function SupplierProfileBody({ profile, scorecard, copy, locale }: SupplierProfileBodyProps) {
  const { contact } = profile;
  const hasAnyContact = Boolean(contact.person || contact.position || contact.email || contact.phone);
  const hasIndustry = Boolean(profile.industry.primary || profile.industry.tags.length > 0);
  const primaryCode = profile.industry.primary?.code ?? null;
  // 多行业标签只取非主码的挂靠标签：主行业在路径末尾单独展示，不重复成 chip
  const industryTags = profile.industry.tags.filter((t) => t.code !== primaryCode);
  const industryName = (t: { nameZh: string; nameEn: string }) =>
    locale === "en" ? t.nameEn : t.nameZh;
  const registrationLabel =
    copy.creditCodeLabels[profile.creditCodeType] ?? copy.creditCodeLabels.other ?? copy.registrationNo;

  // 平台归类：按 L2 大类分组；来源已按 is_primary/weight/confidence 排序，主品目组自然在前
  const categoryGroups = (() => {
    const map = new Map<string, {
      categoryZh: string;
      categoryEn: string;
      items: typeof profile.commodityInterests;
    }>();
    for (const item of profile.commodityInterests) {
      const key = `${item.categoryZh}|${item.categoryEn}`;
      const group = map.get(key);
      if (group) group.items.push(item);
      else map.set(key, { categoryZh: item.categoryZh, categoryEn: item.categoryEn, items: [item] });
    }
    return [...map.values()];
  })();

  return (
    <div className="space-y-5">
      {/* 关键工商事实：空值不渲染，不再出现 "—" */}
      <SectionCard title={copy.fileTitle} icon={<FileCheck2 className="h-5 w-5 text-slate-500" />}>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
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

      {/* 联系方式：只读信息段（动作统一留在页头，避免重复按钮） */}
      {hasAnyContact && (
        <SectionCard title={copy.contactTitle} icon={<UserRound className="h-5 w-5 text-slate-500" />}>
          <SupplierContactCard
            supplierId={profile.supplier.id}
            contact={contact}
          />
        </SectionCard>
      )}

      {(profile.productsText || profile.commodityInterests.length > 0) && (
        <SectionCard title={copy.productsTitle} icon={<Building2 className="h-5 w-5 text-teal-600" />}>
          {profile.productsText && (
            <p className="whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">
              {profile.productsText}
            </p>
          )}

          {/* 平台归类：自由文本为主，品目作为可折叠的辅助结构（点击进采购筛选） */}
          {categoryGroups.length > 0 && (
            <details className="group mt-4 border-t border-slate-100 pt-3">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-teal-700">
                <span className="inline-block transition-transform group-open:rotate-90">▸</span>
                {copy.platformCategory}
                <span className="font-normal text-slate-400">({profile.commodityInterests.length})</span>
              </summary>
              <div className="mt-3 space-y-3">
                {categoryGroups.map((group) => (
                  <div key={`${group.categoryZh}|${group.categoryEn}`}>
                    <p className="text-2xs font-bold uppercase tracking-wide text-slate-400">
                      {locale === "en" ? group.categoryEn : group.categoryZh}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {group.items.map((item) => (
                        <span
                          key={item.code}
                          title={item.code}
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                            item.isPrimary
                              ? "border-teal-300 bg-teal-50 text-teal-800"
                              : "border-slate-200 bg-white text-slate-600"
                          }`}
                        >
                          {locale === "en" ? item.nameEn : item.nameZh}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </SectionCard>
      )}

      {hasIndustry && (
        <SectionCard title={copy.industryTitle} icon={<Globe2 className="h-5 w-5 text-blue-600" />}>
          {(() => {
            const industryPath = locale === "en" ? profile.industry.pathEn : profile.industry.path;
            const primaryName = profile.industry.primary ? industryName(profile.industry.primary) : "";
            // 路径本身已包含主码节点：去掉末尾同名节点，避免「… > 主行业 主行业」重复
            const prefixPath =
              primaryName && industryPath[industryPath.length - 1] === primaryName
                ? industryPath.slice(0, -1)
                : industryPath;
            return (
              <>
                {(prefixPath.length > 0 || primaryName) && (
                  <p className="text-sm text-slate-600">
                    {prefixPath.length > 0 && `${prefixPath.join(" / ")} / `}
                    {primaryName && (
                      <span className="font-bold text-slate-800">{primaryName}</span>
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
              </>
            );
          })()}
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
  );
}
