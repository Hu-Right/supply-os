"use client";

/**
 * 中国企业联合国采购中标案例详情弹窗（自 Modals.tsx 拆出，数据与 JSX 逐字不变）。
 *
 * @module app/(public)/award-intelligence/modals/CnCaseDetailModal
 */
import { memo } from "react";
import { Modal } from "@/shared/ui";
import type { CnAwardCase } from "@/data/cn-award-cases";
import { useLocale } from "@/core/i18n";
import { Info } from "./_shared";

/* ── 中国企业联合国采购中标案例详情弹窗 ── */
export const CnCaseDetailModal = memo(function CnCaseDetailModal({ open, onClose, caseItem }: { open: boolean; onClose: () => void; caseItem: CnAwardCase | null }) {
  const { t } = useLocale();
  if (!caseItem) return null;
  const fmtAmount = caseItem.amountUSD ? `USD ${caseItem.amountUSD.toLocaleString()}` : caseItem.amountText;
  return (
    <Modal open={open} onClose={onClose} title={t("awardUiCaseTitle", { id: caseItem.id, winner: caseItem.winnerCN })} className="max-w-2xl">
      <div className="space-y-4 text-sm">
        {/* 基本信息 */}
        <div className="grid grid-cols-2 gap-3">
          <Info label={t("awardUiCaseAgency")} value={caseItem.agency} />
          <Info label={t("awardUiCaseContractNo")} value={caseItem.contractNo} />
          <Info label={t("awardThDate")} value={caseItem.date} />
          <Info label={t("awardUiCaseAgreementType")} value={caseItem.agreementType} />
          <Info label={t("awardUiCaseAmount")} value={fmtAmount} highlight />
          <Info label={t("awardUiCaseCoverage")} value={caseItem.coverage} />
        </div>
        {/* 采购内容 */}
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">{t("awardUiCaseContent")}</p>
          <p className="text-sm font-bold text-slate-800">{caseItem.content}</p>
        </div>
        {/* 中标企业 */}
        <div className="p-3 rounded-lg bg-teal-50 border border-teal-100">
          <p className="text-xs font-bold text-teal-700 mb-1">{t("awardUiCaseWinner")}</p>
          <p className="text-sm font-bold text-slate-800">{caseItem.winnerCN}</p>
          <p className="text-2xs text-slate-500 mt-0.5">{caseItem.winnerEN}</p>
        </div>
        {/* 中标原因 */}
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">{t("awardUiCaseReason")}</p>
          <p className="text-sm text-slate-700 leading-relaxed">{caseItem.reason}</p>
        </div>
        {/* 证据等级 + 来源 */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
            caseItem.evidenceLevel.includes("A+") ? "bg-emerald-100 text-emerald-700" :
            caseItem.evidenceLevel === "A" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"
          }`}>{t("awardUiCaseEvidence", { level: caseItem.evidenceLevel })}</span>
          <span className="text-xs text-slate-400">{t("awardUiCaseSource", { agency: caseItem.agency })}</span>
        </div>
      </div>
    </Modal>
  );
});
