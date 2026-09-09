/**
 * 投标服务市场 — 信任条
 * Trust Bar — 4 trust indicators
 *
 * @module features/services/components/TrustBar
 */

import { Users, Clock, BadgeCheck, Shield } from "lucide-react";

const TRUST_ITEMS = [
  {
    icon: Users,
    title: "专业团队全程服务",
    desc: "资深顾问团队，行业经验丰富",
  },
  {
    icon: Clock,
    title: "明确交付与时效",
    desc: "交付物清晰，节点可追踪",
  },
  {
    icon: BadgeCheck,
    title: "透明报价更放心",
    desc: "按项目/年费/按次，清晰透明",
  },
  {
    icon: Shield,
    title: "数据安全可追溯",
    desc: "全流程留痕，保障信息安全",
  },
];

export function TrustBar() {
  return (
    <section className="rounded-2xl bg-gradient-to-r from-[#0a1628] via-[#0f2035] to-[#0d2847] px-6 sm:px-8 py-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        {TRUST_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center">
                <Icon className="w-5 h-5 text-teal-400" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white mb-0.5">
                  {item.title}
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

TrustBar.displayName = "TrustBar";
