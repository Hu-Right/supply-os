"use client";

/**
 * 七步发布流程指示条（让采购方随时知道"走到哪一步"）
 * @module features/procurement-demand/FlowStepper
 *
 * @description 步骤即七步流程：1 主体认证 → 2 填写需求 → 3 确认版本 → 4 生成授权书
 *              → 5 盖章签署 → 6 云境核验 → 7 发布匹配。current 之前的步骤视为已完成。
 */
import { useLocale } from "@/core/i18n";

export function FlowStepper({ current, compact = false }: { current: number; compact?: boolean }) {
  const { t } = useLocale();
  const steps = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ n, label: t(`pc_flow_s${n}`) }));

  return (
    <div className={`flex items-center gap-1 overflow-x-auto ${compact ? "text-[10px]" : "text-xs"}`}>
      {steps.map((s, idx) => {
        const done = s.n < current;
        const active = s.n === current;
        return (
          <div key={s.n} className="flex items-center gap-1">
            {idx > 0 && <span className={`mx-0.5 ${done ? "text-teal-500" : "text-secondary-300"}`}>→</span>}
            <span
              className={`whitespace-nowrap rounded-full px-2.5 py-1 font-semibold ${
                active
                  ? "bg-teal-600 text-white shadow-xs"
                  : done
                    ? "bg-teal-50 text-teal-700"
                    : "bg-secondary-100 text-secondary-400"
              }`}
            >
              {done ? "✓ " : `${s.n}. `}{s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
