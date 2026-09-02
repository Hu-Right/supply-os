/**
 * 报名入口与课程资料（设计图 1:1 二维码卡片）
 * Materials / QR section
 *
 * @module features/training/components/MaterialsSection
 */
import { Play } from "lucide-react";
import Image from "next/image";
import { useLocale, type LocaleKey } from "@/core/i18n";
import { SectionTitle } from "./landing-ui";

const BULLETS: LocaleKey[] = ["tlMat1", "tlMat2", "tlMat3", "tlMat4"];

export function MaterialsSection() {
  const { t } = useLocale();

  return (
    <section className="bg-training-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-12">
        <SectionTitle title={t("tlMatTitle")} />
        <div className="max-w-3xl mx-auto rounded-lg border border-training-border bg-white p-6 md:p-8 shadow-card-soft flex flex-col sm:flex-row items-center gap-8">
          <Image
            src="/wechat-service-qr.png"
            alt={t("tlMatScan")}
            width={144}
            height={144}
            className="w-36 h-36 shrink-0 rounded-lg border border-slate-200"
          />
          <div>
            <h3 className="text-base font-black text-training-navy">{t("tlMatScan")}</h3>
            <ul className="mt-4 space-y-2.5">
              {BULLETS.map((k) => (
                <li key={k} className="flex items-center gap-2.5 text-sm text-slate-600">
                  <Play className="w-3.5 h-3.5 shrink-0 text-[#0AA09B]" fill="currentColor" />
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
