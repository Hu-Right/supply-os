/**
 * 报名入口与课程资料（设计图 1:1 二维码卡片）
 * Materials / QR section
 *
 * @module features/training/components/MaterialsSection
 */
import { Play } from "lucide-react";
import { useLocale, type LocaleKey } from "@/core/i18n";
import { SectionTitle } from "./landing-ui";

const BULLETS: LocaleKey[] = ["tlMat1", "tlMat2", "tlMat3", "tlMat4"];

export function MaterialsSection() {
  const { t } = useLocale();

  return (
    <section className="bg-[#FAFBFC]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <SectionTitle title={t("tlMatTitle")} />
        <div className="max-w-3xl mx-auto rounded-2xl bg-white p-8 md:p-10 shadow-[0_2px_16px_rgba(0,0,0,0.04)] flex flex-col sm:flex-row items-center gap-10">
          <img
            src="/wechat-service-qr.png"
            alt={t("tlMatScan")}
            className="w-36 h-36 shrink-0 rounded-xl bg-slate-50"
          />
          <div>
            <h3 className="text-base font-bold text-slate-900">{t("tlMatScan")}</h3>
            <ul className="mt-5 space-y-3">
              {BULLETS.map((k) => (
                <li key={k} className="flex items-center gap-3 text-sm text-slate-500">
                  <Play className="w-3.5 h-3.5 shrink-0 text-slate-400" fill="currentColor" />
                  {t(k)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
