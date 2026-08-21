/**
 * 讲师阵容区（核心讲师大卡片 + 团队小头像网格，DB 驱动）
 * Instructors Section
 *
 * @module features/training/components/InstructorsSection
 * @description 无数据时整个 Section 不渲染。
 */

import { UserRound, SearchCheck, Users } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { SectionTitle } from "./SectionTitle";
import type { LandingInstructor, LandingTeamMember } from "../api";

export interface InstructorsSectionProps {
  featured: LandingInstructor[];
  team: LandingTeamMember[];
}

export function InstructorsSection({ featured, team }: InstructorsSectionProps) {
  const { t, locale } = useLocale();
  if (featured.length === 0 && team.length === 0) return null;

  const teamRoles = [
    { icon: UserRound, title: t("tlTeamRoleConsultant"), desc: t("tlTeamRoleConsultantDesc") },
    { icon: SearchCheck, title: t("tlTeamRoleAnalyst"), desc: t("tlTeamRoleAnalystDesc") },
    { icon: Users, title: t("tlTeamRoleCoach"), desc: t("tlTeamRoleCoachDesc") },
  ];

  return (
    <section className="py-4">
      <SectionTitle title={t("tlInstructorsTitle")} subtitle={t("tlInstructorsSubtitle")} />

      {/* 核心讲师大卡片 */}
      {featured.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((ins) => (
            <div key={ins.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-xs">
              <div className="mb-3 flex flex-wrap justify-center gap-1.5">
                {ins.roles.map((role) => (
                  <span key={role} className="rounded-full bg-teal-600 px-2.5 py-0.5 text-[10px] font-bold text-white">
                    {role}
                  </span>
                ))}
              </div>
              <div className="mx-auto mb-3 h-28 w-28 overflow-hidden rounded-full border-4 border-teal-600 bg-slate-100 shadow-md">
                <img src={ins.avatar_path} alt={pickLocale(locale, ins.name_zh, ins.name_en ?? ins.name_zh)} className="h-full w-full object-cover" loading="lazy" />
              </div>
              <h3 className="text-lg font-black text-slate-900">{pickLocale(locale, ins.name_zh, ins.name_en ?? ins.name_zh)}</h3>
              <p className="mt-1 text-xs font-bold text-teal-700">{pickLocale(locale, ins.title_zh, ins.title_en ?? ins.title_zh)}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{pickLocale(locale, ins.bio_zh, ins.bio_en ?? ins.bio_zh)}</p>
            </div>
          ))}
        </div>
      )}

      {/* 团队区 */}
      {team.length > 0 && (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <SectionTitle title={t("tlTeamSectionTitle")} />
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            {teamRoles.map((r) => (
              <div key={r.title} className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white">
                  <r.icon className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-teal-700">{r.title}</h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{r.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap justify-center gap-x-6 gap-y-6">
            {team.map((m) => (
              <div key={m.id} className="flex w-20 flex-col items-center gap-2">
                <div className="h-20 w-20 overflow-hidden rounded-full border-2 border-teal-500 bg-slate-100 shadow-sm">
                  <img src={m.avatar_path} alt={pickLocale(locale, m.name_zh, m.name_en ?? m.name_zh)} className="h-full w-full object-cover" loading="lazy" />
                </div>
                <span className="text-xs font-bold text-slate-700">{pickLocale(locale, m.name_zh, m.name_en ?? m.name_zh)}</span>
              </div>
            ))}
          </div>

          {/* 底部团队标语条 */}
          <div className="mt-8 flex flex-col items-center gap-4 rounded-2xl bg-slate-900 p-6 text-white md:flex-row">
            <p className="flex-1 text-center text-sm leading-relaxed md:text-left">{t("tlTeamFooterDesc")}</p>
            <div className="flex items-center gap-6">
              {[t("tlTeamValue1"), t("tlTeamValue2"), t("tlTeamValue3"), t("tlTeamValue4")].map((v) => (
                <div key={v} className="flex flex-col items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
                  <span className="text-xs font-bold text-slate-300">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

InstructorsSection.displayName = "InstructorsSection";
