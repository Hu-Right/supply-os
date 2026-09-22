/**
 * 投标服务市场 — 6张服务卡片网格
 * Service Card Grid — 3×2 layout
 *
 * @module features/services/components/ServiceCardGrid
 */

import type { ServiceItem } from "@/data/services";
import { emitAppEvent } from "@/core/events";

export interface ServiceCardGridProps {
  services: ServiceItem[];
}

function ServiceCardItem({ service }: { service: ServiceItem }) {
  const Icon = service.icon;

  // 根据服务类型选择图标背景色
  const bgMap: Record<string, string> = {
    ShieldCheck: "bg-teal-50 text-teal-600",
    Globe: "bg-blue-50 text-blue-600",
    FilePenLine: "bg-purple-50 text-purple-600",
    Handshake: "bg-amber-50 text-amber-600",
    Languages: "bg-orange-50 text-orange-600",
    Ship: "bg-cyan-50 text-cyan-600",
  };
  const iconBg = bgMap[Icon.displayName || ""] || "bg-slate-50 text-slate-600";

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow">
      <div>
        {/* 图标 */}
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${iconBg}`}>
          <Icon className="w-6 h-6" />
        </div>

        {/* 标题 */}
        <h3 className="text-base font-extrabold text-slate-900 mb-2">
          {service.title}
        </h3>

        {/* 适用对象 */}
        <p className="text-xs text-slate-500 mb-1">
          <span className="text-slate-400">适用对象：</span>
          {service.desc}
        </p>

        {/* 价值 */}
        {service.specs[0] && (
          <p className="text-xs text-slate-500 mb-4">
            <span className="text-slate-400">价值：</span>
            {service.specs[0]}
          </p>
        )}
      </div>

      {/* 价格标签 */}
      {service.priceLabel && (
        <div className="mb-4">
          <span className="text-sm font-bold text-amber-600">
            {service.priceLabel}
          </span>
        </div>
      )}

      {/* CTA 按钮 */}
      <button
        type="button"
        onClick={() => emitAppEvent("supply-os:consult")}
        className="w-full py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold transition-colors"
      >
        立即咨询
      </button>
    </div>
  );
}

export function ServiceCardGrid({ services }: ServiceCardGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {services.map((service, idx) => (
        <ServiceCardItem key={idx} service={service} />
      ))}
    </div>
  );
}

ServiceCardGrid.displayName = "ServiceCardGrid";
