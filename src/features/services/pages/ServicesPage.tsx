/**
 * 投标服务页面（模块08 设计图还原）
 * Services Page — Module 08 Design Mockup
 *
 * @module features/services/pages/ServicesPage
 * @description 按设计图重排：深色页头 + 4步生命周期步骤条 + 分组服务卡片 + 成功案例。
 *              服务按投标前/投标准备/投标提交/中标后四阶段分组展示。
 */
import { useState } from "react";
import { useLocale } from "@/core/i18n";
import { SERVICES, SUCCESS_STORIES } from "@/data/services";
import type { ServicePhase } from "@/data/services";
import { ServiceCard } from "../components/ServiceCard";
import { SuccessStories } from "../components/SuccessStories";
import { emitAppEvent } from "@/core/events";
import { FileText, ClipboardList, Send, Award } from "lucide-react";

/** 生命周期阶段定义 */
const PHASES: { key: ServicePhase; label: string; labelEn: string; icon: typeof FileText }[] = [
  { key: "pre-bid", label: "投标前", labelEn: "Pre-Bid", icon: FileText },
  { key: "prep", label: "投标准备", labelEn: "Preparation", icon: ClipboardList },
  { key: "submit", label: "投标提交", labelEn: "Submission", icon: Send },
  { key: "post-award", label: "中标后", labelEn: "Post-Award", icon: Award },
];

export default function ServicesPage() {
  const { t, locale } = useLocale();
  const [activePhase, setActivePhase] = useState<ServicePhase | "all">("all");

  const handleBookService = () => {
    emitAppEvent("supply-os:consult");
  };

  // 按阶段筛选
  const filteredServices = activePhase === "all"
    ? SERVICES
    : SERVICES.filter((s) => s.phase === activePhase);

  // 按阶段分组
  const groupedServices = PHASES.map((phase) => ({
    ...phase,
    services: SERVICES.filter((s) => s.phase === phase.key),
  }));

  return (
    <div className="space-y-6">
      {/* ══ 深色页头 ═══ */}
      <section className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-900 rounded-2xl px-5 sm:px-6 py-8">
        <h1 className="text-2xl md:text-3xl font-extrabold text-white">
          投标服务市场
          <span className="text-base font-bold text-slate-300 ml-2">|</span>
          <span className="text-base font-bold text-slate-300 ml-2">从找标到履约的全链路服务</span>
        </h1>
        <p className="text-slate-400 text-sm mt-2 max-w-3xl">
          按采购生命周期分组，每项服务都有明确交付物。高变动服务显示"¥X 起/项目报价"，预约表单自动带入用户/企业/招标 ID。
        </p>

        {/* 4步生命周期步骤条 */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActivePhase("all")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              activePhase === "all"
                ? "bg-teal-600 text-white"
                : "bg-white/10 text-slate-300 hover:bg-white/20"
            }`}
          >
            全部服务
          </button>
          {PHASES.map((phase, idx) => {
            const Icon = phase.icon;
            const isActive = activePhase === phase.key;
            return (
              <button
                key={phase.key}
                type="button"
                onClick={() => setActivePhase(phase.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                  isActive
                    ? "bg-teal-600 text-white"
                    : "bg-white/10 text-slate-300 hover:bg-white/20"
                }`}
              >
                <span className="text-xs opacity-70">0{idx + 1}</span>
                <Icon className="w-4 h-4" />
                {locale === "zh" ? phase.label : phase.labelEn}
              </button>
            );
          })}
        </div>
      </section>

      {/* ═══ 分组服务卡片 ═══ */}
      {activePhase === "all" ? (
        // 全部分组展示
        <div className="space-y-8">
          {groupedServices.map((group) => (
            group.services.length > 0 && (
              <div key={group.key}>
                <div className="flex items-center gap-3 mb-4">
                  <group.icon className="w-5 h-5 text-teal-600" />
                  <h2 className="text-lg font-extrabold text-slate-900">
                    {locale === "zh" ? group.label : group.labelEn}
                  </h2>
                  <span className="text-xs text-slate-400 font-medium">
                    {group.services.length} 项服务
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {group.services.map((service, idx) => (
                    <ServiceCard
                      key={`${group.key}-${idx}`}
                      service={service}
                      onBook={handleBookService}
                      bookLabel={t("bookServiceNow")}
                    />
                  ))}
                </div>
              </div>
            )
          ))}
        </div>
      ) : (
        // 单阶段展示
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredServices.map((service, idx) => (
            <ServiceCard
              key={idx}
              service={service}
              onBook={handleBookService}
              bookLabel={t("bookServiceNow")}
            />
          ))}
        </div>
      )}

      {/* ══ 成功案例 ═══ */}
      <SuccessStories stories={SUCCESS_STORIES} title={t("successStory")} />
    </div>
  );
}

ServicesPage.displayName = "ServicesPage";
