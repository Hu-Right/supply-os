// i18n-allow-file: 中文站点兜底/单位文案，待统一入 i18n
/**
 * 诊断 V3 表单渲染器（A 资质 / B 能力 / C 档案就绪度 三部分）
 * Diagnosis V3 form renderer — sections driven entirely by V3 constants
 *
 * @module shared/forms/DiagnosisFormFields
 * @description 加题/删题/改选项只动 `shared/constants/diagnosis-v3.ts`，本文件不需要改。
 *              证书/资质不在表单收集：A1 只问目标市场，证书覆盖率与档案完整度由供应商表派生。
 */

import { useMemo } from "react";
import { ChipToggleGroup } from "@/shared/ui";
import {
  DIAGNOSIS_V3_DIMENSIONS,
  DIAGNOSIS_V3_FIELD_MAP,
  DIAGNOSIS_V3_FORM_FIELDS,
  DIAGNOSIS_V3_PARTS,
  isDiagnosisV3Required,
  type DiagnosisV3FieldDef,
} from "@/shared/constants/diagnosis-v3";
import { BID_GATE_RULES, evaluateBidGate } from "@/shared/constants/diagnosis-bid-gate";
import type { DiagnosisAnswers } from "@/shared/api/diagnosis";

type T = (key: string) => string;

/**
 * 决定「能不能进投标名单」的题目：从闸门规则反查，不在常量里二次声明。
 * 只取表单可判的题（cert_coverage 这类派生项由供应商档案算出，不在表单里问）。
 */
const HARD_GATE_FIELDS: readonly string[] = (() => {
  const keys: string[] = [];
  for (const rule of BID_GATE_RULES) {
    if (rule.level !== "disqualify") continue;
    if (DIAGNOSIS_V3_FIELD_MAP[rule.fieldKey]?.source !== "form") continue;
    if (!keys.includes(rule.fieldKey)) keys.push(rule.fieldKey);
  }
  return keys;
})();

const SOFT_GATE_FIELDS: readonly string[] = (() => {
  const keys: string[] = [];
  for (const rule of BID_GATE_RULES) {
    if (rule.level !== "conditional") continue;
    if (DIAGNOSIS_V3_FIELD_MAP[rule.fieldKey]?.source !== "form") continue;
    if (HARD_GATE_FIELDS.includes(rule.fieldKey)) continue;
    if (!keys.includes(rule.fieldKey)) keys.push(rule.fieldKey);
  }
  return keys;
})();

/** 题目分档：hard=废标项，soft=可补项，null=只影响评分 */
function gateLevelOf(fieldKey: string): "hard" | "soft" | null {
  if (HARD_GATE_FIELDS.includes(fieldKey)) return "hard";
  if (SOFT_GATE_FIELDS.includes(fieldKey)) return "soft";
  return null;
}

function hasAnswer(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return String(value ?? "").trim() !== "";
}

interface Props {
  answers: DiagnosisAnswers;
  t: T;
  onSingle: (key: string, value: string) => void;
  onToggleMulti: (key: string, value: string) => void;
  /** 目标市场字典（/api/markets）；不传则用常量默认 */
  marketOptions?: ReadonlyArray<{ code: string; label: string }>;
}

function OptionChips({
  field, selected, onPick, onToggle, t,
}: {
  field: DiagnosisV3FieldDef;
  selected: string | string[];
  onPick: (value: string) => void;
  onToggle: (value: string) => void;
  t: T;
}) {
  const items = (field.options ?? []).map((opt, i) => {
    const key = field.optionLabelKeys?.[i];
    const translated = key ? t(key) : "";
    // 优先数据源中文名（目标市场等码值），其次译文，最后退回选项码
    return { value: opt, label: field.optionLabels?.[i] || translated || opt };
  });
  if (field.kind === "multi") {
    return (
      <ChipToggleGroup
        items={items}
        selected={Array.isArray(selected) ? selected : []}
        onToggle={onToggle}
        multiple
      />
    );
  }
  return (
    <ChipToggleGroup
      items={items}
      selected={typeof selected === "string" && selected ? [selected] : []}
      onToggle={onPick}
      multiple={false}
    />
  );
}

function FieldBlock({ field, answers, t, onSingle, onToggleMulti }: Props & { field: DiagnosisV3FieldDef }) {
  const value = answers[field.key];
  const level = gateLevelOf(field.key);

  return (
    <div id={`diag-field-${field.key}`}>
      <label className="mb-2 flex flex-wrap items-center gap-1.5 text-sm font-bold text-slate-700" htmlFor={`diag-${field.key}`}>
        <span>
          {t(field.labelKey)}
          {isDiagnosisV3Required(field) && <span className="ml-0.5 text-rose-500">*</span>}
        </span>
        {/* 题目分档标注：让填表的人一眼看出哪几题决定「能不能投标」，哪几题只影响得分 */}
        {level === "hard" && (
          <span className="rounded bg-rose-50 px-1.5 py-0.5 text-2xs font-semibold text-rose-700">
            {t("bidGateBadgeHard")}
          </span>
        )}
        {level === "soft" && (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-2xs font-semibold text-amber-700">
            {t("bidGateBadgeSoft")}
          </span>
        )}
      </label>

      <OptionChips
        field={field}
        selected={(value as string | string[]) ?? (field.kind === "multi" ? [] : "")}
        onPick={(opt) => onSingle(field.key, opt)}
        onToggle={(opt) => onToggleMulti(field.key, opt)}
        t={t}
      />
    </div>
  );
}

/**
 * A 段实时闸门提示：填到哪儿就看到哪儿有没有废标项。
 * 用 partial 预判（多选为空、未作答都不判），避免一进页面就先摆一排红项。
 * 准入缺口要等服务端返回资质分级，这里只判表单可判的规则。
 */
function PartAGateBanner({ answers, t }: { answers: DiagnosisAnswers; t: T }) {
  const gate = useMemo(
    () => evaluateBidGate(answers, 0, {}, { partial: true }),
    [answers],
  );
  const answered = HARD_GATE_FIELDS.filter((key) => hasAnswer(answers[key])).length;
  const total = HARD_GATE_FIELDS.length;
  const hard = gate.disqualifiers.length;
  const soft = gate.conditionals.length;

  return (
    <div className="mt-2 space-y-1.5 rounded-lg bg-slate-50 px-2.5 py-2">
      <p className="text-2xs font-semibold text-slate-700">
        {t("bidGateLiveProgress")
          .replace("{answered}", String(answered))
          .replace("{total}", String(total))}
      </p>
      {hard === 0 && soft === 0 ? (
        <p className="text-2xs leading-relaxed text-emerald-700">{t("bidGateLiveClean")}</p>
      ) : (
        <>
          <p className="text-2xs font-semibold text-slate-600">
            {t("bidGateLiveTitle")
              .replace("{hard}", String(hard))
              .replace("{soft}", String(soft))}
          </p>
          {gate.disqualifiers.map((hit) => (
            <p key={hit.id} className="text-2xs leading-relaxed text-rose-700">
              · {t(hit.titleKey) || hit.titleZh}
            </p>
          ))}
          {hard === 0 && (
            <p className="text-2xs leading-relaxed text-slate-500">{t("bidGateLiveNoHard")}</p>
          )}
        </>
      )}
      {answered < total && (
        <p className="text-2xs leading-relaxed text-slate-500">{t("bidGateLiveIncomplete")}</p>
      )}
    </div>
  );
}

export function DiagnosisFormFields(props: Props) {
  const { answers, t } = props;

  return (
    <div className="space-y-6">
      {DIAGNOSIS_V3_PARTS.map((part) => {
        const dims = DIAGNOSIS_V3_DIMENSIONS.filter((d) => d.part === part.code);
        return (
          <section key={part.code} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">
                {part.code}
              </span>
              <h3 className="text-sm font-bold text-slate-800">{t(`diagV3Part${part.code}`)}</h3>
              <span className="text-xs text-slate-400">{part.weight} 分</span>
            </div>
            {part.code === "A" && (
              <>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{t("diagV3PartAHint")}</p>
                <PartAGateBanner answers={answers} t={t} />
              </>
            )}
            {part.code === "B" && (
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{t("diagV3PartBHint")}</p>
            )}
            {part.code === "C" && (
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{t("diagV3PartCHint")}</p>
            )}

            <div className="mt-4 space-y-5">
              {dims.map((dim) => {
                const fields = DIAGNOSIS_V3_FORM_FIELDS
                  .filter((f) => f.dimensionNo === dim.no)
                  .map((f) =>
                    // 目标市场以字典表为准（/api/markets）；空表时保留常量默认
                    f.key === "target_markets" && props.marketOptions?.length
                      ? {
                          ...f,
                          options: props.marketOptions.map((o) => o.code),
                          optionLabels: props.marketOptions.map((o) => o.label),
                          optionLabelKeys: undefined,
                        }
                      : f,
                  );
                return (
                  <section key={dim.no} className="rounded-lg border border-slate-100 bg-slate-50/60 p-4">
                    <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-2xs font-bold text-white">
                        {dim.no}
                      </span>
                      {t(`diagV3Dim${dim.no}`)}
                      <span className="text-xs font-normal text-slate-400">{dim.weight} 分</span>
                    </h4>
                    {fields.length === 0 ? (
                      <p className="text-xs leading-relaxed text-slate-500">{t("diagV3AutoRead")}</p>
                    ) : (
                      <div className="space-y-5">
                        {fields.map((field) => (
                          <FieldBlock key={field.key} {...props} field={field} answers={answers} t={t} />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
