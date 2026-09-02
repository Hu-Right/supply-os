/**
 * 服务卡片组件
 * Service Card Component
 *
 * @module features/services/components/ServiceCard
 * @description 单个服务项展示卡片
 *              Single service item display card
 */

import type { ServiceItem } from "../types";
import { Button, Card } from "@/shared/ui";

export interface ServiceCardProps {
  service: ServiceItem;
  onBook: () => void;
  bookLabel: string;
}

export function ServiceCard({ service, onBook, bookLabel }: ServiceCardProps) {
  const Icon = service.icon;

  return (
    <Card interactive className="flex flex-col justify-between rounded-2xl p-5">
      <div>
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 font-bold text-teal-600">
          <Icon className="h-5 w-5" />
        </div>
        <h4 className="text-base font-extrabold text-slate-800">
          {service.title}
        </h4>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          {service.desc}
        </p>

        <div className="mt-4 border-t border-slate-100 pt-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            技术指标 / 服务涵盖
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {service.specs.map((sp, sIdx) => (
              <span
                key={sIdx}
                className="rounded border border-slate-150 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600"
              >
                {sp}
              </span>
            ))}
          </div>
        </div>
      </div>

      <Button
        variant="primary"
        onClick={onBook}
        className="mt-5 w-full bg-slate-900 hover:bg-slate-850 py-2 text-xs font-semibold"
      >
        {bookLabel}
      </Button>
    </Card>
  );
}

ServiceCard.displayName = "ServiceCard";
