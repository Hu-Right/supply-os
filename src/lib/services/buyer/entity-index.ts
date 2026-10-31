/**
 * 买家实体索引：原始机构写法 → buyer 实体（唯一解析入口）
 *
 * @module lib/services/buyer/entity-index
 * @description 2026-10-31「机构口径收敛」后的唯一实体匹配口径：以 `buyer`（实体）+
 *              `buyer_alias`（别名）为准，用 {@link normalizeBuyerKey} 归一后建进程内索引，
 *              供服务表构建器 `notice-public/build.ts` 一次性装载、逐行解析。
 *
 *              设计取舍（宁缺毋假）：
 *              - **国家优先**：实体以 (canonical_name, country_code) 为粒度；先按
 *                `国家码|归一键` 精确命中。同名跨国的机构（UNDP/ADB 等）因此不会被并成一个。
 *              - **唯一回退**：国家维未命中时，仅当该归一键在全局**恰好对应一个实体**才回退命中；
 *                多个实体（如各国同名的 "Ministry of Health"）一律不猜，交买家候选队列人工判读。
 *              - **冲突显式化**：同一 `国家码|归一键` 在 buyer_alias 里映射到不同 buyer_id
 *                （历史脏数据，实测 116 组）标记为歧义；歧义键优先用 canonical_name 命中的
 *                实体收敛（实体名命中比别名撞车更可信），同国同名重复实体取 buyer_id 最小者
 *                保证确定性；仍无法收敛才返回 null，不再像旧实现那样由 Map 后者覆盖前者、
 *                静默挂到随机实体上。
 *
 *              索引里额外登记 `buyer.canonical_name` 本身（与规格化别名同键）：旧管线
 *              依赖 agency_aliases 把写法折成 canonical 再匹配；新管线直接拿原始名 + canonical
 *              两条路都试，避免 alias 行缺失时实体失联。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { normalizeBuyerKey } from "./normalize";

/** 解析出的买家实体（服务表投影所需的全部字段） */
export interface BuyerEntity {
  buyerId: number;
  canonical: string;
  nameZh: string | null;
  group: string | null;
}

/** 买家实体索引的统计信息（供构建日志/诊断；不参与业务判定） */
export interface BuyerEntityIndexStats {
  /** 装载的别名行数 */
  aliasRows: number;
  /** 去重后的实体数 */
  entities: number;
  /** 同国+归一别名冲突（歧义，不解析）键数 */
  ambiguousKeys: number;
}

export interface BuyerEntityIndex {
  /** `${国家码}|${归一键}` → 实体；值为 null 表示冲突歧义（不解析） */
  byCountry: Map<string, BuyerEntity | null>;
  /** 归一键 → 实体列表（供“全局唯一”回退） */
  byName: Map<string, BuyerEntity[]>;
  /** `${国家码}|${canonical_name 归一键}` → 实体（歧义时的确定性收敛依据） */
  byCanonical: Map<string, BuyerEntity[]>;
  stats: BuyerEntityIndexStats;
}

const EMPTY_INDEX: BuyerEntityIndex = {
  byCountry: new Map(),
  byName: new Map(),
  byCanonical: new Map(),
  stats: { aliasRows: 0, entities: 0, ambiguousKeys: 0 },
};

/** 服务端返回的行形状（buyer_alias ⋈ buyer） */
interface BuyerAliasRow extends RowDataPacket {
  alias: string | null;
  country_code: string | null;
  buyer_id: number | string;
  canonical_name: string | null;
  name_zh: string | null;
  buyer_group: string | null;
}

/** buyer 实体行（含没有别名行的实体） */
interface BuyerRow extends RowDataPacket {
  buyer_id: number | string;
  canonical_name: string | null;
  country_code: string | null;
  name_zh: string | null;
  buyer_group: string | null;
}

function toEntity(row: BuyerAliasRow | BuyerRow): BuyerEntity {
  return {
    buyerId: Number(row.buyer_id),
    canonical: String(row.canonical_name ?? "").trim(),
    nameZh: row.name_zh ? String(row.name_zh) : null,
    group: row.buyer_group ? String(row.buyer_group) : null,
  };
}

/**
 * 从数据库装载买家实体索引（构建上下文批间复用）。
 *
 * 两次 SELECT：① 全部 active 实体（含**没有别名行的实体**——历史批次直接建档的机构
 * 只有 canonical_name，若只读 buyer_alias 会把它们整体漏掉）；② 别名行（原始写法 → 实体）。
 *
 * 只认 `buyer.status = 'active'` 的实体：停用实体不应再被新公告挂上；
 * 旧行仍保留原 buyer_id，重建时若实体被停用会落回未匹配（可视化在候选队列里暴露）。
 */
export async function loadBuyerEntityIndex(pool: Pool): Promise<BuyerEntityIndex> {
  let buyerRows: BuyerRow[];
  let aliasRows: BuyerAliasRow[];
  try {
    const [buyers] = await pool.query<BuyerRow[]>(
      `SELECT buyer_id, canonical_name, name_zh, buyer_group, country_code
         FROM buyer
        WHERE status = 'active'`,
    );
    buyerRows = buyers;
    const [aliases] = await pool.query<BuyerAliasRow[]>(
      `SELECT a.alias, a.country_code, b.buyer_id, b.canonical_name, b.name_zh, b.buyer_group
         FROM buyer_alias a
         JOIN buyer b ON b.buyer_id = a.buyer_id
        WHERE b.status = 'active'`,
    );
    aliasRows = aliases;
  } catch (err) {
    // 表未就绪（新环境建表前）/查询失败：降级为空索引，构建继续（全部落未匹配 → 候选队列）
    console.warn("[buyer] buyer 实体索引装载失败，本次按未匹配处理（降级）:", (err as Error).message);
    return { ...EMPTY_INDEX, byCountry: new Map(), byName: new Map(), byCanonical: new Map() };
  }

  const byCountry = new Map<string, BuyerEntity | null>();
  const byName = new Map<string, BuyerEntity[]>();
  const byCanonical = new Map<string, BuyerEntity[]>();
  const entityIds = new Set<number>();
  let ambiguousKeys = 0;

  const addAlias = (rawAlias: string | null, countryCode: string | null, entity: BuyerEntity): void => {
    const key = normalizeBuyerKey(rawAlias);
    if (!key) return;
    const cc = String(countryCode ?? "").trim().toUpperCase();
    const countryKey = `${cc}|${key}`;
    const existing = byCountry.get(countryKey);
    if (existing === undefined) {
      byCountry.set(countryKey, entity);
    } else if (existing === null || existing.buyerId !== entity.buyerId) {
      // 同国同归一键指向不同实体（或已是歧义）：显式标记为歧义；能否收敛由 canonical 命决定
      if (existing !== null) ambiguousKeys += 1;
      byCountry.set(countryKey, null);
    }
    // 全局名列表（按 buyer_id 去重；用于“唯一个体”回退）
    const list = byName.get(key);
    if (!list) {
      byName.set(key, [entity]);
    } else if (!list.some((e) => e.buyerId === entity.buyerId)) {
      list.push(entity);
    }
  };

  /** canonical_name 归一键（歧义时用于确定性收敛：实体名本身命中者优先）。 */
  const addCanonical = (countryCode: string | null, entity: BuyerEntity): void => {
    const key = normalizeBuyerKey(entity.canonical);
    if (!key) return;
    const cc = String(countryCode ?? "").trim().toUpperCase();
    const countryKey = `${cc}|${key}`;
    const list = byCanonical.get(countryKey);
    if (!list) {
      byCanonical.set(countryKey, [entity]);
    } else if (!list.some((e) => e.buyerId === entity.buyerId)) {
      list.push(entity);
    }
  };

  for (const row of buyerRows) {
    const entity = toEntity(row);
    if (!entity.buyerId || !entity.canonical) continue;
    entityIds.add(entity.buyerId);
    // canonical_name 作为命中键：无别名行的实体也能被「实体名本身」命中
    addAlias(entity.canonical, row.country_code, entity);
    addCanonical(row.country_code, entity);
  }
  for (const row of aliasRows) {
    const entity = toEntity(row);
    if (!entity.buyerId || !entity.canonical) continue;
    entityIds.add(entity.buyerId);
    addAlias(row.alias, row.country_code, entity);
  }

  return {
    byCountry,
    byName,
    byCanonical,
    stats: { aliasRows: aliasRows.length, entities: entityIds.size, ambiguousKeys },
  };
}

/**
 * 歧义收敛：歧义键若能由 canonical_name 本身唯一定位，则取该实体（实体名命中优先）；
 * 若同国存在多条**同名重复实体**（历史脏数据，39 组），取 buyer_id 最小者保证确定性
 * ——它们 canonical 相同、展示名/中文名通常也相同，丢归属比取重复项更伤展示。
 * 仍定位不到（纯别名撞车、canonical 也对不上）→ 返回 null，继续“不猜”。
 */
function resolveCanonicalTiebreak(byCanonical: Map<string, BuyerEntity[]>, countryKey: string): BuyerEntity | null {
  const list = byCanonical.get(countryKey);
  if (!list || list.length === 0) return null;
  if (list.length === 1) return list[0];
  return list.reduce((min, e) => (e.buyerId < min.buyerId ? e : min), list[0]);
}

/**
 * 解析原始机构写法 → 实体。
 *
 * 顺序：
 *   ① 国家维精确命中 → 直接返回；
 *   ② 国家维歧义（同国同归一键多实体）→ canonical 名命中的实体收敛；收敛不到 → null；
 *   ③ 国家维未登记 → 全局唯一实体回退；
 *   ④ 仍不可判定 → null（不猜；调用方保留原始名并登记 buyer_candidate）。
 *
 * 返回 null 表示「不猜」：调用方保留原始名、不写 buyer_id，由 `syncBuyerCandidates`
 * 登记候选，人工核验后补 buyer_alias 再重建。
 */
export function resolveBuyerEntity(
  index: BuyerEntityIndex,
  rawName: unknown,
  countryCode: string | null | undefined,
): BuyerEntity | null {
  const key = normalizeBuyerKey(rawName);
  if (!key) return null;
  const cc = String(countryCode ?? "").trim().toUpperCase();
  if (cc) {
    const countryKey = `${cc}|${key}`;
    const hit = index.byCountry.get(countryKey);
    if (hit) return hit;
    if (hit === null) return resolveCanonicalTiebreak(index.byCanonical, countryKey);
  }
  const candidates = index.byName.get(key);
  if (candidates?.length === 1) return candidates[0];
  // 同名跨多国但 canonical 在公告国家维唯一（实体名本身即键）→ 用 canonical 收敛
  if (cc) {
    const canonical = resolveCanonicalTiebreak(index.byCanonical, `${cc}|${key}`);
    if (canonical) return canonical;
  }
  return null;
}
