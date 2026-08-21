/**
 * 研修班招生落地页主组件
 * Training Landing Page
 *
 * @module features/training/pages/TrainingLandingPage
 * @description 一次性拉取落地页动态数据（课程/期次/讲师/团队/照片/反馈/FAQ），
 *              分发给各 Section 组件；管理三个弹窗（报名表单/动态支付/企微二维码）。
 *              全部可变内容 DB 驱动，无种子数据；空数据 Section 自动隐藏。
 */

import { useEffect, useState } from "react";
import { useLocale } from "@/core/i18n";
import { Spinner } from "@/shared/ui";
import { fetchLandingData, type LandingDataResponse } from "../api";
import { useTrainingModals } from "../hooks/useTrainingModals";
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
import TrainingRegisterForm from "../components/TrainingRegisterForm";
import TrainingPaymentModal from "../components/TrainingPaymentModal";
import WechatQRModal from "../components/WechatQRModal";

export default function TrainingLandingPage() {
  const { t } = useLocale();
  const [data, setData] = useState<LandingDataResponse | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  const {
    showRegisterForm, openRegisterForm, closeRegisterForm,
    showPaymentModal, closePaymentModal,
    showWechatQR, openWechatQR, closeWechatQR,
    registrationId, handleRegisterSuccess, handleDirectPay,
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
        <p className="text-sm text-slate-500">{t("tlLoadFailed")}</p>
        <button
          type="button"
          onClick={() => { setLoadState("loading"); fetchLandingData().then(setData).then(() => setLoadState("ready")).catch(() => setLoadState("error")); }}
          className="rounded-xl bg-teal-600 px-6 py-2.5 text-sm font-black text-white hover:bg-teal-700"
        >
          {t("tlPaymentRetry")}
        </button>
      </div>
    );
  }

  const { course, schedules, instructors, gallery, testimonials, faqs } = data;

  return (
    <div className="space-y-12">
      <HeroSection course={course} onEnroll={openRegisterForm} onConsult={openWechatQR} />
      <StatsSection />
      <WhySection />
      <ValueSection />
      <SyllabusSection />
      <ParticipationSection course={course} onReserve={handleDirectPay} onConsult={openWechatQR} />
      <InstructorsSection featured={instructors.featured} team={instructors.team} />
      <GallerySection gallery={gallery} />
      <HighlightsSection />
      <ScheduleSection schedules={schedules} />
      <TestimonialsSection testimonials={testimonials} />
      <FAQSection faqs={faqs} />
      <CTASection onEnroll={openRegisterForm} onConsult={openWechatQR} />
      <MaterialsSection />

      {/* 三个弹窗 */}
      {showRegisterForm && (
        <TrainingRegisterForm onClose={closeRegisterForm} onSubmitSuccess={handleRegisterSuccess} />
      )}
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
