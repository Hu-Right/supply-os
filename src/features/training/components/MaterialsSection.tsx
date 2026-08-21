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
    <section className="bg-[#F4F7FA]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <SectionTitle title={t("tlMatTitle")} />
        <div className="max-w-3xl mx-auto rounded-2xl border border-slate-200/80 bg-white p-8 md:p-10 shadow-xs flex flex-col sm:flex-row items-center gap-8">
          <img
            src="/wechat-service-qr.png"
            alt={t("tlMatScan")}
            className="w-40 h-40 shrink-0 rounded-lg border border-slate-200"
          />
          <div>
            <h3 className="text-base font-black text-[#0B2447]">{t("tlMatScan")}</h3>
            <ul className="mt-4 space-y-2.5">
              {BULLETS.map((k) => (
                <li key={k} className="flex items-center gap-2.5 text-sm text-slate-600">
                  <Play className="w-3.5 h-3.5 shrink-0 text-[#12A171]" fill="currentColor" />
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
