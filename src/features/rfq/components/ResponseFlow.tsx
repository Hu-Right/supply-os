"use client";

/**
 * 供应商响应流程时间线
 * Supplier Response Flow
 *
 * @module features/rfq/components/ResponseFlow
 * @description 发布 → 审核匹配 → 报价 → 比价 → 履约 五步全链路展示，
 *              回答"发布后会发生什么"的信任问题。浅色横排，移动端可横滑。
 */
import { FileText, ShieldCheck, Mail, Scale, Handshake, ChevronRight } from "lucide-react";

const FLOW = [
  { icon: FileText, title: "发布需求", desc: "四步填写结构化需求，选择公开或定向" },
  { icon: ShieldCheck, title: "审核与匹配", desc: "平台真实性审核，匹配供应商并发出邀约" },
  { icon: Mail, title: "供应商报价", desc: "认证供应商在线提交报价与资质文件" },
  { icon: Scale, title: "比价与洽谈", desc: "多份报价同屏对比，在线洽谈确认" },
  { icon: Handshake, title: "履约支持", desc: "顾问跟进合同、验货与交付落地" },
];

export function ResponseFlow() {
  return (
    <section className="rounded-2xl border border-secondary-200 bg-white p-6 shadow-xs">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-extrabold text-secondary-900">发布后会发生什么</h2>
        <span className="text-xs text-secondary-400 hidden sm:block">
          平台对每条需求进行真实性审核，对供应商执行资质核验
        </span>
      </div>
      <div className="flex items-start overflow-x-auto pb-1 scrollbar-none">
        {FLOW.map((step, idx) => {
          const Icon = step.icon;
          return (
            <div key={step.title} className="flex items-start gap-2 min-w-0">
              <div className="flex flex-col items-center text-center min-w-[96px] px-1">
                <div className="w-11 h-11 rounded-full bg-primary-50 border border-primary-100 flex items-center justify-center mb-2">
                  <Icon className="w-5 h-5 text-primary-600" />
                </div>
                <div className="text-xs font-bold text-secondary-900 mb-1">
                  <span className="text-primary-600 mr-1">{idx + 1}</span>
                  {step.title}
                </div>
                <p className="text-2xs text-secondary-400 leading-relaxed">{step.desc}</p>
              </div>
              {idx < FLOW.length - 1 && (
                <div className="flex items-center pt-4 text-secondary-300 shrink-0">
                  <ChevronRight className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
