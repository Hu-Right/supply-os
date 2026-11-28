/**
 * 资格条件 Tab 内容
 * Qualification Tab Content
 *
 * @module features/procurement/components/NoticeDetail/QualificationTab
 * @description 两种口径并列展示：
 *              ① 结构化要求清单（`notice.requirements`，来自 notice_requirement_items 最新版本）——
 *                 按 mandatory(废标) / scored(评分) / preferred(加分) 分组，每条可展开原文；
 *              ② 原文摘录（supplierConditions / eligibility / technicalHurdles）——源站原话，作证据链。
 *              按 registration_level 展示等级说明；未解锁时展示解锁提示（含锁定项明细）。
 *              注意：新增文案用中文字面量——i18next 缺 key 时返回 key 本身，`t(k) || "文案"` 兜不住。
 */
import { ShieldCheck, FileCheck, Wrench, Lock, AlertCircle, CheckCircle2 } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { NoticeDetailItem, NoticeRequirementItem } from "../../types";

interface QualificationTabProps {
  notice: NoticeDetailItem;
  /** 是否已解锁核心信息 */
  coreAccessible: boolean;
  /** 资格条件独立权益（qualification_access）是否放行；缺省回退 coreAccessible */
  qualificationAccessible?: boolean;
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

/** 要求类型 → 中文标签（与 notice_requirement_items.requirement_type 同值域） */
const REQUIREMENT_TYPE_LABELS: Record<string, string> = {
  certification: "认证",
  experience: "业绩",
  financial: "财务",
  personnel: "人员",
  localization: "本地化",
  registration: "注册",
  technical: "技术",
  commercial: "商务",
  delivery: "交付",
  submission: "投标",
  bond: "保证金",
  language: "语言",
  warranty: "质保",
  other: "其他",
};

/** 分组顺序与语义（importance 值域：mandatory/scored/preferred） */
const IMPORTANCE_GROUPS: Array<{ key: string; label: string; hint: string; chip: string }> = [
  { key: "mandatory", label: "强制项", hint: "不满足即废标", chip: "bg-rose-50 text-rose-700 border-rose-200" },
  { key: "scored", label: "评分项", hint: "影响技术/商务得分", chip: "bg-amber-50 text-amber-700 border-amber-200" },
  { key: "preferred", label: "加分项", hint: "非必需，可作为加分", chip: "bg-slate-50 text-slate-600 border-slate-200" },
];

/** 已知置信度低于该值时提示"待核验" */
const LOW_CONFIDENCE = 0.6;

/** 渲染一个条件区块（原文口径） */
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

/** 单条要求：标题 + 类型 + 置信度提示 + 原文折叠 */
function RequirementRow({ item, index }: { item: NoticeRequirementItem; index: number }) {
  const typeLabel = REQUIREMENT_TYPE_LABELS[item.type] || item.type;
  const lowConfidence = typeof item.confidence === "number" && item.confidence > 0 && item.confidence < LOW_CONFIDENCE;
  const hasRaw = !!item.rawText && item.rawText.trim().length > 0 && item.rawText.trim() !== item.title.trim();
  return (
    <li className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded bg-slate-100 px-1 text-[11px] font-bold text-slate-500">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 leading-6 break-words">{item.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
              {typeLabel}
            </span>
            {lowConfidence && (
              <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                <AlertCircle className="w-3 h-3" />
                待核验
              </span>
            )}
          </div>
          {hasRaw && (
            <details className="mt-1.5 group">
              <summary className="cursor-pointer text-[11px] font-medium text-slate-400 hover:text-slate-600 select-none">
                查看原文
              </summary>
              <p className="mt-1 rounded bg-slate-50 p-2 text-xs text-slate-500 leading-6 whitespace-pre-line break-words">
                {item.rawText}
              </p>
            </details>
          )}
        </div>
      </div>
    </li>
  );
}

/** 结构化要求清单：按强制/评分/加分分组 */
function RequirementList({ items }: { items: NoticeRequirementItem[] }) {
  const counts = {
    mandatory: items.filter((i) => i.importance === "mandatory").length,
    scored: items.filter((i) => i.importance === "scored").length,
    preferred: items.filter((i) => i.importance === "preferred").length,
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
          <FileCheck className="w-4 h-4 text-teal-600" />
          结构化要求（共 {items.length} 项）
        </h4>
        <span className="text-[11px] text-slate-400">
          强制 {counts.mandatory} · 评分 {counts.scored} · 加分 {counts.preferred}
        </span>
      </div>
      <div className="space-y-3">
        {IMPORTANCE_GROUPS.map((group) => {
          const rows = items.filter((i) => i.importance === group.key);
          return (
            <section key={group.key}>
              <div className="mb-1.5 flex items-center gap-2">
                <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-bold ${group.chip}`}>
                  {group.label} · {rows.length}
                </span>
                <span className="text-[11px] text-slate-400">{group.hint}</span>
              </div>
              {rows.length === 0 ? (
                <p className="pl-1 text-[11px] text-slate-400">暂无{group.label}</p>
              ) : (
                <ul className="space-y-1.5">
                  {rows.map((item, i) => (
                    <RequirementRow key={`${group.key}-${item.seq}-${i}`} item={item} index={i} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function QualificationTab({ notice, coreAccessible, qualificationAccessible, isVip }: QualificationTabProps) {
  const { t } = useLocale();
  const accessible = qualificationAccessible ?? coreAccessible;

  const requirements = notice.requirements ?? [];
  const hasRequirements = requirements.length > 0;
  const supplierConditions = notice.supplierConditions || "";
  const eligibility = notice.eligibility || "";
  const technicalHurdles = notice.technicalHurdles || "";
  const hasContent = Boolean(supplierConditions || eligibility || technicalHurdles);
  const levelConfig = getLevelConfig(notice.registrationLevel ?? undefined);

  // ── 未解锁：展示具体锁定提示 ──
  if (!accessible) {
    const lockedItems = [
      hasRequirements || hasContent || notice.registrationLevel ? t("detail_qualLockedLevel") || "注册等级要求与详细说明" : null,
      hasRequirements ? `结构化要求清单（${requirements.length} 项：强制/评分/加分）` : null,
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
            {t("detail_qualUpgradeHint") || "购买会员并解锁本公告即可查看完整资格条件"}
          </p>
        )}
      </section>
    );
  }

  // ── 已解锁但两套口径都为空：给明确空态（不是"公告没有要求"，是"没抽到"）──
  if (!hasRequirements && !hasContent && !levelConfig) {
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

  // ── 已解锁：结构化清单（若有）+ 原文摘录（有值才渲染）──
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-extrabold text-slate-900">
          {t("detail_tabQualification") || "资格条件"}
        </h3>
        {levelConfig && (
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-bold ${levelConfig.bg} ${levelConfig.color} ${levelConfig.border}`}>
            <ShieldCheck className="w-3.5 h-3.5" />
            {levelConfig.labelKey ? t(levelConfig.labelKey) : levelConfig.label}
          </span>
        )}
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

      {/* ① 结构化要求清单 */}
      {hasRequirements ? (
        <RequirementList items={requirements} />
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-3">
          <p className="text-xs text-slate-500 leading-6">
            本公告尚未抽取结构化资格要求，以下为公告原文摘录；完整要求请以原始招标文件为准。
          </p>
        </div>
      )}

      {/* ② 原文摘录（源站原话，有值才占位） */}
      {supplierConditions ? (
        <ConditionBlock
          icon={ShieldCheck}
          iconColor="text-teal-600"
          title={t("procurement_supplierConditions") || "供应商投标条件"}
          content={supplierConditions}
          emptyText={t("detail_qualEmptyConditions") || "本公告未列出具体供应商条件，请参考原始招标文件"}
        />
      ) : null}

      {eligibility ? (
        <ConditionBlock
          icon={FileCheck}
          iconColor="text-blue-600"
          title={t("procurement_eligibility") || "资格要求"}
          content={eligibility}
          emptyText={t("detail_qualEmptyEligibility") || "本公告未列出具体资格要求，请参考原始招标文件"}
        />
      ) : null}

      {technicalHurdles ? (
        <ConditionBlock
          icon={Wrench}
          iconColor="text-amber-600"
          title={t("procurement_technicalHurdles") || "技术门槛"}
          content={technicalHurdles}
          emptyText={t("detail_qualEmptyHurdles") || "本公告未列出具体技术门槛，请参考原始招标文件"}
        />
      ) : null}
    </section>
  );
}
