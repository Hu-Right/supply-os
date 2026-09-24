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
  type DiagnosisFieldDef,
} from "@/shared/constants/diagnosis-dimensions";
import type { DiagnosisAnswers } from "@/shared/api/diagnosis";

type T = (key: string) => string;

interface Props {
  answers: DiagnosisAnswers;
  /** 未作答的单选题 key 集合，用于把"必答题"标红 */
  missing: string[];
  t: T;
  onSingle: (key: string, value: string) => void;
  onToggleMulti: (key: string, value: string) => void;
}

function OptionChips({
  field, selected, onPick, onToggle,
}: {
  field: DiagnosisFieldDef;
  selected: string | string[];
  onPick: (value: string) => void;
  onToggle: (value: string) => void;
}) {
  const items = (field.options ?? []).map((opt) => ({ value: opt, label: opt }));
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

function FieldBlock({ field, answers, missing, t, onSingle, onToggleMulti }: Props & { field: DiagnosisFieldDef }) {
  const value = answers[field.key];
  const showMissing = missing.includes(field.key);

  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-slate-700" htmlFor={`diag-${field.key}`}>
        {t(field.labelKey)}
        <span className="ml-0.5 text-rose-500">*</span>
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
        />
      )}

      {showMissing && <p className="mt-1 text-2xs text-rose-500">{t("diagErrFieldRequired")}</p>}
    </div>
  );
}

export function DiagnosisFormFields(props: Props) {
  const { answers, missing, t } = props;

  return (
    <div className="space-y-6">
      {/* D1 无题：由主数据派生，向用户解释"为什么这里没有题"以及怎么提高它 */}
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-bold text-slate-700">
          {t("diagDim1")} · <span className="text-slate-500">{t("diagAutoScored")}</span>
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{t("diagDim1Hint")}</p>
      </section>

      {DIAGNOSIS_DIMENSIONS.filter((d) => d.fields.length > 0).map((dim) => (
        <section key={dim.no} className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-4 text-sm font-bold text-slate-800">
            <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-2xs font-bold text-white">
              {dim.no}
            </span>
            {t(`diagDim${dim.no}`)}
            <span className="ml-2 text-2xs font-normal text-slate-400">{t("diagWeightTag")} {dim.weight}</span>
          </h3>
          <div className="space-y-5">
            {DIAGNOSIS_FIELDS.filter((f) => f.dimensionNo === dim.no).map((field) => (
              <FieldBlock key={field.key} {...props} field={field} answers={answers} missing={missing} t={t} />
            ))}
          </div>
        </section>
      ))}

      {/* 意向标记：不计分，放在最后 */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="space-y-5">
          {DIAGNOSIS_FIELDS.filter((f) => f.dimensionNo === 0).map((field) => (
            <FieldBlock key={field.key} {...props} field={field} answers={answers} missing={missing} t={t} />
          ))}
        </div>
        <p className="mt-2 text-2xs text-slate-400">{t("diagWillingnessNotScored")}</p>
      </section>
    </div>
  );
}

/** 供结果页复用：从常量取标签，避免前端重复维护一份维度名映射 */
export function DimensionName({ no, t }: { no: number; t: T }) {
  const dim = DIAGNOSIS_DIMENSIONS.find((d) => d.no === no);
  return <>{dim ? t(`diagDim${dim.no}`) : ""}</>;
}
