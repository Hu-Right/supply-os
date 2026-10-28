/**
 * 国家归一键的原始清洗（纯函数，从退役的静态字典 lib/data/countryNames 迁出）。
 * 归一 SSOT 唯一依赖此清洗；展示映射已改由 country_aliases 提供，本文件不再含任何名映射表。
 */

/**
 * 清理国家名原始值中的常见脏数据前缀 + 编码/括号/下划线归一。
 *
 * @description 数据库中存在 "/，Basilan"、"T&#252;rkiye"、"Korea (Rep.)" 等脏值，
 *              此函数在归一化之前调用。行为必须与历史一致（含 HTML 实体解码、
 *              括号转逗号、下划线转空格），否则归一键与建表 raw 口径会漂移。
 */
export function cleanCountryRaw(raw: string): string {
  let cleaned = raw.trim();
  // 剥离 "/"、"/，"、"/, " 等前缀（数据源格式错误）
  cleaned = cleaned.replace(/^[/]+\s*[，,]?\s*/, "");
  // 剥离前导标点（逗号、分号、冒号、竖线等）
  cleaned = cleaned.replace(/^[,;:|]+\s*/, "");
  // HTML 实体解码（&#NNN; 和 &#xHHH;），处理 "T&#252;rkiye" 等编码变体
  cleaned = cleaned.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
  cleaned = cleaned.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  // 括号转逗号："Korea (Democratic...)" → "Korea, Democratic..."
  cleaned = cleaned.replace(/\s*\(([^)]+)\)/g, ", $1");
  // 下划线转空格（国家名不含下划线，辅助机构名归一化）
  cleaned = cleaned.replace(/_/g, " ");
  return cleaned.trim();
}
