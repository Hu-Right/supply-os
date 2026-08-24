/**
 * 常见问题（手风琴 + 展开过渡动画）
 * FAQ section
 *
 * @module features/training/components/FAQSection
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { SectionTitle } from "./landing-ui";
import type { LandingFaq } from "../api";

/** 带展开/收起过渡动画的手风琴面板 */
function AccordionItem({
  question,
  answer,
  isOpen,
  onToggle,
}: {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>(0);

  useEffect(() => {
    if (isOpen && contentRef.current) {
      setHeight(contentRef.current.scrollHeight);
    } else {
      setHeight(0);
    }
  }, [isOpen]);

  return (
    <div className="border-b border-slate-200 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 py-5 text-left cursor-pointer"
      >
        <span className="text-sm font-black text-[#0A2A55]">{question}</span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-300 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        style={{ height }}
        className="overflow-hidden transition-[height] duration-300 ease-in-out"
      >
        <div ref={contentRef}>
          <p className="pb-5 text-sm leading-relaxed text-slate-600">{answer}</p>
        </div>
      </div>
    </div>
  );
}

export function FAQSection({ faqs }: { faqs: LandingFaq[] }) {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState<number | null>(0);

  const handleToggle = useCallback(
    (i: number) => setOpen((prev) => (prev === i ? null : i)),
    [],
  );

  if (faqs.length === 0) return null;

  return (
    <section id="faq" className="bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <SectionTitle title={t("tlFaqTitle")} />
        <div className="border-y border-slate-200">
          {faqs.map((f, i) => (
            <AccordionItem
              key={f.id}
              question={pickLocale(locale, f.question_zh, f.question_en) ?? ""}
              answer={pickLocale(locale, f.answer_zh, f.answer_en) ?? ""}
              isOpen={open === i}
              onToggle={() => handleToggle(i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
