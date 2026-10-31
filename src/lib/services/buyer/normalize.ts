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

// ── 中文规范名（buyer.name_zh）纯度口径（2026-10-31 用户拍板：中文名就是纯中文）──────
// 产品口径：机构展示中文名必须是纯中文——只允许汉字、数字与中文标点；
// 不允许任何外文字母/外文单词（拉丁、西里尔、希腊、阿拉伯、假名、谚文等），
// 也不允许“中文（Eskom）”这类带英文缩写的混排。来源缩写/品牌应在翻译时
// 展开为中文全称或音译，而不是留原文。

/** 汉字（含扩展 A） */
const HAN_RE = /[\u3400-\u4dbf\u4e00-\u9fff]/;
/** 非中文文字：拉丁字母及其变体、西里尔、希腊、希伯来、阿拉伯、天城文、泰文、假名、谚文等 */
const FOREIGN_SCRIPT_RE =
  /[A-Za-z\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff\u0590-\u05ff\u0600-\u06ff\u0900-\u097f\u0e00-\u0e7f\u3040-\u30ff\u31f0-\u31ff\uac00-\ud7af\uf900-\ufaff]/;
/** 同上集合的全局形态（stripForeignSegments 用） */
const FOREIGN_SCRIPT_RE_GLOBAL =
  /[A-Za-z\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff\u0590-\u05ff\u0600-\u06ff\u0900-\u097f\u0e00-\u0e7f\u3040-\u30ff\u31f0-\u31ff\uac00-\ud7af\uf900-\ufaff]+/g;
/** 允许字符集：汉字 + 数字 + 中文标点（含常见全/半角括号与分隔符） */
const ALLOWED_NAME_RE = /^[\u3400-\u4dbf\u4e00-\u9fff0-9（）()“”‘’「」『』《》〈〉·\-—－、，。；：,.:\s]+$/;

/**
 * 是否纯中文机构名：有汉字、无任何外文字母、且只含允许字符。
 * 用于清洗验收与台账门禁（`name_zh` 唯一口径）。
 */
export function isPureChineseBuyerName(raw: unknown): boolean {
  const s = String(raw ?? "").normalize("NFKC").trim();
  if (!s || !HAN_RE.test(s)) return false;
  if (FOREIGN_SCRIPT_RE.test(s)) return false;
  return ALLOWED_NAME_RE.test(s);
}

/**
 * 确定性降级清洗：把混排中文名里残留的外文片段剥掉，只留中文/数字。
 *
 * 仅用于「LLM 翻译失败/输出仍含外文」的兜底，优先删除整段外文（尤其括号内缩写），
 * 因此可能损失品牌信息但保证可展示、纯中文；结果会进人工复核清单。
 */
export function stripForeignSegments(raw: unknown): string {
  let s = String(raw ?? "").normalize("NFKC");
  // 1) 删除含外文字母的括号段（中英文括号，循环处理连续/嵌套）
  for (let i = 0; i < 6; i += 1) {
    const next = s.replace(/[（(][^（）()]*[A-Za-z\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff\u0590-\u05ff\u0600-\u06ff\u0900-\u097f\u0e00-\u0e7f\u3040-\u30ff\u31f0-\u31ff\uac00-\ud7af\uf900-\ufaff][^（）()]*[）)]/g, "");
    if (next === s) break;
    s = next;
  }
  // 2) 删除括号外的外文字母串
  s = s.replace(FOREIGN_SCRIPT_RE_GLOBAL, " ");
  // 3) 兜底输出不再需要括号分组：剩余括号内已是中文/数字，直接拆掉括号
  s = s.replace(/[（）()]/g, " ");
  // 4) 空白与标点清理：去多余空白、去首尾分隔符、半角标点转全角
  s = s
    .replace(/\s+/g, " ")
    .replace(/\s*([、，。；：·\-—－])\s*/g, "$1")
    .replace(/[,]/g, "，")
    .replace(/[;]/g, "；")
    .replace(/[:]/g, "：")
    .replace(/^[、，。；：\s\-—－]+|[、，。；：\s\-—－]+$/g, "")
    .trim()
    .replace(/\s+/g, "");
  // 5) 删除紧邻的重复中文短语（翻译残迹，如“机场安全部队机场安全部队”）
  for (let i = 0; i < 3; i += 1) {
    const next = s.replace(/([\u3400-\u4dbf\u4e00-\u9fff]{2,20})\1+/g, "$1");
    if (next === s) break;
    s = next;
  }
  // 6) 兜底结果过短/过于通用时不落库（交人工复核），避免制造"采购方/机构"这类假名
  if (s.length < 4) return "";
  return HAN_RE.test(s) ? s : "";
}

/**
 * 是否“只剩通用词”的假名（如「有限公司」「采购集团」「机构」）：
 * 这类名字虽纯中文但没有身份信息，不能作为规范名落库。
 * 仅用于清洗验收（规则兜底/LLM 输出过滤），不影响实体匹配。
 */
const GENERIC_NAME_RE =
  /^(?:(?:有限|股份|责任|集团|控股|实业|科技|贸易|工程|建设|发展|管理|服务|咨询|投资|置业|医疗|教育|文化|旅游|能源|电力|水利|交通|农业|林业|环保|采购|招标|供应)?(?:公司|集团|机构|项目|中心|办公室|管理处|管理局|委员会|部门|部|局|厅|署|学校|学院|大学|医院|银行|基金会|研究所|研究院|合作社|协会|联合会|联盟|平台|站|所))+$/;

/** 纯中文但只剩通用词（无机构身份） → true */
export function isTooGenericBuyerName(raw: unknown): boolean {
  const s = String(raw ?? "").normalize("NFKC").replace(/\s+/g, "").trim();
  if (!s) return false;
  return GENERIC_NAME_RE.test(s);
}

