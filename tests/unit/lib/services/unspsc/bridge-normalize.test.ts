/**
 * UNSPSC 桥表入库路径归一 —— 纯函数单测
 *
 * 钉住四条铁则（2026-10-10 桥表档0/档1 治理时实测现网形态固化）：
 *   1. 可信值一律不动 —— 尤其孪生节点（旧字典 17 个重复码），绝不能把有效路径改到同码另一节点；
 *   2. 不可信值（0 / 空串 / 悬空 id / 层级错配 / 码前缀）按字典父链补齐或修正；
 *   3. 空值写法按目标表收敛 —— 公告桥表 NULL、商机桥表空串（列 NOT NULL）；
 *   4. code 无法在字典定位时整行原样保留（不销毁上游数据）。
 */
import { describe, it, expect } from "vitest";
import {
  BRIDGE_PATH_COLUMNS,
  BRIDGE_NORMALIZE_POLICIES,
  buildUnspscDictIndex,
  normalizeBridgePathRow,
  applyBridgeNormalize,
  toDictIdOrNull,
  type UnspscDictRow,
} from "@/lib/services/unspsc/bridge-normalize";

/** 贴近现网形态的字典夹具：字母大类（level1）+ 8 位码各层 + 孪生节点 + 跨分支同码节点 */
const DICT_ROWS: UnspscDictRow[] = [
  { id: 103, code: "D", level: 1, parent_id: 0 },
  { id: 106, code: "G", level: 1, parent_id: 0 },
  { id: 109, code: "J", level: 1, parent_id: 0 },
  { id: 107363, code: "80000000", level: 2, parent_id: 109 },
  { id: 107364, code: "80100000", level: 3, parent_id: 107363 },
  { id: 108670, code: "80101500", level: 4, parent_id: 107364 },
  // 同码但挂在另一分支的节点（验证下移起点不会跳到外分支）
  { id: 777777, code: "70000000", level: 2, parent_id: 106 },
  { id: 900000, code: "80101500", level: 4, parent_id: 777777 },
  // 孪生节点：同码不同 id
  { id: 202112, code: "80000000", level: 2, parent_id: 109 },
  { id: 104789, code: "43000000", level: 2, parent_id: 106 },
  { id: 117411, code: "43220000", level: 3, parent_id: 104789 },
  { id: 111014, code: "43221500", level: 4, parent_id: 117411 },
];
const dict = buildUnspscDictIndex(DICT_ROWS);

/** 公告桥表口径（整型列 + NULL 空值） */
const NOTICE = BRIDGE_NORMALIZE_POLICIES.crm_bid_notice_unspsc_codes;
/** 商机桥表口径（varchar 列 + 空串） */
const OPPORTUNITY = BRIDGE_NORMALIZE_POLICIES.crm_bid_opportunity_unspsc_codes;

/** 组装一行桥表数据（未给出的层视为 NULL） */
const rowOf = (code: string, path: unknown[] = []): Record<string, unknown> => ({
  code,
  ...Object.fromEntries(BRIDGE_PATH_COLUMNS.map((c, i) => [c, path[i] ?? null])),
});

describe("toDictIdOrNull · 空形态归一", () => {
  it("null / undefined / 空串 / 0 / 非数字一律为 null", () => {
    expect(toDictIdOrNull(null)).toBeNull();
    expect(toDictIdOrNull(undefined)).toBeNull();
    expect(toDictIdOrNull("")).toBeNull();
    expect(toDictIdOrNull(0)).toBeNull();
    expect(toDictIdOrNull("0")).toBeNull();
    expect(toDictIdOrNull("J")).toBeNull();
  });

  it("数字与数字字符串都解析为 id", () => {
    expect(toDictIdOrNull(109)).toBe(109);
    expect(toDictIdOrNull("107363")).toBe(107363);
  });
});

describe("normalizeBridgePathRow · 可信值不动", () => {
  it("整行可信 → 不改写", () => {
    expect(normalizeBridgePathRow(rowOf("80101500", [109, 107363, 107364, 108670, null]), dict, NOTICE))
      .toEqual({ changed: false, values: {} });
  });

  it("孪生节点保护：行内已挂同码另一有效节点时绝不改写", () => {
    const out = normalizeBridgePathRow(rowOf("80000000", [109, 202112, null, null, null]), dict, NOTICE);
    expect(out.changed).toBe(false);
  });

  it("下移起点只认同分支：同码另一分支的更深节点不得拿来用", () => {
    // 字典里同一码有两个深层节点：一个父链经过本行已证实的节点，另一个挂在无关分支下
    const out = normalizeBridgePathRow(rowOf("80101500", [109, 107363, 107364, 0, 0]), dict, NOTICE);
    expect(out.values.level4_id).toBe(108670);
  });
});

describe("normalizeBridgePathRow · 补缺与修坏", () => {
  it("伪 0 收敛为 NULL（公告桥表口径）", () => {
    const out = normalizeBridgePathRow(rowOf("80101500", [109, 107363, 107364, 108670, 0]), dict, NOTICE);
    expect(out.changed).toBe(true);
    expect(out.values).toEqual({ level5_id: null });
  });

  it("整行空 → 按字典父链补齐", () => {
    const out = normalizeBridgePathRow(rowOf("80101500"), dict, NOTICE);
    expect(out.values).toEqual({ level1_id: 109, level2_id: 107363, level3_id: 107364, level4_id: 108670 });
  });

  it("码前缀口径 → 归一为字典 id（现网实测形态 43 / 4322 / 432215 / 43221500）", () => {
    const out = normalizeBridgePathRow(rowOf("43221500", [43, 4322, 432215, 43221500, 0]), dict, NOTICE);
    expect(out.values).toEqual({
      level1_id: 106, level2_id: 104789, level3_id: 117411, level4_id: 111014, level5_id: null,
    });
  });

  it("悬空 id → 用派生值修正", () => {
    const out = normalizeBridgePathRow(rowOf("80101500", [999999, 107363, 107364, 108670, null]), dict, NOTICE);
    expect(out.values).toEqual({ level1_id: 109 });
  });

  it("层级错配（level3 列放了 level4 节点）→ 修正", () => {
    const out = normalizeBridgePathRow(rowOf("80101500", [109, 107363, 108670, 108670, null]), dict, NOTICE);
    expect(out.values).toEqual({ level3_id: 107364 });
  });

  it("部分可信：以本行最深层可信节点为起点，并由 code 补齐更深的列", () => {
    const out = normalizeBridgePathRow(rowOf("80101500", [null, null, 107364, 0, 0]), dict, NOTICE);
    expect(out.values).toEqual({
      level1_id: 109, level2_id: 107363, level4_id: 108670, level5_id: null,
    });
  });

  it("code 不在字典且整行不可信 → 原样保留（不销毁上游数据）", () => {
    const out = normalizeBridgePathRow(rowOf("23181519", [23, 2318, 231815, 23181519, null]), dict, NOTICE);
    expect(out.changed).toBe(false);
  });
});

describe("normalizeBridgePathRow · 身份闸口（防字典 id 与码切片撞车）", () => {
  it("code 不在字典、但行内值恰好撞上同层级字典 id → 整行不动", () => {
    // 现网实测形态：10 位脏码 1025101500 的第 3 段切片 102510 与字典 id 撞车且层级也对得上；
    // 此处用夹具里真实存在的 level3 节点 107364 复现同一局面。
    const out = normalizeBridgePathRow(rowOf("8010159999", [null, null, 107364, null, null]), dict, NOTICE);
    expect(out).toEqual({ changed: false, values: {} });
  });

  it("同一撞车值，换成字典里存在的 code 后照旧补齐（证明闸口只拦身份不拦派生）", () => {
    const out = normalizeBridgePathRow(rowOf("80101500", [null, null, 107364, null, null]), dict, NOTICE);
    expect(out.changed).toBe(true);
    expect(out.values.level1_id).toBe(109);
  });

  it("商机桥表同口径：脏码行不被收敛为空串", () => {
    const out = normalizeBridgePathRow(rowOf("1025101500", ["10", "1025", "102510", "10251015", "1025101500"]), dict, OPPORTUNITY);
    expect(out).toEqual({ changed: false, values: {} });
  });
});

describe("normalizeBridgePathRow · 商机桥表口径（varchar + 空串）", () => {
  it("码前缀与伪 0 → 字符串 id 与空串", () => {
    const out = normalizeBridgePathRow(rowOf("43221500", ["30", "4322", "432215", "43221500", "0"]), dict, OPPORTUNITY);
    expect(out.values).toEqual({
      level1_id: "106", level2_id: "104789", level3_id: "117411", level4_id: "111014", level5_id: "",
    });
  });

  it("已是字符串 id 的可信值不动", () => {
    const out = normalizeBridgePathRow(rowOf("80101500", ["109", "107363", "107364", "108670", ""]), dict, OPPORTUNITY);
    expect(out.changed).toBe(false);
  });

  it("字符串伪 0 收敛为空串", () => {
    const out = normalizeBridgePathRow(rowOf("80101500", ["109", "107363", "107364", "108670", "0"]), dict, OPPORTUNITY);
    expect(out.values).toEqual({ level5_id: "" });
  });
});

describe("applyBridgeNormalize · 管道入口", () => {
  it("无需改写时返回原对象引用（零拷贝）", () => {
    const row = rowOf("80101500", [109, 107363, 107364, 108670, null]);
    expect(applyBridgeNormalize(row, dict, NOTICE)).toBe(row);
  });

  it("需改写时返回浅拷贝，不改源行", () => {
    const row = rowOf("80101500", [109, 107363, 107364, 108670, 0]);
    const next = applyBridgeNormalize(row, dict, NOTICE);
    expect(next).not.toBe(row);
    expect(next.level5_id).toBeNull();
    expect(row.level5_id).toBe(0);
  });
});

describe("BRIDGE_NORMALIZE_POLICIES · 两表口径声明", () => {
  it("公告桥表整型 + NULL，商机桥表字符串 + 空串", () => {
    expect(NOTICE).toEqual({ idKind: "number", emptyValue: null });
    expect(OPPORTUNITY).toEqual({ idKind: "string", emptyValue: "" });
  });
});
