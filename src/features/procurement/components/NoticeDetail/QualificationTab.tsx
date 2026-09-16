/**
 * 资格条件 Tab 内容
 * Qualification Tab Content
 *
 * @module features/procurement/components/NoticeDetail/QualificationTab
 * @description 根据 registration_level 动态展示不同等级的要求说明，
 *              展示供应商投标条件、资格要求与技术门槛。
 *              未解锁时显示具体的解锁提示文案（含锁定项明细）。
 */
import { ShieldCheck, FileCheck, Wrench, Lock, AlertCircle, CheckCircle2 } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { NoticeDetailItem } from "../../types";

interface QualificationTabProps {
  notice: NoticeDetailItem;
  /** 是否已解锁核心信息 */
  coreUnlocked: boolean;
  /** 是否 VIP（影响锁定提示文案） */
  isVip?: boolean;
}

/** 注册等级配置 */
const REG_LEVEL_CONFIG: Record<string, { label: string; color: string; border: string; bg: string; guidance: string }> = {
  basic: {
    label: "基础级 (Basic)",
    color: "text-slate-700",
    border: "border-slate-200",
    bg: "bg-slate-50",
    guidance: "该公告对供应商注册等级要求较低，完成基础注册即可参与投标。",
  },
  l1: {
    label: "L1 级",
    color: "text-teal-700",
    border: "border-teal-200",
    bg: "bg-teal-50",
    guidance: "需完成 UNGM L1 注册，提交公司基本信息与财务报表。",
  },
  l2: {
    label: "L2 级",
    color: "text-blue-700",
    border: "border-blue-200",
    bg: "bg-blue-50",
    guidance: "需完成 UNGM L2 注册，额外提供审计报告、ISO 认证等资质文件。",
  },
  l3: {
    label: "L3 级",
    color: "text-amber-700",
    border: "border-amber-200",
    bg: "bg-amber-50",
    guidance: "最高等级要求，需通过采购方现场审核与过往业绩验证。",
  },
};

function getLevelConfig(level?: string) {
  if (!level) return null;
  const normalized = level.toLowerCase().replace(/\s+/g, "");
  // 模糊匹配：basic/l1/l2/l3
  if (normalized.includes("basic") || normalized === "基础") return REG_LEVEL_CONFIG.basic;
  if (normalized.includes("l1") || normalized.includes("level1")) return REG_LEVEL_CONFIG.l1;
  if (normalized.includes("l2") || normalized.includes("level2")) return REG_LEVEL_CONFIG.l2;
  if (normalized.includes("l3") || normalized.includes("level3")) return REG_LEVEL_CONFIG.l3;
  // 未知等级：回退显示原始值
  return {
    label: level,
    color: "text-slate-700",
    border: "border-slate-200",
    bg: "bg-slate-50",
    guidance: "",
  };
}

/** 渲染一个条件区块 */
function ConditionBlock({
  icon: Icon,
  iconColor,
  title,
  content,
  emptyText,
}: {
  icon: typeof ShieldCheck;
  iconColor: string;
  title: string;
  content: string | undefined;
  emptyText: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="text-sm font-extrabold text-slate-900 mb-2 flex items-center gap-2">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        {title}
      </h4>
      {content && content !== "-" ? (
        <p className="text-sm text-slate-700 leading-7 whitespace-pre-line break-words">
          {content}
        </p>
      ) : (
        <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-3">
          <AlertCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <p className="text-sm text-slate-400">{emptyText}</p>
        </div>
      )}
    </div>
  );
}

export function QualificationTab({ notice, coreUnlocked, isVip }: QualificationTabProps) {
  const { t } = useLocale();

  const supplierConditions = notice.supplier_conditions || "";
  const eligibility = notice.eligibility || "";
  const technicalHurdles = notice.technical_hurdles || "";
  const hasContent = supplierConditions || eligibility || technicalHurdles;
  const levelConfig = getLevelConfig(notice.registration_level);

  // ── 未解锁：展示具体锁定提示 ──
  if (!coreUnlocked) {
    const lockedItems = [
      hasContent || notice.registration_level ? "注册等级要求与详细说明" : null,
      supplierConditions ? "供应商投标条件全文" : null,
      eligibility ? "资格要求细则" : null,
      technicalHurdles ? "技术门槛与资质清单" : null,
    ].filter(Boolean);

    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Lock className="w-4 h-4 text-amber-600" />
          <h3 className="text-sm font-extrabold text-amber-800">
            {t("detail_tabQualification") || "资格条件"} — 会员专享
          </h3>
        </div>
        <p className="text-xs text-amber-700 mb-3">
          解锁后可查看本公告的完整资格要求，包括：
        </p>
        <ul className="space-y-1.5 mb-4">
          {lockedItems.length > 0 ? lockedItems.map((item, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-amber-700">
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              {item}
            </li>
          )) : (
            <li className="text-xs text-amber-600">注册等级要求、供应商条件、资格细则与技术门槛</li>
          )}
        </ul>
        {isVip ? (
          <p className="text-xs font-bold text-amber-800 bg-amber-100/60 rounded-lg px-3 py-2 text-center">
            您已是会员，解锁本公告后即可查看全部资格条件
          </p>
        ) : (
          <p className="text-xs text-amber-600 bg-amber-100/40 rounded-lg px-3 py-2 text-center">
            升级会员或单次解锁即可查看完整资格条件
          </p>
        )}
      </section>
    );
  }

  // ── 已解锁但无内容 ──
  if (!hasContent && !levelConfig) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-3" />
        <p className="text-sm text-slate-500 mb-1">
          {t("procurement_noQualificationInfo") || "本公告暂无结构化资格条件信息"}
        </p>
        <p className="text-xs text-slate-400">
          建议下载原始招标文件获取完整的资质要求
        </p>
      </section>
    );
  }

  // ── 已解锁：展示完整资格条件 ──
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-extrabold text-slate-900">
          {t("detail_tabQualification") || "资格条件"}
        </h3>
        {levelConfig && (
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-bold ${levelConfig.bg} ${levelConfig.color} ${levelConfig.border}`}>
            <ShieldCheck className="w-3.5 h-3.5" />
            {levelConfig.label}
          </span>
        )}
      </div>

      {/* 等级说明条 */}
      {levelConfig?.guidance && (
        <div className={`rounded-xl border ${levelConfig.border} ${levelConfig.bg} px-4 py-3`}>
          <p className="text-xs font-bold text-slate-700 leading-6">
            <ShieldCheck className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
            {levelConfig.guidance}
          </p>
        </div>
      )}

      <ConditionBlock
        icon={ShieldCheck}
        iconColor="text-teal-600"
        title={t("procurement_supplierConditions") || "供应商投标条件"}
        content={supplierConditions}
        emptyText="本公告未列出具体供应商条件，请参考原始招标文件"
      />

      <ConditionBlock
        icon={FileCheck}
        iconColor="text-blue-600"
        title={t("procurement_eligibility") || "资格要求"}
        content={eligibility}
        emptyText="本公告未列出具体资格要求，请参考原始招标文件"
      />

      <ConditionBlock
        icon={Wrench}
        iconColor="text-amber-600"
        title={t("procurement_technicalHurdles") || "技术门槛"}
        content={technicalHurdles}
        emptyText="本公告未列出具体技术门槛，请参考原始招标文件"
      />
    </section>
  );
}
