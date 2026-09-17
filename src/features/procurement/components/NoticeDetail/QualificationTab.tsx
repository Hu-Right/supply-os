/**
 * 资格条件 Tab 内容
 * Qualification Tab Content
 *
 * @module features/procurement/components/NoticeDetail/QualificationTab
 * @description 根据 registration_level 动态展示不同等级的要求说明，
 *              展示供应商投标条件、资格要求与技术门槛。
 *              未解锁时显示具体的解锁提示文案（含锁定项明细）。
 */
import { useState } from "react";
import { ShieldCheck, FileCheck, Wrench, Lock, AlertCircle, CheckCircle2, Languages } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { NoticeDetailItem } from "../../types";

interface QualificationTabProps {
  notice: NoticeDetailItem;
  /** 是否已解锁核心信息 */
  coreUnlocked: boolean;
  /** 是否 VIP（影响锁定提示文案） */
  isVip?: boolean;
}

/** 注册等级配置（文案走 i18n，未知等级回退显示原始值） */
const REG_LEVEL_CONFIG: Record<string, { labelKey?: string; label?: string; color: string; border: string; bg: string; guidanceKey?: string }> = {
  basic: {
    labelKey: "detail_regLevelBasic",
    color: "text-slate-700",
    border: "border-slate-200",
    bg: "bg-slate-50",
    guidanceKey: "detail_regLevelBasicGuide",
  },
  l1: {
    labelKey: "detail_regLevelL1",
    color: "text-teal-700",
    border: "border-teal-200",
    bg: "bg-teal-50",
    guidanceKey: "detail_regLevelL1Guide",
  },
  l2: {
    labelKey: "detail_regLevelL2",
    color: "text-blue-700",
    border: "border-blue-200",
    bg: "bg-blue-50",
    guidanceKey: "detail_regLevelL2Guide",
  },
  l3: {
    labelKey: "detail_regLevelL3",
    color: "text-amber-700",
    border: "border-amber-200",
    bg: "bg-amber-50",
    guidanceKey: "detail_regLevelL3Guide",
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

/** 从中英双语字段中提取纯中文部分
 *  格式：English: + 英文段落 + 中文:/中文：+ 中文段落
 *  若无标记则尝试按行检测（中文在前英文在后）
 */
function extractChinese(text: string): string {
  if (!text) return "";
  // 优先匹配 "中文:" 或 "中文：" 标记（兼容半角/全角冒号、前后空格）
  const zhMatch = text.match(/中文\s*[:：]/);
  if (zhMatch && zhMatch.index !== undefined) {
    return text.slice(zhMatch.index + zhMatch[0].length).trim();
  }
  // 兜底：按行检测，取第一个英文段落之前的中文行
  const lines = text.split("\n");
  const zhLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) break;
    const asciiRatio = (trimmed.match(/[A-Za-z]/g) || []).length / Math.max(trimmed.length, 1);
    if (asciiRatio > 0.5) break;
    zhLines.push(line);
  }
  return zhLines.join("\n").trim();
}

export function QualificationTab({ notice, coreUnlocked, isVip }: QualificationTabProps) {
  const { t } = useLocale();
  const [showOriginal, setShowOriginal] = useState(false);

  const supplierConditions = notice.supplier_conditions || "";
  const eligibility = notice.eligibility || "";
  const technicalHurdles = notice.technical_hurdles || "";
  const hasContent = supplierConditions || eligibility || technicalHurdles;
  const levelConfig = getLevelConfig(notice.registration_level);

  // 判断是否有双语内容（中文+英文）
  const hasBilingual = [supplierConditions, eligibility, technicalHurdles].some(
    (text) => text && extractChinese(text) && extractChinese(text).length < text.length,
  );

  // ── 未解锁：展示具体锁定提示 ──
  if (!coreUnlocked) {
    const lockedItems = [
      hasContent || notice.registration_level ? t("detail_qualLockedLevel") || "注册等级要求与详细说明" : null,
      supplierConditions ? t("detail_qualLockedConditions") || "供应商投标条件全文" : null,
      eligibility ? t("detail_qualLockedEligibility") || "资格要求细则" : null,
      technicalHurdles ? t("detail_qualLockedHurdles") || "技术门槛与资质清单" : null,
    ].filter(Boolean);

    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Lock className="w-4 h-4 text-amber-600" />
          <h3 className="text-sm font-extrabold text-amber-800">
            {t("detail_tabQualification") || "资格条件"} — {t("detail_memberExclusive") || "会员专享"}
          </h3>
        </div>
        <p className="text-xs text-amber-700 mb-3">
          {t("detail_qualLockedIntro") || "解锁后可查看本公告的完整资格要求，包括："}
        </p>
        <ul className="space-y-1.5 mb-4">
          {lockedItems.length > 0 ? lockedItems.map((item, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-amber-700">
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              {item}
            </li>
          )) : (
            <li className="text-xs text-amber-600">{t("detail_qualLockedAll") || "注册等级要求、供应商条件、资格细则与技术门槛"}</li>
          )}
        </ul>
        {isVip ? (
          <p className="text-xs font-bold text-amber-800 bg-amber-100/60 rounded-lg px-3 py-2 text-center">
            {t("detail_qualVipHint") || "您已是会员，解锁本公告后即可查看全部资格条件"}
          </p>
        ) : (
          <p className="text-xs text-amber-600 bg-amber-100/40 rounded-lg px-3 py-2 text-center">
            {t("detail_qualUnlockHint") || "升级会员或单次解锁即可查看完整资格条件"}
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
          {t("detail_qualNoInfoHint") || "建议下载原始招标文件获取完整的资质要求"}
        </p>
      </section>
    );
  }

  // 根据切换状态决定显示中文还是完整双语
  const display = (text: string) => (showOriginal ? text : extractChinese(text) || text);

  // ── 已解锁：展示完整资格条件 ──
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-extrabold text-slate-900">
          {t("detail_tabQualification") || "资格条件"}
        </h3>
        <div className="flex items-center gap-2">
          {levelConfig && (
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-bold ${levelConfig.bg} ${levelConfig.color} ${levelConfig.border}`}>
              <ShieldCheck className="w-3.5 h-3.5" />
              {levelConfig.labelKey ? t(levelConfig.labelKey) : levelConfig.label}
            </span>
          )}
          {hasBilingual && (
            <button
              type="button"
              onClick={() => setShowOriginal((v) => !v)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Languages className="w-3 h-3" />
              {showOriginal ? (t("detail_qualShowZh") || "显示中文") : (t("detail_qualShowOriginal") || "显示原文")}
            </button>
          )}
        </div>
      </div>

      {/* 等级说明条 */}
      {levelConfig?.guidanceKey && (
        <div className={`rounded-xl border ${levelConfig.border} ${levelConfig.bg} px-4 py-3`}>
          <p className="text-xs font-bold text-slate-700 leading-6">
            <ShieldCheck className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
            {t(levelConfig.guidanceKey)}
          </p>
        </div>
      )}

      <ConditionBlock
        icon={ShieldCheck}
        iconColor="text-teal-600"
        title={t("procurement_supplierConditions") || "供应商投标条件"}
        content={display(supplierConditions)}
        emptyText={t("detail_qualEmptyConditions") || "本公告未列出具体供应商条件，请参考原始招标文件"}
      />

      <ConditionBlock
        icon={FileCheck}
        iconColor="text-blue-600"
        title={t("procurement_eligibility") || "资格要求"}
        content={display(eligibility)}
        emptyText={t("detail_qualEmptyEligibility") || "本公告未列出具体资格要求，请参考原始招标文件"}
      />

      <ConditionBlock
        icon={Wrench}
        iconColor="text-amber-600"
        title={t("procurement_technicalHurdles") || "技术门槛"}
        content={display(technicalHurdles)}
        emptyText={t("detail_qualEmptyHurdles") || "本公告未列出具体技术门槛，请参考原始招标文件"}
      />
    </section>
  );
}
