/**
 * 锁定态会员引导卡（amber 营销卡容器）
 * Locked Feature Card
 *
 * @module features/procurement/components/NoticeDetail/LockedFeatureCard
 * @description 「会员专享」锁定态引导卡的统一容器：amber 浅底 + 图标标题（— 会员专享 后缀）
 *              + 引言 + 亮点清单 + 底部提示（VIP 与非 VIP 两态文案由调用方给）。
 *              自 FilesTab 抽出（2026-10-31 组件化）：同族面板（报告预览 teaser、后续功能锁定位）
 *              复用同一视觉与结构，文案全部调用方传入（已翻译）。
 */
import type { ComponentType, ReactNode } from "react";

export interface LockedFeatureCardProps {
  /** 标题栏图标（lucide 组件） */
  icon: ComponentType<{ className?: string }>;
  /** 已翻译标题（「会员专享」后缀由调用方拼入） */
  title: ReactNode;
  /** 已翻译引言；不传不渲染 */
  intro?: ReactNode;
  /** 亮点清单（<li> 列表内容）；不传不渲染 */
  bullets?: ReactNode;
  /** 底部提示（VIP/非 VIP 两态由调用方选择）；不传不渲染 */
  footer?: ReactNode;
}

export function LockedFeatureCard({ icon: Icon, title, intro, bullets, footer }: LockedFeatureCardProps) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-amber-600" />
        <h3 className="text-sm font-extrabold text-amber-800">{title}</h3>
      </div>
      {intro && <p className="text-xs text-amber-700 mb-3">{intro}</p>}
      {bullets && <ul className="space-y-1.5 mb-4">{bullets}</ul>}
      {footer}
    </section>
  );
}
