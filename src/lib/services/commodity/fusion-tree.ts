/**
 * 融合树 · 纯建树引擎（零依赖、零查库、零现网）
 * Fusion Tree Builder — edge validation & integrity scan
 *
 * @module lib/services/commodity/fusion-tree
 * @description 把"每一条父子边"的三类判定合成一个可离线复用的内核：
 *   ① 结构（FU1）：码形制、码长即层级、父码=去末3位、层级连续、大类归属不漂移（子 group=父 group）。
 *   ② 单调归属（FU4·同标准）：子 axis_code 必须是父 axis_code 在该标准下的真后代 → 机器可判，违则 fatal。
 *   ③ 跨标准（FU4·异标准）：机器不可判"牛头不对马嘴" → 不自动放行也不硬拒，一律路由 human（人审/crosswalk 证明）。
 *   这是"绝对精准 + 人工挂载"的机检底座：工具与门禁据此把"能机检的全机检、判不了的一律交人"。
 * @note 绝不写库、绝不做语义猜测；调用方据 fatal/human 决定拒绝或送审。
 */
import { isFusionNode, fusionNodeLevel } from "./fusion-path";
import { isAxisAncestor, type StdKey } from "./fusion-standards";

/** 融合节点行（与影子表列同名，供工具/门禁复用同一形制） */
export interface FusionRow {
  code: string;
  parent_code: string;
  level: number;
  group_code: string;
  axis_std: StdKey;
  axis_code: string;
  name_zh?: string;
  name_en?: string;
}

/** 边校验结果：fatal=硬失败（拒绝），human=需人工/跨标准证明（送审，不自动放行） */
export interface EdgeVerdict {
  fatal: string[];
  human: string[];
}

/** 大类码长度（UGT-4 字符 + 3 位 = 7）；>7 则有父 */
export function expectedParentCode(code: string): string {
  if (!isFusionNode(code)) return "";
  return code.length <= 7 ? "" : code.slice(0, code.length - 3);
}

/**
 * 校验单条父子边。parent 传 null 表示"父不随行/未入库"（如只给一个子），
 * 此时结构能判的判，单调归属送 human（无法离线比）。
 */
export function validateFusionEdge(child: FusionRow, parent: FusionRow | null): EdgeVerdict {
  const fatal: string[] = [];
  const human: string[] = [];

  if (!isFusionNode(child.code)) {
    return { fatal: [`码形制非法：${child.code}`], human };
  }
  const lvl = fusionNodeLevel(child.code);
  if (lvl !== child.level) fatal.push(`层级与码长不符：${child.code} 应为 L${lvl}，实为 L${child.level}`);

  const pc = child.parent_code ?? "";
  const exp = expectedParentCode(child.code);

  if (lvl === 1) {
    if (pc !== "") fatal.push(`大类行 parent 应为空串：${child.code} 实为 "${pc}"`);
    if (!child.group_code) fatal.push(`大类行 group_code（旧大类归属）为空：${child.code}`);
  } else {
    if (pc !== exp) fatal.push(`父码≠去末3位：${child.code} 期望 ${exp || "(空)"} 实为 ${pc || "(空)"}`);
    if (!parent) human.push(`父 ${exp} 未随行：单调归属无法离线校验，交人工/crosswalk`);
  }

  if (parent) {
    if (parent.code !== pc) fatal.push(`parent 对象与 parent_code 不符：${pc} vs ${parent.code}`);
    if (parent.level + 1 !== child.level) fatal.push(`层级不连续：父 L${parent.level} 子 L${child.level}`);
    if (child.group_code !== parent.group_code)
      fatal.push(`大类归属漂移：子 group ${child.group_code} ≠ 父 group ${parent.group_code}`);
    // FU4 单调：同标准机检，跨标准送人审
    if (child.axis_std === parent.axis_std) {
      if (!isAxisAncestor(child.axis_std, parent.axis_code, child.axis_code)) {
        fatal.push(`单调归属破坏（同标准 ${child.axis_std}）：父 axis ${parent.axis_code} 非子 ${child.axis_code} 的真祖先`);
      }
    } else {
      human.push(`跨标准挂载：父 ${parent.axis_std}:${parent.axis_code} → 子 ${child.axis_std}:${child.axis_code}，机器不可判，须 crosswalk 证明或人工裁定`);
    }
  }

  return { fatal, human };
}

/** 全量扫描：以随行父集合建索引，逐边校验，返回所有非清白节点 */
export function collectEdgeViolations(rows: FusionRow[]): Array<{ code: string } & EdgeVerdict> {
  const idx = new Map(rows.map((r) => [r.code, r]));
  const out: Array<{ code: string } & EdgeVerdict> = [];
  for (const r of rows) {
    const parent = r.parent_code ? idx.get(r.parent_code) ?? null : null;
    const v = validateFusionEdge(r, parent);
    if (v.fatal.length || v.human.length) out.push({ code: r.code, ...v });
  }
  return out;
}

/** 是否存在硬失败（供门禁/工具一票否决） */
export function hasFatal(violations: Array<Pick<EdgeVerdict, "fatal">>): boolean {
  return violations.some((v) => v.fatal.length > 0);
}

/** 按旧大类聚合 L1（供 FU2 大类只增不减核对） */
export function groupL1Coverage(rows: FusionRow[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const r of rows) {
    if (r.level !== 1) continue;
    const arr = map.get(r.group_code) ?? [];
    arr.push(r.code);
    map.set(r.group_code, arr);
  }
  return map;
}
