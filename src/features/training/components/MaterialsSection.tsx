/**
 * 报名入口与课程资料区（底部二维码 + 资料清单）
 * Materials Section
 *
 * @module features/training/components/MaterialsSection
 */

import { FileText, CalendarDays, Users, Building2 } from "lucide-react";
import { useLocale } from "@/core/i18n";

export function MaterialsSection() {
  const { t } = useLocale();
  const items = [
    { icon: CalendarDays, label: t("tlMaterialsItem1") },
    { icon: FileText, label: t("tlMaterialsItem2") },
    { icon: Users, label: t("tlMaterialsItem3") },
    { icon: Building2, label: t("tlMaterialsItem4") },
  ];

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xs">
      <h2 className="text-center text-xl font-black text-slate-900">{t("tlMaterialsTitle")}</h2>
      <div className="mt-6 flex flex-col items-center gap-6 md:flex-row md:justify-center">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          <img src="/wechat-service-qr.png" alt={t("tlMaterialsScan")} className="h-40 w-40 object-contain" loading="lazy" />
        </div>
        <div>
          <p className="mb-3 text-sm font-black text-slate-900">{t("tlMaterialsScan")}</p>
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.label} className="flex items-center gap-2 text-sm text-slate-600">
                <item.icon className="h-4 w-4 text-teal-600" />
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

MaterialsSection.displayName = "MaterialsSection";
