/**
 * 第三方服务生态 — 子块A：研修培训（在售期次橱窗）
 * Training Ecosystem Block
 *
 * @module features/services/components/TrainingEcoBlock
 * @description 研修班在 /services 的橱窗位：课程名 + 最近一期报名中期次 + 价格，
 *              CTA 跳转 /training 招生落地页完成报名支付（高客单决策依赖落地页的
 *              讲师/往期/大纲信任链，此处只做引流不做交易）。数据拉
 *              GET /api/training/landing（课程/期次动态）；拉取失败静默隐藏本子块，
 *              不挡页面其余内容。
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, GraduationCap, MapPin } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { formatScheduleDate } from "@/shared/utils/format";
import { Spinner } from "@/shared/ui";
import { fetchLandingData, type LandingDataResponse } from "@/features/training/api";

export function TrainingEcoBlock() {
  const { t, locale } = useLocale();
  const [data, setData] = useState<LandingDataResponse | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    fetchLandingData()
      .then((res) => { if (!cancelled) { setData(res); setLoadState("ready"); } })
      .catch(() => { if (!cancelled) setLoadState("error"); });
    return () => { cancelled = true; };
  }, []);

  // 营销橱窗失败即隐藏，不影响 /services 其余分区
  if (loadState === "error") return null;

  if (loadState === "loading" || !data) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="md" />
      </div>
    );
  }

  const { course, schedules } = data;
  // 无在售课程则整块不渲染（研修班下线时橱窗自动消失）
  if (!course) return null;

  // 最近一期报名中期次（开班日期升序取最早）
  const nextOpen = schedules
    .filter((s) => s.status === "open")
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())[0] ?? null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col md:flex-row md:items-center gap-4">
      {/* 左：课程标识 + 名称 */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-teal-600 flex items-center justify-center text-white">
          <GraduationCap className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-extrabold text-slate-900">{t("svcEcoTrainingTitle")}</h3>
          </div>
          <p className="text-xs text-slate-500 truncate">
            {pickLocale(locale, course.nameZh, course.nameEn)}
          </p>
        </div>
      </div>

      {/* 中：最近一期报名中期次 */}
      <div className="flex items-center gap-4 text-xs text-slate-500 md:flex-1">
        {nextOpen ? (
          <>
            <span className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-teal-600" />
              {formatScheduleDate(nextOpen.startDate, locale)}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-teal-600" />
              {nextOpen.city} · {nextOpen.format}
            </span>
          </>
        ) : (
          <span>{t("svcTrainingNoOpen")}</span>
        )}
      </div>

      {/* 右：价格 + CTA（跳转 /training 落地页完成报名） */}
      <div className="flex items-center gap-4 flex-shrink-0">
        <div className="text-right">
          <p className="text-lg font-black text-teal-700 leading-none">
            <span className="align-top text-xs">¥</span>{course.unitPrice.toLocaleString()}
            <span className="ml-0.5 text-xs font-bold text-slate-400">{t("svcTrainingPerPerson")}</span>
          </p>
        </div>
        <Link
          href="/training"
          className="px-5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold transition-colors whitespace-nowrap"
        >
          {t("svcTrainingCta")}
        </Link>
      </div>
    </div>
  );
}

TrainingEcoBlock.displayName = "TrainingEcoBlock";
