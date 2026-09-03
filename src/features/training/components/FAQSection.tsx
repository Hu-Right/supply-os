/**
 * 常见问题（手风琴 + 展开过渡动画）
 * FAQ section
 *
 * @module features/training/components/FAQSection
 * @description 文案前端写死并走 i18n（六语言 training.json 的 tlFaq* key），不再查库。
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { useLocale, type LocaleKey } from "@/core/i18n";
import { Button } from "@/shared/ui";
import { SectionTitle } from "./landing-ui";

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
      <Button
        type="button"
        variant="ghost"
        onClick={onToggle}
        className="w-full justify-between gap-4 py-5 px-0 text-left hover:bg-transparent cursor-pointer"
      >
        <span className="text-sm font-black text-training-navy">{question}</span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-300 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </Button>
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

/** 常见问题条目（问答对 i18n key，文案在六语言 training.json） */
const FAQ_ITEMS: { qKey: LocaleKey; aKey: LocaleKey }[] = [
  { qKey: "tlFaq1Q", aKey: "tlFaq1A" },
  { qKey: "tlFaq2Q", aKey: "tlFaq2A" },
  { qKey: "tlFaq3Q", aKey: "tlFaq3A" },
  { qKey: "tlFaq4Q", aKey: "tlFaq4A" },
  { qKey: "tlFaq5Q", aKey: "tlFaq5A" },
];

export function FAQSection() {
  const { t } = useLocale();
  const [open, setOpen] = useState<number | null>(0);

  const handleToggle = useCallback(
    (i: number) => setOpen((prev) => (prev === i ? null : i)),
    [],
  );

  return (
    <section id="faq" className="bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <SectionTitle title={t("tlFaqTitle")} />
        <div className="border-y border-slate-200">
          {FAQ_ITEMS.map(({ qKey, aKey }, i) => (
            <AccordionItem
              key={qKey}
              question={t(qKey)}
              answer={t(aKey)}
              isOpen={open === i}
              onToggle={() => handleToggle(i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
