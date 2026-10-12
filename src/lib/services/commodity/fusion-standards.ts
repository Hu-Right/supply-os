/**
 * 融合树 · 四家标准码制内核（纯函数，零依赖、零查库、零现网）
 * Fusion Standards — per-source code hierarchy
 *
 * @module lib/services/commodity/fusion-standards
 * @description 把 UNSPSC / HS / CPC / eCl@ss 四家"码长即层级 + 前缀即父子"的官方切分规则编码下来，
 *              使融合树 FU4「单调归属」从"靠承诺"升级为"机器可判"：给定父/子在其主轴标准里的码，
 *              `isAxisAncestor` 可离线判定"子是否确为父的真后代"——这是把人工挂载收敛到"只裁语义"的关键。
 *              ⚠ 本模块只做"结构维度"判定，不判语义（名字/概念是否贴切仍须人审），且绝不读写生产库。
 * @码制速记
 *   UNSPSC 8 位、每 2 位一层（段/族/类/商品），低位补 0 表示未到该层；有效层组非 00。
 *   HS     6 位、每 2 位一层（章 2 / 品目 4 / 子目 6），码即实际数字，无补位歧义。
 *   CPC    1~5 位、逐位一层（节/分/组/级/细）。
 *   eCl@ss 8 位、每 2 位四层（大组/组/类/属性组）。
 */

export type StdKey = "unspsc" | "hs" | "cpc" | "eclss";

/** 归一化结果：sig=去补位后的有效数字串；level=层级（0=非法） */
export interface StdCodeInfo {
  sig: string;
  level: number;
}

/** 仅留数字；非数字串（含空）返回 ""，调用方据此判非法 */
function digitsOf(code: unknown): string {
  return typeof code === "string" ? code.replace(/[^0-9]/g, "") : "";
}

/** 把数字串按 2 位分组、去掉尾部 "00" 组，得有效前缀（UNSPSC 用） */
function trimTrailingZeroPairs(d8: string): string {
  let s = d8;
  while (s.length >= 2 && s.endsWith("00")) s = s.slice(0, -2);
  return s;
}

/** UNSPSC：sig 各 2 位组须在 01~99（无 00 组）；否则视为非法/补位 */
function unspscValidSig(sig: string): boolean {
  if (!sig || sig.length % 2 !== 0 || sig.length > 8) return false;
  for (let i = 0; i < sig.length; i += 2) {
    if (sig.slice(i, i + 2) === "00") return false;
  }
  return true;
}

const WIDTH_BY_STD: Record<Exclude<StdKey, "cpc">, 2> = { unspsc: 2, hs: 2, eclss: 2 };

/**
 * 归一 + 定层：按标准把码转为 `{sig, level}`。level=0 表示该码在此标准下非法。
 * 注意：对 UNSPSC，`sig` 是"去尾部补位"后的有效码（如段 `10` 而非 `10000000`）。
 */
export function normalizeStdCode(std: StdKey, code: unknown): StdCodeInfo {
  const d = digitsOf(code);
  if (!d) return { sig: "", level: 0 };
  switch (std) {
    case "unspsc": {
      if (d.length > 8 || d.length % 2 !== 0) return { sig: "", level: 0 };
      const padded = d.padEnd(8, "0");
      const sig = trimTrailingZeroPairs(padded);
      if (!unspscValidSig(sig)) return { sig: "", level: 0 };
      return { sig, level: sig.length / 2 }; // 段1 族2 类3 商品4
    }
    case "hs": {
      if (d.length > 6 || d.length % 2 !== 0) return { sig: "", level: 0 };
      return { sig: d, level: d.length / 2 }; // 章1 品目2 子目3
    }
    case "eclss": {
      if (d.length > 8 || d.length % 2 !== 0) return { sig: "", level: 0 };
      return { sig: d, level: d.length / 2 }; // 大组1 组2 类3 属性组4
    }
    case "cpc": {
      if (d.length > 5) return { sig: "", level: 0 };
      return { sig: d, level: d.length }; // 1~5 位逐层
    }
    default:
      return { sig: "", level: 0 };
  }
}

/** 该标准码是否合法（层级 ≥1） */
export function isValidStdCode(std: StdKey, code: unknown): boolean {
  return normalizeStdCode(std, code).level > 0;
}

/** 该标准码的层级；非法返回 0 */
export function stdLevel(std: StdKey, code: unknown): number {
  return normalizeStdCode(std, code).level;
}

/**
 * 父码 = 去掉末一层（每层的"位宽"：UNSPSC/HS/eCl@ss 为 2，CPC 为 1）。
 * 返回去补位后的有效父码；已在顶层或非法则返回 ""。
 */
export function stdParentCode(std: StdKey, code: unknown): string {
  const { sig, level } = normalizeStdCode(std, code);
  if (level <= 1) return "";
  const width = std === "cpc" ? 1 : WIDTH_BY_STD[std as Exclude<StdKey, "cpc">];
  return sig.slice(0, sig.length - width);
}

/**
 * ★ FU4 机检核心：在同标准下，`a` 是否为 `b` 的真祖先（a 的严格前缀 = b，且 a≠b）。
 * 用去补位后的有效码比较：`b.sig` 以 `a.sig` 开头，且多出的部分是"整层"（长度为位宽整数倍、>0）。
 * 任一非法 → false（跨标准不可比、脏码不猜，交人工判）。
 */
export function isAxisAncestor(std: StdKey, a: unknown, b: unknown): boolean {
  const A = normalizeStdCode(std, a);
  const B = normalizeStdCode(std, b);
  if (A.level === 0 || B.level === 0) return false;
  if (A.level >= B.level) return false; // 必须严格更高一层才算祖先
  if (!B.sig.startsWith(A.sig)) return false;
  const width = std === "cpc" ? 1 : WIDTH_BY_STD[std as Exclude<StdKey, "cpc">];
  return (B.sig.length - A.sig.length) % width === 0;
}

/** 该标准最大层数（供建树分层/校验） */
export const STD_MAX_LEVEL: Record<StdKey, number> = { unspsc: 4, hs: 3, eclss: 4, cpc: 5 };

/** 支持的四个标准键（供门禁/工具枚举） */
export const FUSION_STDS: readonly StdKey[] = ["unspsc", "hs", "cpc", "eclss"];
