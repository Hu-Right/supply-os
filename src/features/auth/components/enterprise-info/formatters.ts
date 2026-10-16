/**
 * 企业信息卡 — 值格式化纯函数（自 EnterpriseInfoCard.tsx 上收，行为逐字不变）。
 * 「禁止组件文件内定义可复用工具函数」条款落地。
 *
 * @module features/auth/components/enterprise-info/formatters
 */
import type { EnterpriseInfo } from "@/shared/hooks/useEnterpriseInfo";

/** 表格单元：label + value；full=true 时 value 通栏 */
export interface Cell {
  label: string;
  value: string;
  full?: boolean;
}

/** 取字符串值（空/undefined → "-"） */
export function sv(row: EnterpriseInfo, key: string): string {
  const v = row[key];
  if (v === null || v === undefined || v === "") return "-";
  return String(v);
}

/** 录入时间 addtime（epoch 秒）→ YYYY-MM-DD HH:mm */
export function fmtAddtime(row: EnterpriseInfo): string {
  const t = Number(row.addtime || 0);
  if (!t) return "-";
  const d = new Date(t * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 资料完整度 → 百分比 */
export function fmtScore(row: EnterpriseInfo): string {
  const s = row.data_quality_score;
  if (s === null || s === undefined || s === "") return "-";
  return `${s}%`;
}
