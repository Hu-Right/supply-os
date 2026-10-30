"use client";

/**
 * RFQ 页面右栏（sticky 侧栏）
 * RFQ Sidebar
 *
 * @module features/rfq/components/RfqSidebar
 * @description 平台服务入口、采购顾问卡、我的草稿卡。填表过程中常驻可见。
 */
import { Bell, Bot, ChevronRight, Headphones, UserCheck } from "lucide-react";

import { Button, Card } from "@/shared/ui";
import { useLocale } from "@/core/i18n";
import { emitAppEvent } from "@/core/events";

const SERVICES = [
  { icon: Bot, titleKey: "rfqServiceAiTitle", descKey: "rfqServiceAiDesc" },
  { icon: UserCheck, titleKey: "rfqServiceInviteTitle", descKey: "rfqServiceInviteDesc" },
  { icon: Bell, titleKey: "rfqServiceQuoteMgmtTitle", descKey: "rfqServiceQuoteMgmtDesc" },
];

export function RfqSidebar() {
  const { t } = useLocale();
  return (
    <div className="space-y-6">
      {/* 平台服务辅助 */}
      <Card className="rounded-2xl p-5">
        <h3 className="text-sm font-extrabold text-secondary-900 mb-3">{t("rfqSidebarTitle")}</h3>
        <div className="space-y-1">
          {SERVICES.map(({ icon: Icon, titleKey, descKey }) => (
            <div key={titleKey}
              className="flex items-start gap-3 rounded-xl p-3 hover:bg-secondary-50 cursor-pointer transition-colors group">
              <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
                <Icon className="w-4.5 h-4.5 text-primary-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <h4 className="text-sm font-bold text-secondary-800">{t(titleKey)}</h4>
                  <ChevronRight className="w-3.5 h-3.5 text-secondary-300 group-hover:text-primary-600 shrink-0" />
                </div>
                <p className="text-xs text-secondary-400 leading-relaxed mt-0.5">{t(descKey)}</p>
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
            <h4 className="text-sm font-bold text-secondary-900">{t("rfqConsultTitle")}</h4>
            <p className="text-xs text-secondary-500 leading-relaxed mt-1">
              {t("rfqConsultDesc")}
            </p>
          </div>
        </div>
        <Button size="sm" variant="cta" className="w-full mt-4" onClick={() => emitAppEvent("supply-os:consult")}>
          {t("rfqConsultCta")}
        </Button>
      </div>
    </div>
  );
}
