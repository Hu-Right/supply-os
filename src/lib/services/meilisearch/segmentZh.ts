/**
 * 中文分词预处理（Meilisearch 索引专用）
 * Chinese word segmentation for Meilisearch indexing
 *
 * @module server/services/meilisearch/segmentZh
 * @description Meilisearch 不内置中文分词器，默认将每个汉字视为独立 token，
 *              导致多词搜索时 proximity 规则过度惩罚、召回率严重下降。
 *              本模块在同步前使用 jieba 将中文文本切分为词语并以空格拼接，
 *              Meilisearch 即可按词 token 精确匹配。
 *              仅对含中文字符的文本生效；纯英文/数字文本原样返回。
 */
// ── 中文字符检测 ──
const HAS_CHINESE = /[\u4e00-\u9fff\u3400-\u4dbf]/;

// ── 动态加载 jieba（原生模块缺失时降级为不分词） ──
type JiebaInstance = { cut: (text: string) => string[] };
let jiebaInstance: JiebaInstance | null = null;
let jiebaLoadAttempted = false;

async function loadJieba(): Promise<JiebaInstance | null> {
  if (jiebaLoadAttempted) return jiebaInstance;
  jiebaLoadAttempted = true;
  try {
    const { Jieba } = await import("@node-rs/jieba");
    const { dict } = await import("@node-rs/jieba/dict");
    jiebaInstance = Jieba.withDict(dict) as JiebaInstance;
    return jiebaInstance;
  } catch {
    console.warn("[segmentZh] @node-rs/jieba 原生模块不可用，中文分词已降级为原文返回");
    return null;
  }
}

// 启动时尝试加载（不阻塞服务启动）；
// 导出 ready promise 供调用方/测试等待初始化完成（首次同步调用前 jieba 尚未就绪时会降级为原文）
export const jiebaReady: Promise<JiebaInstance | null> = loadJieba();
void jiebaReady;

/**
 * 对中文文本执行 jieba 分词，返回空格分隔的词语字符串。
 * 纯英文/数字文本不做处理，原样返回。
 *
 * @example
 * segmentZh("联合国采购公告") // → "联合国 采购 公告"
 * segmentZh("Medical supplies") // → "Medical supplies"  (不处理)
 */
export function segmentZh(text: string): string {
  if (!text) return "";
  if (!HAS_CHINESE.test(text)) return text;
  if (!jiebaInstance) return text; // jieba 未加载，降级为原文
  try {
    return jiebaInstance.cut(text).join(" ");
  } catch {
    // jieba 失败时降级为原文（不影响主流程）
    return text;
  }
}

/**
 * 批量分词：对数组中的每个文本执行分词。
 * 用于同步批次处理多个字段，减少函数调用开销。
 */
export function segmentZhBatch(texts: string[]): string[] {
  return texts.map((t) => segmentZh(t));
}
