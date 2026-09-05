"use client";

/**
 * RFQ 页 — 客户端占位
 * RFQ Page — Client Placeholder
 */
import { useLocale } from "@/core/i18n";
import { FileText } from "lucide-react";

export default function PageClient() {
  const { t } = useLocale();

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-teal-100 mb-4">
        <FileText className="w-8 h-8 text-teal-600" />
      </div>
      <h2 className="text-2xl font-extrabold text-slate-900 mb-2">
        {t("navRFQ")}
      </h2>
      <p className="text-slate-500 text-sm max-w-md">
        模块开发中 — 将提供采购需求发布表单、RFQ 市场、供应商报价与平台撮合服务。
      </p>
    </div>
  );
}
