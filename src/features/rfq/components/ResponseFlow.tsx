"use client";

/**
 * 供应商响应流程时间线
 * Supplier Response Flow
 *
 * @module features/rfq/components/ResponseFlow
 * @description 发布 → 审核匹配 → 报价 → 比价 → 履约 五步全链路展示，
 *              回答"发布后会发生什么"的信任问题。浅色横排，五步 flex 均分撑满整行，
 *              移动端可横滑。
 */
import { Fragment } from "react";
import { FileText, ShieldCheck, Mail, Scale, Handshake, ChevronRight } from "lucide-react";
import { useLocale } from "@/core/i18n";

const FLOW = [
  { icon: FileText, titleKey: "rfqFlow1Title", descKey: "rfqFlow1Desc" },
  { icon: ShieldCheck, titleKey: "rfqFlow2Title", descKey: "rfqFlow2Desc" },
  { icon: Mail, titleKey: "rfqFlow3Title", descKey: "rfqFlow3Desc" },
  { icon: Scale, titleKey: "rfqFlow4Title", descKey: "rfqFlow4Desc" },
  { icon: Handshake, titleKey: "rfqFlow5Title", descKey: "rfqFlow5Desc" },
];

export function ResponseFlow() {
  const { t } = useLocale();
  return (
    <section className="rounded-2xl border border-secondary-200 bg-white p-6 shadow-xs">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-extrabold text-secondary-900">{t("rfqFlowTitle")}</h2>
        <span className="text-xs text-secondary-400 hidden sm:block">
          {t("rfqFlowSubtitle")}
        </span>
      </div>
      <div className="flex items-start overflow-x-auto pb-1 scrollbar-none">
        {FLOW.map((step, idx) => {
          const Icon = step.icon;
          return (
            <Fragment key={step.titleKey}>
              <div className="flex-1 flex justify-center min-w-0">
                <div className="flex flex-col items-center text-center min-w-[96px] px-1">
                  <div className="w-11 h-11 rounded-full bg-primary-50 border border-primary-100 flex items-center justify-center mb-2">
                    <Icon className="w-5 h-5 text-primary-600" />
                  </div>
                  <div className="text-xs font-bold text-secondary-900 mb-1">
                    <span className="text-primary-600 mr-1">{idx + 1}</span>
                    {t(step.titleKey)}
                  </div>
                  <p className="text-2xs text-secondary-400 leading-relaxed">{t(step.descKey)}</p>
                </div>
              </div>
              {idx < FLOW.length - 1 && (
                <div className="flex items-center pt-4 text-secondary-300 shrink-0">
                  <ChevronRight className="w-4 h-4" />
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}
