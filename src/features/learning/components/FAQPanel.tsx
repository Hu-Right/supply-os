/**
 * FAQ 面板组件
 * FAQ Panel Component
 *
 * @module features/learning/components/FAQPanel
 * @description 常见问题展示面板
 *              FAQ display panel
 */

import { useLocale, pickLocale } from "@/core/i18n";
import type { FAQItem } from "@/types";

export interface FAQPanelProps {
  faqs: FAQItem[];
  title?: string;
}

export function FAQPanel({ faqs, title = "常见问题 FAQ" }: FAQPanelProps) {
  const { locale } = useLocale();

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <h4 className="mb-3 text-sm font-bold text-slate-800">{title}</h4>
      <div className="space-y-4">
        {faqs.map((faq) => (
          <div key={faq.id} className="space-y-1.5 border-b border-slate-100 pb-3 last:border-b-0">
            <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[9px] font-black text-slate-600">
              {faq.category.toUpperCase()}
            </span>
            <h5 className="text-xs font-bold text-slate-800">
              Q: {pickLocale(locale, faq.questionZh, faq.questionEn)}
            </h5>
            <p className="rounded border border-slate-100/50 bg-slate-50 p-2.5 text-[11px] leading-relaxed text-slate-500">
              {pickLocale(locale, faq.answerZh, faq.answerEn)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

FAQPanel.displayName = "FAQPanel";
