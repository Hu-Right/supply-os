/**
 * 采购预算币种与金额解析（F02）
 *
 * @module shared/constants/procurement-currencies
 * @description 币种只存 ISO 4217 代码，不做汇率换算；金额按所选币种的原始单位填写
 *              （元/美元/欧元…），不是“万”。前端校验与后端归一化共用本文件。
 */

/** 常用采购币种（ISO 4217）。顺序按使用频率，不代表的汇率或结算能力。 */
export const PROCUREMENT_CURRENCIES = [
  "CNY",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "HKD",
  "SGD",
  "AUD",
  "CAD",
  "CHF",
  "AED",
  "SAR",
  "QAR",
  "KES",
  "NGN",
  "ZAR",
  "EGP",
  "INR",
  "BRL",
  "MXN",
  "RUB",
  "TRY",
  "IDR",
  "MYR",
  "THB",
  "VND",
  "PHP",
] as const;

export type ProcurementCurrency = (typeof PROCUREMENT_CURRENCIES)[number];

/**
 * 解析预算金额：允许千分位逗号与空格，空串返回 null。
 * 非法（非数字/负数/Infinity）返回 null，由调用方决定报错还是忽略。
 */
export function parseBudgetAmount(raw: string | null | undefined): number | null {
  const cleaned = String(raw ?? "").replace(/[,，\s]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}
