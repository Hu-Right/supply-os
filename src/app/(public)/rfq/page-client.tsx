"use client";

/**
 * /rfq — 全球采购需求发布（新发布域，整体替换旧 RFQ 向导）
 * @module app/(public)/rfq/page-client
 * @description 页面组成：主体认证卡（七步流程第 1 步状态）+ 发布向导（第 2/3 步）+
 *              需求广场（第 7 步对外面）。供应商响应/报价面随旧域退役（P4 按全案重建）。
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/core/i18n";
import { fetchMyBuyer, type BuyerInfo } from "@/features/procurement-demand/api";
import { ProcurementWizard } from "@/features/procurement-demand/ProcurementWizard";
import { ProcurementPlaza } from "@/features/procurement-demand/ProcurementPlaza";

const BUYER_STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  verified: "bg-teal-100 text-teal-800",
  need_info: "bg-amber-100 text-amber-800",
  restricted: "bg-red-100 text-red-700",
};

function RfqPageContent() {
  const { t } = useLocale();
  const [buyer, setBuyer] = useState<BuyerInfo | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMyBuyer()
      .then((b) => { if (!cancelled) setBuyer(b); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setChecked(true); });
    return () => { cancelled = true; };
  }, []);

  const statusCls = buyer ? BUYER_STATUS_BADGE[buyer.status] ?? "bg-secondary-100 text-secondary-600" : "";

  return (
    <div className="-mx-4 -my-6 sm:-mx-6 lg:-mx-8 bg-[#F5F8FB] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-2xl bg-gradient-to-r from-teal-700 to-teal-600 p-6 text-white">
          <h1 className="text-xl font-extrabold">{t("pc_hero_title")}</h1>
          <p className="mt-1 text-sm text-teal-50">{t("pc_hero_desc")}</p>
        </div>

        {/* 第 1 步：采购方认证状态 */}
        {checked && (
          <div className="rounded-2xl border border-secondary-200 bg-white p-5 shadow-xs">
            {buyer ? (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm text-secondary-700">
                  <span className="font-semibold">{t("pc_buyer_org")}:</span> {buyer.orgName}
                  <span className={`ml-2 rounded-full px-3 py-1 text-xs font-semibold ${statusCls}`}>
                    {t(`pc_buyer_status_${buyer.status}`)}
                  </span>
                </div>
                <Link className="text-sm font-semibold text-teal-600 underline" href="/settings/buyer">
                  {t("pc_buyer_manage")}
                </Link>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm text-secondary-700">{t("pc_buyer_missing")}</div>
                <Link className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white" href="/settings/buyer">
                  {t("pc_buyer_go_verify")}
                </Link>
              </div>
            )}
            <p className="mt-2 text-xs text-secondary-400">{t("pc_buyer_hint")}</p>
          </div>
        )}

        {/* 第 2/3 步：发布向导 */}
        <div>
          <h2 className="mb-3 text-lg font-extrabold text-secondary-900">{t("pc_wizard_title")}</h2>
          <ProcurementWizard />
        </div>

        {/* 第 7 步对外面：广场 */}
        <ProcurementPlaza />
      </div>
    </div>
  );
}

export default function PageClient() {
  return <RfqPageContent />;
}
