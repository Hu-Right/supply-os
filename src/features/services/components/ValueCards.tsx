/**
 * 投标服务市场 — 底部价值卡片 + 标语
 * Value Cards + Footer Tagline
 *
 * @module features/services/components/ValueCards
 */

import { TrendingUp, Target, Eye } from "lucide-react";

const CARDS = [
  {
    icon: TrendingUp,
    title: "服务商品化后，咨询率会更高",
    desc: "场景驱动 + 标准服务卡\n转化更高效",
  },
  {
    icon: Target,
    title: "高毛利服务要和具体项目场景绑定",
    desc: "从招标准备到中标后的全流程\n挖掘高价值服务机会",
  },
  {
    icon: Eye,
    title: "从页面就能看清 买什么、怎么交付、怎么报价",
    desc: "信息透明 + 决策简单\n更快促成成交",
  },
];

export function ValueCards() {
  return (
    <section>
      {/* 3张价值卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className="rounded-2xl bg-gradient-to-br from-[#0a1628] via-[#0f2035] to-[#0d2847] p-6 flex items-start gap-4"
            >
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-teal-500/20 flex items-center justify-center">
                <Icon className="w-6 h-6 text-teal-400" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white mb-2 leading-snug">
                  {card.title}
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-line">
                  {card.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部标语 */}
      <p className="text-center text-sm text-slate-500 mt-8 mb-4">
        让复杂的投标服务，像商品一样清晰、透明、可成交。
      </p>
    </section>
  );
}

ValueCards.displayName = "ValueCards";
