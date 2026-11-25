/**
 * 国别 URL 取值 —— 纯函数（不触库）
 *
 * @module lib/services/seo/country-slug
 * @description 统一决定 `/procurement?country=` 后面写什么。
 *
 *              **取值用归一后的国家码（ISO2），不用国名**：
 *              - 码是语言中立的：中文站显示「德国」，URL 仍是 `?country=DE`；
 *              - 无重音/空格编码问题（Côte d'Ivoire 之类）；
 *              - 站内所有国别链接与 canonical 逐字一致，不再出现
 *                「链接写 ?country=法国、canonical 写 ?country=Germany」的变体。
 *
 *              例外：`country_aliases` 里 PS / CD 两个码**尚未登记**，
 *              检索侧传码返回 0 条、传名字正常，故暂时回退标准名。
 *              别名表补齐后删掉 CODE_PARAM_OVERRIDES 即可。
 *
 *              [2026-11-25 删除] 旧的 `/procurement/country/{slug}` 落地页整套映射
 *              （landingSlug / SLUG_ALIASES / countrySlugParamMap）随路由下线一并移除，
 *              不再为老 URL 做 slug→国家码的兼容跳转。
 */
import { guessCountryCode } from "@/shared/constants/countries";

/**
 * 码 → URL 取值 的例外表：这两个国家暂时只能传标准名。
 *
 * 2026-11-25 已在 `country_aliases` 补上 PS / CD 两个两字母别名，别名解析本身通了
 * （快照里 `PS → Palestine/PS`），但**检索结果对不上**：传码 `?country=PS` 只返回 1 条、
 * 传名 `?country=Palestine` 返回 19 条；`?country=CD` 返回 0 条、传名返回 21 条。
 * 说明检索索引里这两国的 country 字段与别名表的码不一致（属索引数据问题，
 * 与 URL 口径无关）。在索引对齐前，这两个国家继续用标准名，避免国别页变成空页。
 *
 * 索引修好后，把本表清空即可全网统一为码。
 */
const CODE_PARAM_OVERRIDES: Readonly<Record<string, string>> = {
  PS: "Palestine",
  CD: "Congo, Democratic Republic of the",
};

/** 国家码 → `?country=` 的取值（默认就是码本身） */
export function countryParam(code: string): string {
  return CODE_PARAM_OVERRIDES[code] ?? code;
}

/** 标准名（任意写法/别名）→ `?country=` 取值；解析不出国家返回 null */
export function countryParamOfName(name: string): string | null {
  const code = guessCountryCode(name);
  return code ? countryParam(code) : null;
}
