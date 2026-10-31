/**
 * 买家实体归一键（唯一实现）
 *
 * @module lib/services/buyer/normalize
 * @description 机构/买家名在「原始写法 → buyer_alias 命中」这一步的归一字符串：
 *              `NFKC → 控制字符/换行压成空格 → 连续空白折叠 → trim → 大写`。
 *
 *              为什么不能只 `trim+toUpperCase`（旧 normalizeAliasKey）：
 *              真实源数据里同一家机构会出现全角/半角（NFKC 差异）、内嵌换行/双空格、
 *              零宽字符等变体；只 trim+大写会让这些变体各自占一个别名键，
 *              表现为「同一机构匹配不上实体」或「同一别名重复登记」。
 *
 *              为什么不做去重音/去标点：机构专名里重音与标点本身是身份的一部分
 *              （"Fundação" vs "Fundacao" 不是任意可合并的），宁可漏合不能错合；
 *              跨写法合并靠 buyer_alias 登记，不靠字符串激进归一。
 */

/** 买家/机构归一键：空白与控制字符归一后大写。空值返回空串。 */
export function normalizeBuyerKey(raw: unknown): string {
  return String(raw ?? "")
    .normalize("NFKC")
    // eslint-disable-next-line no-control-regex -- 刻意匹配控制字符/换行等不可见噪声：它们是爬虫脏名的常见形态
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}
