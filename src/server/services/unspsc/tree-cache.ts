/**
 * UNSPSC 类目树内存缓存
 * UNSPSC category tree in-memory cache
 *
 * @module server/services/unspsc/tree-cache
 * @description 消除桥接表同步中的 N+1 查询。
 *              crm_unspsc_codes 全表约 10K-15K 条记录，内存占用 ~1-2 MB。
 *              类目树是联合国标准分类，几乎不变；缓存在全量回填开始时一次性加载。
 */
import "server-only";
import type { RowDataPacket } from "mysql2/promise";

interface CachedUnspscNode {
  id: number;
  code: string;
  level: number;
  parentId: number | null;
}

let _unspscTreeById: Map<number, CachedUnspscNode> | null = null;
let _unspscCodeToId: Map<string, number> | null = null;

/**
 * 加载 UNSPSC 类目树到内存（幂等：已加载则直接返回 true）
 */
export async function loadUnspscCache(dbPool: any): Promise<boolean> {
  if (_unspscTreeById && _unspscCodeToId) return true;
  try {
    const [rows] = await dbPool.query("SELECT id, code, level, parent_id FROM crm_unspsc_codes");
    _unspscTreeById = new Map();
    _unspscCodeToId = new Map();
    for (const row of rows as RowDataPacket[]) {
      const id = Number(row.id);
      _unspscTreeById.set(id, {
        id,
        code: String(row.code),
        level: Number(row.level),
        parentId: row.parent_id != null ? Number(row.parent_id) : null,
      });
      _unspscCodeToId.set(String(row.code), id);
    }
    console.log(`[unspsc-cache] 类目树缓存加载完成: ${_unspscTreeById.size} 条`);
    return true;
  } catch (err) {
    console.warn(`[unspsc-cache] 缓存加载失败（降级到逐行查询）: ${(err as Error).message}`);
    _unspscTreeById = null;
    _unspscCodeToId = null;
    return false;
  }
}

/**
 * 从内存缓存回溯 UNSPSC 类目路径（替代 getUnspscPath 的 6 次 SQL → 0 次 SQL）
 */
export function getPathFromCache(codeId: number): {
  level1_id: number | null; level2_id: number | null; level3_id: number | null;
  level4_id: number | null; level5_id: number | null;
} {
  const path = { level1_id: null as number | null, level2_id: null as number | null, level3_id: null as number | null, level4_id: null as number | null, level5_id: null as number | null };
  if (!_unspscTreeById) return path;
  let currentId: number | null = codeId;
  for (let i = 0; i < 6 && currentId; i++) {
    const node = _unspscTreeById.get(currentId);
    if (!node) break;
    if (node.level >= 1 && node.level <= 5) {
      path[`level${node.level}_id` as keyof typeof path] = node.id;
    }
    currentId = node.parentId;
  }
  return path;
}

/**
 * 通过缓存查找 code → id（缓存未加载时返回 undefined）
 */
export function getCodeIdFromCache(code: string): number | undefined {
  return _unspscCodeToId?.get(code);
}

/**
 * 通过缓存查找类目 level（缓存未加载时返回 undefined）
 */
export function getUnspscLevelFromCache(codeId: number): number | undefined {
  return _unspscTreeById?.get(codeId)?.level;
}

/**
 * 清除类目树缓存（测试/管理用途）
 */
export function clearUnspscCache(): void {
  _unspscTreeById = null;
  _unspscCodeToId = null;
}
