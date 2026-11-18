"use client";

/**
 * 供应商资源库 — 列表三态（骨架屏 / 错误重试 / 空态），自 page-client.tsx 拆出，JSX 逐字不变。
 *
 * 错误态与空态必须区分（加载失败不得伪装成"暂无工厂"）——判定逻辑留在容器，本组件只管呈现。
 *
 * @module app/(public)/settings/supplier-pool/components/PoolListStates
 */
import { memo } from "react";
import { Building2, AlertCircle, RefreshCw } from "lucide-react";
import { useLocale } from "@/core/i18n";

/** 加载中骨架 */
export const PoolListSkeleton = memo(function PoolListSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-slate-100" />)}
    </div>
  );
});

/** 加载失败（可重试，不伪装成空态） */
export const PoolListError = memo(function PoolListError({ onRetry }: { onRetry: () => void }) {
  const { t } = useLocale();
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-8 text-center">
      <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
      <p className="text-sm text-rose-700 mb-4">
        {t("supplierPoolLoadFailed") || "资源库加载失败，请稍后重试"}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 px-4 py-2 text-sm font-bold transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        {t("supplierPoolRetry") || "重试"}
      </button>
    </div>
  );
});

/** 空态引导 */
export const PoolListEmpty = memo(function PoolListEmpty() {
  const { t } = useLocale();
  return (
    <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
      <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
      <p className="text-sm text-slate-500 mb-1">
        {t("supplierPoolEmpty") || "你还没有添加合作工厂"}
      </p>
      <p className="text-2xs text-slate-400">
        {t("supplierPoolEmptyHint") || "输入公司名称即可添加，完善诊断信息可提升 AI 匹配准确度"}
      </p>
    </div>
  );
});
