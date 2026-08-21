/**
 * 课程讲师阵容（设计图 2 的 1:1 还原）
 * Instructors section v2
 *
 * @module features/training/components/InstructorsSection
 * @description 4 张核心讲师大卡（角色徽章 + 圆环头像 + 姓名 + 头衔 + 简介）
 *              + 「企业服务顾问 / 拆标老师 / 实战陪跑团队」三角色说明
 *              + 11 人团队头像网格 + 深藏青价值横幅。
 *              头像为空时渲染默认剪影占位。
 */
import { UserRound, Trophy, GraduationCap, BadgeCheck, HeartHandshake, Award } from "lucide-react";
import { useLocale, pickLocale, type LocaleKey } from "@/core/i18n";
import { SectionTitle } from "./landing-ui";
import type { LandingInstructor, LandingTeamMember } from "../api";

export interface InstructorsSectionProps {
  featured: LandingInstructor[];
  team: LandingTeamMember[];
}

/** 圆形头像（空路径 → 剪影占位） */
function Avatar({ src, alt, className }: { src: string; alt: string; className: string }) {
  if (!src) {
    return (
      <span className={`${className} bg-[#0B2447] flex items-center justify-center`}>
        <UserRound className="w-1/2 h-1/2 text-white/80" />
      </span>
    );
  }
  return <img src={src} alt={alt} className={`${className} object-cover object-top bg-[#0B2447]`} loading="lazy" />;
}

const ROLE_COLS: { icon: typeof Award; titleKey: LocaleKey; descKey: LocaleKey }[] = [
  { icon: Award, titleKey: "tlInsRole1", descKey: "tlInsRole1Desc" },
  { icon: GraduationCap, titleKey: "tlInsRole2", descKey: "tlInsRole2Desc" },
  { icon: HeartHandshake, titleKey: "tlInsRole3", descKey: "tlInsRole3Desc" },
];

const BANNER_VALUES: { icon: typeof Award; key: LocaleKey }[] = [
  { icon: UserRound, key: "tlInsV1" },
  { icon: BadgeCheck, key: "tlInsV2" },
  { icon: HeartHandshake, key: "tlInsV3" },
  { icon: Trophy, key: "tlInsV4" },
];

export function InstructorsSection({ featured, team }: InstructorsSectionProps) {
  const { t, locale } = useLocale();
  if (featured.length === 0 && team.length === 0) return null;

  return (
    <section id="instructors" className="relative overflow-hidden bg-[#F4F7FA]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <SectionTitle title={t("tlInsTitle")} sub={t("tlInsSub")} />

        {/* 4 张核心讲师大卡 */}
        {featured.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featured.map((ins) => (
              <div key={ins.id} className="rounded-2xl border border-slate-200/80 bg-white p-6 text-center shadow-xs">
                <span className="inline-block rounded-full bg-[#0E7C6B] px-4 py-1.5 text-xs font-bold text-white">
                  {ins.roles.join(" ｜ ")}
                </span>
                <div className="mt-6 flex justify-center">
                  <Avatar
                    src={ins.avatar_path}
                    alt={pickLocale(locale, ins.name_zh, ins.name_en ?? ins.name_zh)}
                    className="w-36 h-36 rounded-full border-4 border-[#0E7C6B]/60"
                  />
                </div>
                <h3 className="mt-6 text-xl font-black text-[#0B2447]">
                  {pickLocale(locale, ins.name_zh, ins.name_en)}
                </h3>
                <p className="mt-3 text-sm font-bold leading-relaxed text-[#12A171]">
                  {pickLocale(locale, ins.title_zh, ins.title_en)}
                </p>
                <p className="mt-4 text-xs leading-relaxed text-slate-600 text-left">
                  {pickLocale(locale, ins.bio_zh, ins.bio_en)}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* 三角色 + 团队头像 + 横幅 */}
        <div className="mt-10 rounded-2xl border border-slate-200/80 bg-[#F8FAFC] p-8 md:p-10">
          <SectionTitle title={t("tlInsRolesTitle")} />

          <div className="grid md:grid-cols-3 gap-8">
            {ROLE_COLS.map(({ icon: Icon, titleKey, descKey }) => (
              <div key={titleKey} className="flex items-start gap-4">
                <span className="w-12 h-12 shrink-0 rounded-full bg-[#0E7C6B] flex items-center justify-center">
                  <Icon className="w-6 h-6 text-white" />
                </span>
                <div>
                  <h4 className="text-sm font-black text-[#0B2447]">{t(titleKey)}</h4>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">{t(descKey)}</p>
                </div>
              </div>
            ))}
          </div>

          {team.length > 0 && (
            <div className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-8">
              {team.map((m) => (
                <div key={m.id} className="flex flex-col items-center w-20">
                  <Avatar
                    src={m.avatar_path}
                    alt={pickLocale(locale, m.name_zh, m.name_en ?? m.name_zh)}
                    className="w-20 h-20 rounded-full border-2 border-[#0E7C6B]/50"
                  />
                  <span className="mt-3 text-sm font-bold text-[#0B2447]">
                    {pickLocale(locale, m.name_zh, m.name_en)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* 深藏青价值横幅 */}
          <div className="mt-10 rounded-xl bg-[#0B2447] px-6 py-5 flex flex-col lg:flex-row items-center gap-6">
            <div className="flex items-center gap-4 flex-1">
              <Trophy className="w-8 h-8 shrink-0 text-white" />
              <p className="text-sm leading-relaxed text-slate-200">{t("tlInsBanner")}</p>
            </div>
            <div className="flex items-center gap-8">
              {BANNER_VALUES.map(({ icon: Icon, key }) => (
                <div key={key} className="flex flex-col items-center gap-2">
                  <Icon className="w-6 h-6 text-white" />
                  <span className="text-xs font-bold text-slate-200">{t(key)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
