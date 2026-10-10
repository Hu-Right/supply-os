/**
 * 品目树重排 + 中文回灌（纯函数，无 DB 依赖，可单测）
 * Commodity Tree Renumber & Name-zh Seed (pure)
 *
 * @module lib/services/commodity-renumber
 * @description 输入=旧表扁平行（code/src_code/level/parent_code 旧语义），
 *              输出=新表行（顺排 code、unspsc_code、新 parent_code）。
 *              规则：每父下子节点按 src_code 升序从 01 顺排；码长即层级；父指针指向新父码。
 *              影子表构建脚本（scripts/ops/commodity-shadow-build.mjs）复用本模块，写库前先离线自检。
 */
import { COMMODITY_CODE_PREFIX } from "./commodity-code";

export type CommodityLevelName = "segment" | "family" | "class" | "commodity" | "extension";

/** 旧表读出的一行（最小字段） */
export interface FlatNode {
  id: number;
  oldCode: string; // 旧 code = UGT-C- + 8 位
  srcCode: string; // 旧 src_code = 8 位 UNSPSC 原码
  level: CommodityLevelName;
  parentCode: string | null; // 旧 parent_code（板块为 null）
  nameZh: string | null;
}

/** 重排后写入影子表的一行（新语义） */
export interface RenumberedNode {
  id: number;
  code: string; // 新顺排码
  unspscCode: string; // = 旧 srcCode
  level: CommodityLevelName;
  parentCode: string | null; // 新父码（板块为 null）
  nameZh: string | null;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * 把扁平旧表行重排为顺排树码。
 * 同父按 src_code 升序编号（与旧稀疏顺序一致，稳定可复现），板块级同样按 src_code 排。
 */
export function renumberCommodityTree(rows: FlatNode[]): RenumberedNode[] {
  const kidsByParent = new Map<string, FlatNode[]>();
  const roots: FlatNode[] = [];
  for (const r of rows) {
    if (!r.parentCode) {
      roots.push(r);
      continue;
    }
    const arr = kidsByParent.get(r.parentCode) ?? [];
    arr.push(r);
    kidsByParent.set(r.parentCode, arr);
  }
  const bySrc = (a: FlatNode, b: FlatNode) =>
    a.srcCode < b.srcCode ? -1 : a.srcCode > b.srcCode ? 1 : 0;
  roots.sort(bySrc);
  for (const arr of kidsByParent.values()) arr.sort(bySrc);

  const out: RenumberedNode[] = [];
  const walk = (node: FlatNode, numeric: string, newParent: string | null) => {
    out.push({
      id: node.id,
      code: COMMODITY_CODE_PREFIX + numeric,
      unspscCode: node.srcCode,
      level: node.level,
      parentCode: newParent,
      nameZh: node.nameZh,
    });
    const kids = kidsByParent.get(node.oldCode) ?? [];
    kids.forEach((k, i) => walk(k, numeric + pad2(i + 1), COMMODITY_CODE_PREFIX + numeric));
  };
  roots.forEach((r, i) => walk(r, pad2(i + 1), null));
  return out;
}

/** 中文回灌：按 src_code 命中 seed 且当前为空才填，绝不覆盖已有译名 */
export function seedNameZh<T extends { srcCode: string; nameZh: string | null }>(
  rows: T[],
  seed: Map<string, string>,
): T[] {
  return rows.map((r) => {
    if (r.nameZh && r.nameZh.trim() !== "") return r;
    const hit = seed.get(r.srcCode);
    return hit ? { ...r, nameZh: hit } : r;
  });
}
