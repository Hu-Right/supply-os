/**
 * 研修班招生落地页主组件（设计图 1:1 组合）
 * Training Landing Page
 *
 * @module features/training/pages/TrainingLandingPage
 * @description 一次性拉取落地页动态数据（课程/期次/讲师/团队/照片/反馈/FAQ），
 *              按设计图顺序组合各 Section；全出血布局突破外层容器；
 *              管理三个弹窗（报名表单/动态支付/企微二维码）。
 */

import { useEffect, useState } from "react";
import { useLocale } from "@/core/i18n";
import { Spinner } from "@/shared/ui";
import { fetchLandingData, type LandingDataResponse } from "../api";
import { useTrainingModals } from "../hooks/useTrainingModals";
import FloatingNav from "../components/FloatingNav";
import { HeroSection } from "../components/HeroSection";
import { StatsSection } from "../components/StatsSection";
import { WhySection } from "../components/WhySection";
import { ValueSection } from "../components/ValueSection";
import { SyllabusSection } from "../components/SyllabusSection";
import { ParticipationSection } from "../components/ParticipationSection";
import { InstructorsSection } from "../components/InstructorsSection";
import { GallerySection } from "../components/GallerySection";
import { HighlightsSection } from "../components/HighlightsSection";
import { ScheduleSection } from "../components/ScheduleSection";
import { TestimonialsSection } from "../components/TestimonialsSection";
import { FAQSection } from "../components/FAQSection";
import { CTASection } from "../components/CTASection";
import { MaterialsSection } from "../components/MaterialsSection";
import TrainingPaymentModal from "../components/TrainingPaymentModal";
import WechatQRModal from "../components/WechatQRModal";

export default function TrainingLandingPage() {
  const { t } = useLocale();
  const [data, setData] = useState<LandingDataResponse | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  const {
    showPaymentModal, closePaymentModal,
    showWechatQR, openWechatQR, closeWechatQR,
    registrationId, handleDirectPay,
  } = useTrainingModals();

  useEffect(() => {
    let cancelled = false;
    fetchLandingData()
      .then((res) => { if (!cancelled) { setData(res); setLoadState("ready"); } })
      .catch(() => { if (!cancelled) setLoadState("error"); });
    return () => { cancelled = true; };
  }, []);

  if (loadState === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  if (loadState === "error" || !data) {
    return (
      <div className="flex flex-col items-center gap-4 py-24">
        <p className="text-sm text-slate-600">{t("tlLoadFailed")}</p>
        <button
          type="button"
          onClick={() => { setLoadState("loading"); fetchLandingData().then(setData).then(() => setLoadState("ready")).catch(() => setLoadState("error")); }}
          className="rounded-xl bg-[#0CAF8C] px-6 py-2.5 text-sm font-black text-white hover:bg-[#0A9B7C]"
        >
          {t("tlPaymentRetry")}
        </button>
      </div>
    );
  }

  const { course, schedules, instructors, gallery, testimonials, faqs } = data;

  return (
    // 浮动导航 + Hero + CTA 为通版；其余区块受 max-w-7xl 版心约束
    <div className="bg-white">
      {/* 浮动导航：桌面端右侧垂直侧边栏 / 移动端底部水平导航栏 */}
      <FloatingNav onEnroll={handleDirectPay} onConsult={openWechatQR} />

      <HeroSection course={course} onEnroll={handleDirectPay} onConsult={openWechatQR} />

      <div className="max-w-7xl mx-auto">
        <StatsSection />
        <WhySection />
        <ValueSection />

        {/* 课程大纲 + 三种参训方式（双栏带） */}
        <section id="syllabus" className="bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-24 grid lg:grid-cols-2 gap-16">
            <SyllabusSection />
            <ParticipationSection course={course} onReserve={handleDirectPay} onConsult={openWechatQR} />
          </div>
        </section>

        <InstructorsSection featured={instructors.featured} team={instructors.team} />
        <GallerySection gallery={gallery} />
        <HighlightsSection />
        <ScheduleSection schedules={schedules} course={course} onReserve={handleDirectPay} />
        <TestimonialsSection testimonials={testimonials} />
        <FAQSection faqs={faqs} />
      </div>

      <CTASection onEnroll={handleDirectPay} onConsult={openWechatQR} />

      <div className="max-w-7xl mx-auto">
        <MaterialsSection />
      </div>

      {/* 弹窗：动态支付（红框） + 企微二维码（黄框） */}
      {showPaymentModal && (
        <TrainingPaymentModal
          onClose={closePaymentModal}
          course={course}
          registrationId={registrationId}
        />
      )}
      {showWechatQR && <WechatQRModal onClose={closeWechatQR} />}
    </div>
  );
}

TrainingLandingPage.displayName = "TrainingLandingPage";
