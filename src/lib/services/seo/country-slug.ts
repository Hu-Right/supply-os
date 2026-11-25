/**
 * 国别 URL 取值 —— 纯函数 + 静态映射（不触库）
 *
 * @module lib/services/seo/country-slug
 * @description 统一决定 `/procurement?country=` 后面写什么，以及
 *              `/procurement/country/{slug}` → 该 URL 的映射。
 *
 *              **取值用归一后的国家码（ISO2），不用国名**：
 *              - 码是语言中立的：中文站显示「德国」，URL 仍是 `?country=DE`；
 *              - 无重音/空格编码问题（Côte d'Ivoire 之类）；
 *              - 站内所有国别链接与 canonical 逐字一致，不再出现
 *                「链接写 ?country=法国、canonical 写 ?country=Germany」的变体。
 *
 *              例外：`country_aliases` 里 PS / CD 两个码**尚未登记**
 *              （实测 211 个两字母码，缺这两个，检索侧传码返回 0 条、传名字正常）。
 *              这两个国家暂时回退用标准名，等别名表补齐后删掉 CODE_PARAM_OVERRIDES 即可。
 *
 *              为什么需要静态表：`/procurement/country/{slug}` 已下线为 308 跳转，
 *              跳转必须在 proxy 里、渲染前发出（页面里调 permanentRedirect 在流式响应下
 *              只插客户端 meta 标签，百度蜘蛛不执行）。proxy 查库会撞冷连接超时，
 *              所以优先用静态表；仅当未命中才回落 DB 清单。
 */
import { COUNTRY_CODES, countryName, guessCountryCode } from "@/shared/constants/countries";

/**
 * 名称 → URL slug（去重音、小写、非字母数字折成连字符）。
 * 纯非拉丁名称（无可用 slug）由调用方跳过，不生成 encodeURIComponent 级别的脏 URL。
 */
export function landingSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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

/**
 * slug → `?country=` 取值（进程内构建一次）。
 *
 * 键的来源是「Intl 英文名的 slug」——即历史落地页 URL 的 slug 规则；值是统一后的国家码。
 * Intl 名与库名不一致的四个国家（Türkiye→Turkey、Congo-Kinshasa→Congo, DR、
 * Palestinian Territories→Palestine、Bosnia & Herzegovina→Bosnia and Herzegovina）
 * 由 SLUG_ALIASES 把这些历史 slug 显式指到同一个码，避免老 URL 404。
 */
const SLUG_ALIASES: Readonly<Record<string, string>> = {
  "bosnia-and-herzegovina": "BA",
  turkey: "TR",
  palestine: "PS",
  "congo-democratic-republic-of-the": "CD",
};

let slugParamCache: Map<string, string> | null = null;

/** slug → `?country=` 取值 */
export function countrySlugParamMap(): Map<string, string> {
  if (slugParamCache) return slugParamCache;
  const map = new Map<string, string>();
  for (const code of COUNTRY_CODES) {
    const name = countryName(code, "en");
    if (name) map.set(landingSlug(name), countryParam(code));
  }
  for (const [slug, code] of Object.entries(SLUG_ALIASES)) map.set(slug, countryParam(code));
  slugParamCache = map;
  return map;
}

/** 标准名（任意写法/别名）→ `?country=` 取值；解析不出国家返回 null */
export function countryParamOfName(name: string): string | null {
  const code = guessCountryCode(name);
  return code ? countryParam(code) : null;
}
