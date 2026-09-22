"use client";

/**
 * RFQ 浅色 Hero 区
 * RFQ Light Hero Section
 *
 * @module features/rfq/components/LightHero
 * @description 浅色渐变页头：标题 + 双 CTA + 能力标签。深色文字，品牌绿仅用于主 CTA。
 */
import { Crosshair, Globe, AlertTriangle, Languages, Send } from "lucide-react";

import { Button } from "@/shared/ui";
import { emitAppEvent } from "@/core/events";

const FEATURES = [
  { icon: Globe, label: "公开询价" },
  { icon: Crosshair, label: "定向邀约" },
  { icon: AlertTriangle, label: "紧急采购" },
  { icon: Languages, label: "多语言支持" },
];

export function LightHero() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-secondary-200 bg-gradient-to-br from-white via-primary-50/50 to-white px-6 sm:px-8 py-8 md:py-10">
      <div className="relative z-10">
        <h1 className="text-2xl md:text-3xl font-extrabold text-secondary-900 tracking-tight">
          采购方发布需求 / RFQ
        </h1>
        <p className="text-secondary-500 text-sm md:text-base mt-3 max-w-2xl leading-relaxed">
          一步发布采购需求，快速获取认证供应商报价，全程有平台顾问支持。
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            size="lg"
            onClick={() => document.getElementById("rfq-form")?.scrollIntoView({ behavior: "smooth" })}
          >
            <Send className="w-4 h-4" /> 立即发布需求
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => emitAppEvent("supply-os:consult")}
          >
            预约采购顾问
          </Button>
        </div>

        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-secondary-500">
          {FEATURES.map(({ icon: Icon, label }) => (
            <span key={label} className="flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5 text-primary-600" /> {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
