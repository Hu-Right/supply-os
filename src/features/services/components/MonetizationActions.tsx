/**
 * 投标服务市场 — 变现动作
 * Monetization Actions — 8 action icons
 *
 * @module features/services/components/MonetizationActions
 */

import {
  ShieldCheck,
  Globe,
  FilePenLine,
  Send,
  Languages,
  Handshake,
  Ship,
  Crown,
} from "lucide-react";

const ACTIONS = [
  { icon: ShieldCheck, label: "能力诊断" },
  { icon: Globe, label: "平台注册" },
  { icon: FilePenLine, label: "拆标代写" },
  { icon: Send, label: "代投" },
  { icon: Languages, label: "翻译认证" },
  { icon: Handshake, label: "国际谈判" },
  { icon: Ship, label: "海外履约" },
  { icon: Crown, label: "年度顾问" },
];

export function MonetizationActions() {
  return (
    <section className="py-8">
      {/* 标题 */}
      <div className="flex items-center justify-center gap-3 mb-8">
        <div className="h-px w-12 bg-gradient-to-r from-transparent to-teal-400" />
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
          <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
        </div>
        <h2 className="text-xl md:text-2xl font-extrabold text-slate-900">
          变现动作
        </h2>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
          <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
        </div>
        <div className="h-px w-12 bg-gradient-to-l from-transparent to-teal-400" />
      </div>

      {/* 8个动作图标 */}
      <div className="flex flex-wrap justify-center gap-4 md:gap-6">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <div
              key={action.label}
              className="flex flex-col items-center gap-2 group cursor-pointer"
            >
              <div className="w-12 h-12 rounded-xl border border-slate-200 bg-white flex items-center justify-center group-hover:border-teal-300 group-hover:bg-teal-50 transition-colors">
                <Icon className="w-5 h-5 text-slate-700 group-hover:text-teal-600 transition-colors" />
              </div>
              <span className="text-xs text-slate-600 font-medium">
                {action.label}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

MonetizationActions.displayName = "MonetizationActions";
