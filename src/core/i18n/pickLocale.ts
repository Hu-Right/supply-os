/**
 * 根据当前 locale 选择对应语言的值
 * Pick the corresponding language value based on current locale
 *
 * @param locale - 当前语言环境 ("zh" | "en")
 * @param zh - 中文值
 * @param en - 英文值
 * @returns 当前语言对应的值
 */
export function pickLocale<T>(locale: string, zh: T, en: T): T {
  return locale === "zh" ? zh : en;
}
