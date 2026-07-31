import { useLocale } from "@/core/i18n";
import type { UnspscOption } from "../types";
import { getUnspscOptionLabel } from "@/core/unspsc";

interface UnspcsSelectorProps {
  levels: UnspscOption[][];
  selectedIds: string[];
  onChange: (levelIndex: number, value: string) => void;
}

export function UnspcsSelector({ levels, selectedIds, onChange }: UnspcsSelectorProps) {
  const { t, locale } = useLocale();

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
      {[0, 1, 2, 3, 4].map((level) => (
        <select
          key={level}
          value={selectedIds[level]}
          onChange={(e) => onChange(level, e.target.value)}
          disabled={level > 0 && levels[level].length === 0}
          className="px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm disabled:opacity-60 focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          <option value="">
            {level + 1}
            {t("procurement_level")}
          </option>
          {levels[level].map((item) => (
            <option key={item.id} value={item.id}>
              {getUnspscOptionLabel(item, locale)}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}
