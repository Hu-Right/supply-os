/**
 * 融合树 · 结构脚手架内核（纯函数，零查库、零现网、零语义伪造）
 * Fusion Ingest / Scaffolder
 *
 * @module lib/services/commodity/fusion-ingest
 * @description 给定一棵子树"主轴标准 + 根码 + 该标准的一批记录（码/名）"，按各标准**官方的父子规则**
 *   （fusion-standards.stdParentCode）把记录铺成结构绝对正确的 UGT 骨架：
 *     · tree level = 1 + (std 层 - 根 axis 层)；父 UGT 码 = 其 std 父记录已分配的 UGT 码；
 *     · 子在同一 std 父下按 std 码升序取 001.. 序号（确定可重放）。
 *   产出的每条边都由 stdParentCode 反推，故 FU4 单调归属**天然成立**（用 validateFusionEdge 复核）。
 *   ⚠ 本内核只做"结构/父系"，不做语义：name 直接搬运输入、attach_status 一律 pending，
 *     语义正名与"是否真属于该父"仍由人审（见 fusion-apply-approvals）。绝不猜码、绝不补不存在中间层——
 *     父记录缺失的，记 orphan 交人工。
 */
import { fusionNodeLevel } from "./fusion-path";
import { stdLevel, stdParentCode, normalizeStdCode, type StdKey } from "./fusion-standards";
import type { FusionRow } from "./fusion-tree";

/** 一份标准导出记录（来自 P1 原始料，未做任何语义加工） */
export interface StdRecord {
  code: string;
  name_zh: string;
  name_en?: string;
}

export interface ScaffoldParams {
  /** 子树根的 UGT 码（大类层，形如 UGT-043） */
  rootCode: string;
  /** 主轴标准 */
  axisStd: StdKey;
  /** 根在主轴标准里的规范码（如 UNSPSC 段 "10"） */
  rootAxisCode: string;
  /** 旧大类归属（UGT-G-NN），整棵子树共享 */
  groupCode: string;
  /** 该标准下属于本子树的记录（含所有中间层；不含根本身） */
  records: StdRecord[];
}

export interface ScaffoldResult {
  nodes: FusionRow[]; // 含根；全部 attach_status/name_status = pending 由调用方落列
  byCode: Map<string, string>; // std 有效码 → UGT 码（供 xwalk 关联）
  orphans: Array<{ code: string; reason: string }>; // 父记录缺失/非法/越层
}

/** 需按标准取父：把 axisStd 闭包进来 */
function makeParentOf(axisStd: StdKey) {
  return (code: string): string => stdParentCode(axisStd, code);
}

/** 归一去重：同 std 有效码多条，保留首条并记冲突 */
function dedupe(records: StdRecord[], axisStd: StdKey): { recs: Array<{ sig: string; level: number; rec: StdRecord }>; conflicts: string[] } {
  const seen = new Map<string, StdRecord>();
  const conflicts: string[] = [];
  const recs: Array<{ sig: string; level: number; rec: StdRecord }> = [];
  for (const r of records) {
    const level = stdLevel(axisStd, r.code);
    if (level === 0) continue; // 非法码：不参与结构（父记录缺失时会作为其子孙的 orphan 体现）
    const sig = sigOf(r.code, axisStd);
    if (seen.has(sig)) { conflicts.push(sig); continue; }
    seen.set(sig, r);
    recs.push({ sig, level, rec: r });
  }
  return { recs, conflicts };
}

function sigOf(code: string, axisStd: StdKey): string {
  return normalizeStdCode(axisStd, code).sig;
}

/** 按 std 层分组，便于自根向下逐层赋值 */
function groupByLevel(recs: Array<{ sig: string; level: number; rec: StdRecord }>): Map<number, Array<{ sig: string; level: number; rec: StdRecord }>> {
  const m = new Map<number, typeof recs>();
  for (const r of recs) {
    const arr = m.get(r.level) ?? [];
    arr.push(r);
    m.set(r.level, arr);
  }
  return m;
}

/**
 * 铺骨架：根 → 逐 std 层向下，父 UGT 由 std 父记录已分配的码推出；缺父即 orphan。
 * tree level = 1 + (std level - 根 std level)。
 */
export function scaffoldSubtree(params: ScaffoldParams): ScaffoldResult {
  const { rootCode, axisStd, rootAxisCode, groupCode, records } = params;
  const parentOf = makeParentOf(axisStd);
  const rootSig = sigOf(rootAxisCode, axisStd);
  const rootStdLevel = stdLevel(axisStd, rootAxisCode);
  if (fusionNodeLevel(rootCode) !== 1) {
    return { nodes: [], byCode: new Map(), orphans: [{ code: rootCode, reason: "根码必须是大类 L1" }] };
  }
  if (rootStdLevel === 0) {
    return { nodes: [], byCode: new Map(), orphans: [{ code: rootAxisCode, reason: "根 axis 码在该标准非法" }] };
  }

  const { recs, conflicts } = dedupe(records, axisStd);
  const nodes: FusionRow[] = [{
    code: rootCode, parent_code: "", level: 1, group_code: groupCode,
    axis_std: axisStd, axis_code: rootSig, name_zh: "", name_en: "",
  }];
  const byCode = new Map<string, string>([[rootSig, rootCode]]);
  const orphans: Array<{ code: string; reason: string }> = conflicts.map((c) => ({ code: c, reason: "同码重复（应一码一节点），已保留首条" }));

  const levels = [...groupByLevel(recs).keys()].sort((a, b) => a - b); // 由浅入深
  const byLevel = groupByLevel(recs);
  for (const stdLevelNum of levels) {
    if (stdLevelNum <= rootStdLevel) { orphans.push(...(byLevel.get(stdLevelNum) ?? []).map((r) => ({ code: r.sig, reason: `std 层 ${stdLevelNum} 不深于根层 ${rootStdLevel}` }))); continue; }
    const treeLevel = 1 + (stdLevelNum - rootStdLevel);
    // 该层所有成员按 std 父分组，父内按码升序赋序号
    const groups = new Map<string, string[]>();
    for (const r of byLevel.get(stdLevelNum) ?? []) {
      const psig = parentOf(r.rec.code);
      const arr = groups.get(psig) ?? [];
      arr.push(r.sig);
      groups.set(psig, arr);
    }
    for (const [psig, sigs] of groups) {
      sigs.sort();
      const parentUgt = byCode.get(psig);
      if (!parentUgt) {
        orphans.push(...sigs.map((s) => ({ code: s, reason: `父记录 ${psig} 不存在/未赋值（缺中间层）` })));
        continue;
      }
      sigs.forEach((sig, idx) => {
        const seq = String(idx + 1).padStart(3, "0");
        const ugt = `${parentUgt}${seq}`;
        const rec = byLevel.get(stdLevelNum)!.find((r) => r.sig === sig)!.rec;
        byCode.set(sig, ugt);
        nodes.push({
          code: ugt, parent_code: parentUgt, level: treeLevel, group_code: groupCode,
          axis_std: axisStd, axis_code: sig, name_zh: rec.name_zh, name_en: rec.name_en ?? "",
        });
      });
    }
  }
  return { nodes, byCode, orphans };
}
