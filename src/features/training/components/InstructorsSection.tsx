/**
 * 课程讲师阵容（高清设计图 1:1 还原）
 * Instructors section v3
 *
 * @module features/training/components/InstructorsSection
 * @description 浅蓝底（#EBF2FA，顶部点阵世界地图水印）+
 *              4 张核心讲师大卡（teal 徽章 pill + 竖椭圆头像 + 姓名/头衔/简介）+
 *              浅色面板（三角色列带竖分隔线 + 团队竖椭圆头像网格）+
 *              深藏青价值横幅（Trophy + 4 价值图标竖分隔）。
 *              色值均采样自设计图。头像为空时渲染默认剪影占位。
 */
import { UserRound, Trophy, GraduationCap, BadgeCheck, HeartHandshake, Award, UserStar, Shapes } from "lucide-react";
import Image from "next/image";
import { useLocale, pickLocale, type LocaleKey } from "@/core/i18n";
import { SectionTitle } from "./landing-ui";
import type { LandingInstructor, LandingTeamMember } from "../api";

export interface InstructorsSectionProps {
  featured: LandingInstructor[];
  team: LandingTeamMember[];
}

/** 竖椭圆头像（空路径 → 藏青剪影占位） */
function Avatar({ src, alt, className }: { src: string; alt: string; className: string }) {
  if (!src) {
    return (
      <span className={`${className} bg-[#0A2A55] flex items-center justify-center`}>
        <UserRound className="w-1/2 h-1/2 text-white/80" />
      </span>
    );
  }
  return (
    <span className={`${className} relative block overflow-hidden`}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 768px) 100px, (max-width: 1200px) 128px, 140px"
        quality={90}
        className="object-cover object-top"
      />
    </span>
  );
}

const ROLE_COLS: { icon: typeof Award; titleKey: LocaleKey; descKey: LocaleKey }[] = [
  { icon: UserStar, titleKey: "tlInsRole1", descKey: "tlInsRole1Desc" },
  { icon: GraduationCap, titleKey: "tlInsRole2", descKey: "tlInsRole2Desc" },
  { icon: HeartHandshake, titleKey: "tlInsRole3", descKey: "tlInsRole3Desc" },
];

const BANNER_VALUES: { icon: typeof Award; key: LocaleKey }[] = [
  { icon: UserStar, key: "tlInsV1" },
  { icon: BadgeCheck, key: "tlInsV2" },
  { icon: Shapes, key: "tlInsV3" },
  { icon: UserRound, key: "tlInsV4" },
];

export function InstructorsSection({ featured, team }: InstructorsSectionProps) {
  const { t, locale } = useLocale();
  if (featured.length === 0 && team.length === 0) return null;

  return (
    <section id="instructors" className="relative overflow-hidden bg-[#F5F8FB]">
      {/* 顶部点阵世界地图水印 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-60"
        style={{
          backgroundImage: "radial-gradient(rgba(10,42,85,0.10) 1px, transparent 1px)",
          backgroundSize: "10px 10px",
          maskImage: "linear-gradient(to bottom, black 0%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 0%, transparent 100%)",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <SectionTitle title={t("tlInsTitle")} sub={t("tlInsSub")} />

        {/* 4 张核心讲师大卡 */}
        {featured.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featured.map((ins) => (
              <div key={ins.id} className="rounded-xl bg-white p-6 pt-7 text-center shadow-[0_2px_12px_rgba(10,42,85,0.06)]">
                <div className="mt-6 flex justify-center">
                  <Avatar
                    src={ins.avatar_path}
                    alt={pickLocale(locale, ins.name_zh, ins.name_en ?? ins.name_zh)}
                    className="w-40 h-52 rounded-[50%]"
                  />
                </div>
                <h3 className="mt-6 text-2xl font-black text-[#0A245E]">
                  {pickLocale(locale, ins.name_zh, ins.name_en)}
                </h3>
                <p className="mt-3 text-sm font-bold leading-relaxed text-[#0B7F82]">
                  {pickLocale(locale, ins.title_zh, ins.title_en)}
                </p>
                <p className="mt-4 text-xs leading-relaxed text-[#3E5070] text-left">
                  {ins.roles.length > 0 && (
                    <span className="font-bold text-[#0B7F82]">{ins.roles.join("、")}。</span>
                  )}
                  {pickLocale(locale, ins.bio_zh, ins.bio_en)}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-10">
          <SectionTitle title={t("tlInsRolesTitle")} />
        </div>

        {/* 团队头像 + 三角色介绍面板 */}
        <div className="mt-10 rounded-2xl bg-white p-8 md:p-10">
          {team.length > 0 && (
            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-x-3 gap-y-5 max-w-[1120px] mx-auto">
              {team.map((m) => (
                <div key={m.id} className="flex flex-col items-center">
                  <Avatar
                    src={m.avatar_path}
                    alt={pickLocale(locale, m.name_zh, m.name_en ?? m.name_zh)}
                    className="w-[128px] h-[160px] rounded-[50%]"
                  />
                  <span className="text-[12px] font-bold text-[#0A245E] text-center mt-5">
                    {pickLocale(locale, m.name_zh, m.name_en)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-8 md:gap-0 md:divide-x md:divide-[#DCE6F2] mt-10">
            {ROLE_COLS.map(({ icon: Icon, titleKey, descKey }) => (
              <div key={titleKey} className="flex flex-col items-center text-center md:px-10 md:first:pl-0 md:last:pr-0">
                <span className="w-14 h-14 shrink-0 rounded-full bg-[#016E74] flex items-center justify-center">
                  <Icon className="w-7 h-7 text-white" />
                </span>
                <h4 className="mt-4 text-base font-black text-[#066364]">{t(titleKey)}</h4>
                <p className="mt-3 text-sm leading-relaxed text-[#3E5070]">{t(descKey)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 深藏青价值横幅 */}
        <div className="mt-8 rounded-2xl bg-[#002154] px-8 py-6 flex flex-col lg:flex-row items-center gap-6">
          <div className="flex items-center gap-4 flex-1">
            <Trophy className="w-9 h-9 shrink-0 text-white" />
            <p className="text-sm leading-relaxed text-slate-100">{t("tlInsBanner")}</p>
          </div>
          <div className="flex items-stretch divide-x divide-white/15">
            {BANNER_VALUES.map(({ icon: Icon, key }) => (
              <div key={key} className="flex flex-col items-center gap-2 px-6 lg:px-8">
                <Icon className="w-6 h-6 text-white" />
                <span className="text-xs font-bold text-slate-100">{t(key)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
