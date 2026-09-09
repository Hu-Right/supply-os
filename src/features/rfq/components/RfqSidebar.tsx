"use client";

/**
 * RFQ 页面右栏（sticky 侧栏）
 * RFQ Sidebar
 *
 * @module features/rfq/components/RfqSidebar
 * @description 平台服务入口、采购顾问卡、我的草稿卡。填表过程中常驻可见。
 */
import { Bell, Bot, ChevronRight, Headphones, Trash2, UserCheck, FileText } from "lucide-react";

import { Button, Card } from "@/shared/ui";
import { emitAppEvent } from "@/core/events";

const SERVICES = [
  { icon: Bot, title: "AI 推荐供应商", desc: "填写类目后，智能推荐匹配度最高的供应商" },
  { icon: UserCheck, title: "定向邀请认证供应商", desc: "按行业 / 地区 / 认证定向邀约报价" },
  { icon: Bell, title: "报价管理与提醒", desc: "集中管理报价，截止时间实时提醒" },
];

interface RfqSidebarProps {
  hasDraft: boolean;
  savedAt: number | null;
  onResume: () => void;
  onClearDraft: () => void;
}

export function RfqSidebar({ hasDraft, savedAt, onResume, onClearDraft }: RfqSidebarProps) {
  return (
    <div className="space-y-6">
      {/* 我的草稿 */}
      {hasDraft && (
        <Card className="rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
              <FileText className="w-4.5 h-4.5 text-primary-600" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-bold text-secondary-900">有未完成的草稿</h4>
              <p className="text-xs text-secondary-400 mt-0.5">
                保存于 {savedAt ? new Date(savedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
              </p>
              <div className="flex items-center gap-2 mt-3">
                <Button size="sm" onClick={onResume}>继续填写</Button>
                <Button size="sm" variant="ghost" onClick={onClearDraft}>
                  <Trash2 className="w-3.5 h-3.5" /> 删除
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 平台服务辅助 */}
      <Card className="rounded-2xl p-5">
        <h3 className="text-sm font-extrabold text-secondary-900 mb-3">平台服务</h3>
        <div className="space-y-1">
          {SERVICES.map(({ icon: Icon, title, desc }) => (
            <div key={title}
              className="flex items-start gap-3 rounded-xl p-3 hover:bg-secondary-50 cursor-pointer transition-colors group">
              <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
                <Icon className="w-4.5 h-4.5 text-primary-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <h4 className="text-sm font-bold text-secondary-800">{title}</h4>
                  <ChevronRight className="w-3.5 h-3.5 text-secondary-300 group-hover:text-primary-600 shrink-0" />
                </div>
                <p className="text-xs text-secondary-400 leading-relaxed mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 采购顾问 */}
      <div className="rounded-2xl border border-primary-100 bg-gradient-to-br from-primary-50/80 to-white p-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-white border border-primary-100 flex items-center justify-center shrink-0">
            <Headphones className="w-4.5 h-4.5 text-primary-600" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-secondary-900">需要帮忙梳理需求？</h4>
            <p className="text-xs text-secondary-500 leading-relaxed mt-1">
              专业采购顾问 1 对 1 协助：明确采购要点、优化需求描述、跟进报价。
            </p>
          </div>
        </div>
        <Button size="sm" variant="cta" className="w-full mt-4" onClick={() => emitAppEvent("supply-os:consult")}>
          预约采购顾问
        </Button>
      </div>
    </div>
  );
}
