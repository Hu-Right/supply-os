/**
 * 公告摘要预览（纯函数）
 *
 * @module shared/utils/text-preview
 * @description 锁定态详情页只给一段公开 teaser：上游 SQL 已按 300 字截断，
 *              但硬截经常落在词/句中间，看起来像坏了。本函数把截断点收敛到
 *              「句末标点 > 空格 > 硬切」三级回退，并补省略号。
 *
 *              与 notice-public/display.pickDisplaySummary 的分工：
 *              - 服务端 pickDisplaySummary 决定「给哪一份」（中文优先）与「多长」（300）；
 *              - 本函数只决定「切在哪」，不改内容来源，可在客户端复用。
 */

export interface NoticeTeaserOptions {
  /** 最大长度（字符），默认 300；低于 40 会被抬到 40，避免切出无意义碎片 */
  limit?: number;
  /** 上游是否已标记「被截断」：true 时即使长度未超限也执行句末收敛 */
  truncated?: boolean;
  /** 省略号，默认中文省略号 */
  ellipsis?: string;
}

/** 句末标点：中英文都收，逗号/顿号不算（切在逗号上仍像半句） */
const SENTENCE_MARKS = ["。", "！", "？", "!", "?", "；", ";"];

/**
 * 在 head 内找最佳切点：优先最后一个句末标点（必须在 40% 之后，
 * 否则说明整段没有句号，退而求其次找空格），其次最后一个空格（60% 之后）。
 * 都找不到则硬切。
 */
function cutIndex(head: string): number {
  let sentence = -1;
  for (const mark of SENTENCE_MARKS) {
    const at = head.lastIndexOf(mark);
    if (at > sentence) sentence = at;
  }
  if (sentence >= Math.floor(head.length * 0.4)) return sentence + 1;

  const space = head.lastIndexOf(" ");
  if (space >= Math.floor(head.length * 0.6)) return space;

  return head.length;
}

/**
 * 生成公告摘要预览。
 *
 * @param text 原始文本（可含换行/多空格）
 * @param opts limit / truncated / ellipsis
 * @returns 归一空白并按要求截断的文本；空输入返回 ""
 */
export function buildNoticeTeaser(text: string, opts: NoticeTeaserOptions = {}): string {
  const src = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!src) return "";

  const limit = Math.max(40, opts.limit ?? 300);
  const needsCut = opts.truncated === true || src.length > limit;
  if (!needsCut) return src;

  const head = src.slice(0, limit);
  const cut = cutIndex(head);
  const body = head
    .slice(0, cut)
    .trim()
    .replace(/[，、,：:\s]+$/, "");
  return `${body}${opts.ellipsis ?? "…"}`;
}
