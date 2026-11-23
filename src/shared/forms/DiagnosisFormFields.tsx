/**
 * 诊断 v2 表单渲染器（10 维度分节，题目全部来自常量）
 * Diagnosis (v2) form renderer — sections driven entirely by DIAGNOSIS_* constants
 *
 * @module shared/forms/DiagnosisFormFields
 * @description 加题/删题/改选项只动 `shared/constants/diagnosis-dimensions.ts`，本文件不需要改。
 *              选项文本**刻意不做翻译**：选项值就是入库值（与后台统计、报表同口径），
 *              翻译后会破坏"显示值 == 存储值"的不变式；而这些术语（FOB/CIF、UNGM Level、
 *              ISO 体系证书）在国际公采语境本就是固定表述。题面与维度名走 i18n。
 */
import { ChipToggleGroup, Textarea } from "@/shared/ui";
import {
  DIAGNOSIS_DIMENSIONS,
  DIAGNOSIS_FIELDS,
  DIAGNOSIS_QUAL_FIELDS,
  type DiagnosisFieldDef,
} from "@/shared/constants/diagnosis-dimensions";
import type { DiagnosisAnswers } from "@/shared/api/diagnosis";

type T = (key: string) => string;

interface Props {
  answers: DiagnosisAnswers;
  t: T;
  onSingle: (key: string, value: string) => void;
  onToggleMulti: (key: string, value: string) => void;
}

function OptionChips({
  field, selected, onPick, onToggle, t,
}: {
  field: DiagnosisFieldDef;
  selected: string | string[];
  onPick: (value: string) => void;
  onToggle: (value: string) => void;
  t: T;
}) {
  // 入库值仍是选项原文；只有显式声明了 optionLabelKeys 的字段（目标市场这类码值）
  // 才把显示名换成本地化文案——「显示值 == 存储值」的不变式对 V2 全部题目继续成立。
  const items = (field.options ?? []).map((opt, i) => ({
    value: opt,
    label: field.optionLabelKeys?.[i] ? t(field.optionLabelKeys[i]) : opt,
  }));
  // 单选与多选共用同一个项目内正解控件（ADR-0005），不再手搭 chip
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

function FieldBlock({ field, answers, t, onSingle, onToggleMulti }: Props & { field: DiagnosisFieldDef }) {
  const value = answers[field.key];

  return (
    // 每道题一个锚点：提交被拦时滚动定位到第一道未答题（不再有红框，锚点必须落在整块上，
    // 单选/多选没有原生 input，过去按 `diag-<key>` 找元素是找不到的）
    <div id={`diag-field-${field.key}`}>
      <label className="mb-2 block text-sm font-bold text-slate-700" htmlFor={`diag-${field.key}`}>
        {t(field.labelKey)}
        {field.kind === "single" && <span className="ml-0.5 text-rose-500">*</span>}
      </label>

      {field.kind === "text" ? (
        <Textarea
          id={`diag-${field.key}`}
          rows={2}
          value={String(value ?? "")}
          placeholder={t(field.labelKey + "Ph")}
          onChange={(e) => onSingle(field.key, e.target.value)}
          className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
        />
      ) : (
        <OptionChips
          field={field}
          selected={(value as string | string[]) ?? (field.kind === "multi" ? [] : "")}
          onPick={(opt) => onSingle(field.key, opt)}
          onToggle={(opt) => onToggleMulti(field.key, opt)}
          t={t}
        />
      )}
    </div>
  );
}

export function DiagnosisFormFields(props: Props) {
  const { answers, t } = props;

  return (
    <div className="space-y-6">
      {/* 第 0 步 · 投标范围：目标市场决定报告比对哪套市场准入要求，必须排在所有能力题之前
          （旧版把它挂在 D10 之后，读起来像"附加题"，因果也反了：先答 18 题才问投哪儿） */}
      <section className="rounded-xl border border-teal-200 bg-teal-50/40 p-4">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-800">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-2xs font-bold text-white">
            0
          </span>
          {t("diagSectionQualification")}
        </h3>
        <p className="text-xs leading-relaxed text-slate-500">{t("diagTargetMarketsHint")}</p>
        <div className="mt-4 space-y-5">
          {DIAGNOSIS_QUAL_FIELDS.map((field) => (
            <FieldBlock key={field.key} {...props} field={field} answers={answers} t={t} />
          ))}
        </div>
      </section>

      {/* D1：档案完整度由系统派生，另加一题出口主体资质 */}
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-bold text-slate-700">
          {t("diagDim1")} · <span className="text-slate-500">{t("diagAutoScored")}</span>
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{t("diagDim1Hint")}</p>
        <div className="mt-4 space-y-5">
          {DIAGNOSIS_FIELDS.filter((f) => f.dimensionNo === 1 && f.askInForm !== false).map((field) => (
            <FieldBlock key={field.key} {...props} field={field} answers={answers} t={t} />
          ))}
        </div>
      </section>

      {DIAGNOSIS_DIMENSIONS.filter((d) => d.no !== 1 && d.fields.length > 0).map((dim) => (
        <section key={dim.no} className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-4 text-sm font-bold text-slate-800">
            <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-2xs font-bold text-white">
              {dim.no}
            </span>
            {t(`diagDim${dim.no}`)}
          </h3>
          <div className="space-y-5">
            {DIAGNOSIS_FIELDS.filter((f) => f.dimensionNo === dim.no && f.askInForm !== false).map((field) => (
              <FieldBlock key={field.key} {...props} field={field} answers={answers} t={t} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** 供结果页复用：从常量取标签，避免前端重复维护一份维度名映射 */
export function DimensionName({ no, t }: { no: number; t: T }) {
  const dim = DIAGNOSIS_DIMENSIONS.find((d) => d.no === no);
  return <>{dim ? t(`diagDim${dim.no}`) : ""}</>;
}
